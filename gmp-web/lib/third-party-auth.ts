import { randomBytes } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/db'
import { signToken } from '@/lib/auth'
import { ensureAuthStorage } from '@/lib/auth-storage'

export type ThirdPartyProvider = 'wechat'
export type LoginRole = 'student' | 'teacher' | 'admin'

const DEFAULT_BIND_RETURN_TO = '/profile?tab=apps'
const LOGIN_EXPIRES_SECONDS = 600
const BIND_EXPIRES_SECONDS = 600

interface BindingRow {
  provider: ThirdPartyProvider
  provider_user_id: string
  provider_display_name: string | null
  provider_avatar_url: string | null
  bound_at: string
  last_login_at: string | null
}

interface OAuthTarget {
  purpose: 'bind' | 'login'
  sessionId: string
  returnTo: string | null
}

interface WechatProfile {
  providerUserId: string
  displayName: string | null
  avatarUrl: string | null
  openid: string
  unionid: string | null
}

interface LoginUserRow {
  user_id: string
  email: string
  display_name: string
  role: string
  org_id: string
  onboarding_completed: number
}

export function isSupportedProvider(provider: string): provider is ThirdPartyProvider {
  return provider === 'wechat'
}

function isLoginRole(role: unknown): role is LoginRole {
  return role === 'student' || role === 'teacher' || role === 'admin'
}

function cleanMessage(message: string) {
  return message.replace(/\s+/g, ' ').trim().slice(0, 480)
}

function safeReturnTo(returnTo: unknown, fallback: string) {
  if (typeof returnTo !== 'string') return fallback
  const trimmed = returnTo.trim()
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback
  return trimmed.slice(0, 512)
}

export function resolveWechatRedirectUri(headers: Headers) {
  const configured = process.env.WECHAT_REDIRECT_URI?.trim()
  if (configured) return configured

  const host = headers.get('x-forwarded-host') ?? headers.get('host')
  if (!host) {
    throw new Error('微信 OAuth 未配置回调地址，请设置 WECHAT_REDIRECT_URI')
  }
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
  const proto = headers.get('x-forwarded-proto') ?? (isLocalHost ? 'http' : 'https')
  return `${proto}://${host}/api/auth/wechat/callback`
}

function wechatAppId() {
  const appId = process.env.WECHAT_APP_ID?.trim()
  if (!appId) {
    throw new Error('微信 OAuth 未配置 AppID，请设置 WECHAT_APP_ID')
  }
  return appId
}

function wechatAppSecret() {
  const secret = process.env.WECHAT_APP_SECRET?.trim()
  if (!secret) {
    throw new Error('微信 OAuth 未配置 AppSecret，请设置 WECHAT_APP_SECRET')
  }
  return secret
}

function buildWechatAuthUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({
    appid: wechatAppId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: process.env.WECHAT_OAUTH_SCOPE || 'snsapi_login',
    state,
  })
  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`
}

export async function exchangeWechatCodeForProfile(code: string): Promise<WechatProfile> {
  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token')
  tokenUrl.searchParams.set('appid', wechatAppId())
  tokenUrl.searchParams.set('secret', wechatAppSecret())
  tokenUrl.searchParams.set('code', code)
  tokenUrl.searchParams.set('grant_type', 'authorization_code')

  const tokenResponse = await fetch(tokenUrl)
  const tokenData = await tokenResponse.json() as {
    access_token?: string
    openid?: string
    unionid?: string
    errcode?: number
    errmsg?: string
  }

  if (!tokenResponse.ok || tokenData.errcode || !tokenData.access_token || !tokenData.openid) {
    throw new Error(`微信授权失败：${tokenData.errmsg || `HTTP ${tokenResponse.status}`}`)
  }

  const userInfoUrl = new URL('https://api.weixin.qq.com/sns/userinfo')
  userInfoUrl.searchParams.set('access_token', tokenData.access_token)
  userInfoUrl.searchParams.set('openid', tokenData.openid)
  userInfoUrl.searchParams.set('lang', 'zh_CN')

  const userInfoResponse = await fetch(userInfoUrl)
  const userInfo = await userInfoResponse.json() as {
    nickname?: string
    headimgurl?: string
    unionid?: string
    errcode?: number
    errmsg?: string
  }

  if (!userInfoResponse.ok || userInfo.errcode) {
    throw new Error(`微信用户信息获取失败：${userInfo.errmsg || `HTTP ${userInfoResponse.status}`}`)
  }

  const unionid = userInfo.unionid || tokenData.unionid || null
  const providerUserId = unionid ? `unionid:${unionid}` : `openid:${tokenData.openid}`

  return {
    providerUserId,
    displayName: userInfo.nickname || '微信用户',
    avatarUrl: userInfo.headimgurl || null,
    openid: tokenData.openid,
    unionid,
  }
}

export async function getThirdPartyBindings(userId: string) {
  await ensureAuthStorage()
  const rows = await db.raw.all<BindingRow>(`
    SELECT provider, provider_user_id, provider_display_name, provider_avatar_url, bound_at, last_login_at
    FROM user_third_party_bindings
    WHERE user_id = ?
  `, [userId])
  return rows
}

export async function startThirdPartyBind(
  userId: string,
  provider: ThirdPartyProvider,
  options: { redirectUri: string; returnTo?: string },
) {
  await ensureAuthStorage()

  const sessionId = uuidv4()
  const state = randomBytes(20).toString('hex')
  const returnTo = safeReturnTo(options.returnTo, DEFAULT_BIND_RETURN_TO)

  await db.raw.run(`
    INSERT INTO third_party_bind_sessions (session_id, user_id, provider, state, return_to, expires_at)
    VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND))
  `, [sessionId, userId, provider, state, returnTo, BIND_EXPIRES_SECONDS])

  return {
    sessionId,
    state,
    authUrl: buildWechatAuthUrl(state, options.redirectUri),
    expiresIn: BIND_EXPIRES_SECONDS,
    returnTo,
  }
}

export async function startThirdPartyLogin(
  provider: ThirdPartyProvider,
  options: { redirectUri: string; expectedRole?: unknown; returnTo?: string },
) {
  await ensureAuthStorage()

  const sessionId = uuidv4()
  const state = randomBytes(20).toString('hex')
  const expectedRole = isLoginRole(options.expectedRole) ? options.expectedRole : null
  const returnTo = safeReturnTo(options.returnTo, '')

  await db.raw.run(`
    INSERT INTO third_party_login_sessions
      (session_id, provider, state, expected_role, return_to, expires_at)
    VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND))
  `, [sessionId, provider, state, expectedRole, returnTo || null, LOGIN_EXPIRES_SECONDS])

  return {
    sessionId,
    state,
    authUrl: buildWechatAuthUrl(state, options.redirectUri),
    expiresIn: LOGIN_EXPIRES_SECONDS,
  }
}

export async function findThirdPartyOAuthTarget(state: string): Promise<OAuthTarget | null> {
  await ensureAuthStorage()

  const bind = await db.raw.get<{ session_id: string; return_to: string | null }>(`
    SELECT session_id, return_to
    FROM third_party_bind_sessions
    WHERE state = ?
    LIMIT 1
  `, [state])
  if (bind) {
    return { purpose: 'bind', sessionId: bind.session_id, returnTo: bind.return_to || DEFAULT_BIND_RETURN_TO }
  }

  const login = await db.raw.get<{ session_id: string; return_to: string | null }>(`
    SELECT session_id, return_to
    FROM third_party_login_sessions
    WHERE state = ?
    LIMIT 1
  `, [state])
  if (login) {
    return { purpose: 'login', sessionId: login.session_id, returnTo: login.return_to }
  }

  return null
}

export async function markThirdPartyOAuthFailed(state: string, message: string) {
  await ensureAuthStorage()
  const error = cleanMessage(message) || '微信授权失败，请重新扫码'

  await db.raw.run(`
    UPDATE third_party_bind_sessions
    SET callback_error = ?
    WHERE state = ? AND confirmed_at IS NULL
  `, [error, state])

  await db.raw.run(`
    UPDATE third_party_login_sessions
    SET callback_error = ?
    WHERE state = ? AND completed_at IS NULL
  `, [error, state])
}

export async function completeWechatOAuthCallback(state: string, profile: WechatProfile) {
  await ensureAuthStorage()

  const bindSession = await db.raw.get<{
    session_id: string
    provider: ThirdPartyProvider
    expires_at: string
    is_expired: number
    confirmed_at: string | null
  }>(`
    SELECT session_id, provider, expires_at, expires_at <= NOW(3) AS is_expired, confirmed_at
    FROM third_party_bind_sessions
    WHERE state = ?
    LIMIT 1
  `, [state])

  if (bindSession) {
    if (bindSession.is_expired || bindSession.confirmed_at) {
      await markThirdPartyOAuthFailed(state, '绑定二维码已失效，请重新发起绑定')
    } else {
      await db.raw.run(`
        UPDATE third_party_bind_sessions
        SET provider_user_id = ?,
            provider_display_name = ?,
            provider_avatar_url = ?,
            callback_error = NULL
        WHERE session_id = ?
      `, [profile.providerUserId, profile.displayName, profile.avatarUrl, bindSession.session_id])
    }
    return {
      purpose: 'bind' as const,
      sessionId: bindSession.session_id,
      redirectPath: `/auth/wechat/bind/confirm?sessionId=${encodeURIComponent(bindSession.session_id)}`,
    }
  }

  const loginSession = await db.raw.get<{
    session_id: string
    provider: ThirdPartyProvider
    expected_role: string | null
    is_expired: number
    completed_at: string | null
  }>(`
    SELECT session_id, provider, expected_role, expires_at <= NOW(3) AS is_expired, completed_at
    FROM third_party_login_sessions
    WHERE state = ?
    LIMIT 1
  `, [state])

  if (!loginSession) {
    throw new Error('微信登录状态不存在，请重新扫码')
  }

  await db.raw.run(`
    UPDATE third_party_login_sessions
    SET provider_user_id = ?,
        provider_display_name = ?,
        provider_avatar_url = ?
    WHERE session_id = ?
  `, [profile.providerUserId, profile.displayName, profile.avatarUrl, loginSession.session_id])

  if (loginSession.is_expired || loginSession.completed_at) {
    await markThirdPartyOAuthFailed(state, '微信登录二维码已失效，请重新扫码')
    return {
      purpose: 'login' as const,
      sessionId: loginSession.session_id,
      redirectPath: '/login?wechat=expired&message=%E5%BE%AE%E4%BF%A1%E7%99%BB%E5%BD%95%E4%BA%8C%E7%BB%B4%E7%A0%81%E5%B7%B2%E5%A4%B1%E6%95%88%EF%BC%8C%E8%AF%B7%E9%87%8D%E6%96%B0%E6%89%AB%E7%A0%81',
    }
  }

  const binding = await db.raw.get<{
    user_id: string
    role: string
  }>(`
    SELECT b.user_id, u.role
    FROM user_third_party_bindings b
    INNER JOIN users u ON u.user_id = b.user_id
    WHERE b.provider = ? AND b.provider_user_id = ?
    LIMIT 1
  `, [loginSession.provider, profile.providerUserId])

  if (!binding) {
    const message = '该微信尚未绑定平台账号，请先用账号密码登录后到个人中心绑定'
    await markThirdPartyOAuthFailed(state, message)
    return {
      purpose: 'login' as const,
      sessionId: loginSession.session_id,
      redirectPath: `/login?wechat=not_bound&message=${encodeURIComponent(message)}`,
    }
  }

  if (loginSession.expected_role && binding.role !== loginSession.expected_role) {
    const message = '所选登录角色与该微信绑定账号的角色不一致'
    await markThirdPartyOAuthFailed(state, message)
    return {
      purpose: 'login' as const,
      sessionId: loginSession.session_id,
      redirectPath: `/login?wechat=role_mismatch&message=${encodeURIComponent(message)}`,
    }
  }

  await db.raw.run(`
    UPDATE third_party_login_sessions
    SET user_id = ?, callback_error = NULL
    WHERE session_id = ?
  `, [binding.user_id, loginSession.session_id])

  await db.raw.run(`
    UPDATE user_third_party_bindings
    SET last_login_at = NOW(3)
    WHERE provider = ? AND provider_user_id = ?
  `, [loginSession.provider, profile.providerUserId])

  return {
    purpose: 'login' as const,
    sessionId: loginSession.session_id,
    redirectPath: `/auth/wechat/complete?sessionId=${encodeURIComponent(loginSession.session_id)}`,
  }
}

export async function getPendingThirdPartyBind(userId: string, sessionId: string) {
  await ensureAuthStorage()

  const session = await db.raw.get<{
    session_id: string
    provider: ThirdPartyProvider
    return_to: string | null
    provider_user_id: string | null
    provider_display_name: string | null
    provider_avatar_url: string | null
    callback_error: string | null
    expires_at: string
    is_expired: number
    confirmed: number
  }>(`
    SELECT session_id, provider, return_to, provider_user_id, provider_display_name,
           provider_avatar_url, callback_error, expires_at,
           expires_at <= NOW(3) AS is_expired,
           confirmed_at IS NOT NULL AS confirmed
    FROM third_party_bind_sessions
    WHERE session_id = ? AND user_id = ?
    LIMIT 1
  `, [sessionId, userId])

  if (!session) {
    throw new Error('绑定会话不存在，请重新发起绑定')
  }

  return {
    sessionId: session.session_id,
    provider: session.provider,
    returnTo: session.return_to || DEFAULT_BIND_RETURN_TO,
    providerUserId: session.provider_user_id,
    displayName: session.provider_display_name,
    avatarUrl: session.provider_avatar_url,
    error: session.callback_error,
    expiresAt: session.expires_at,
    expired: Boolean(session.is_expired),
    confirmed: Boolean(session.confirmed),
  }
}

export async function confirmThirdPartyBind(userId: string, provider: ThirdPartyProvider, sessionId: string) {
  await ensureAuthStorage()

  const session = await db.raw.get<{
    session_id: string
    return_to: string | null
    provider_user_id: string
    provider_display_name: string | null
    provider_avatar_url: string | null
    callback_error: string | null
    confirmed_at: string | null
  }>(`
    SELECT session_id, return_to, provider_user_id, provider_display_name, provider_avatar_url,
           callback_error, confirmed_at
    FROM third_party_bind_sessions
    WHERE session_id = ?
      AND user_id = ?
      AND provider = ?
      AND expires_at > NOW(3)
    LIMIT 1
  `, [sessionId, userId, provider])

  if (!session) {
    throw new Error('绑定会话已失效，请重新发起绑定')
  }
  if (session.callback_error) {
    throw new Error(session.callback_error)
  }
  if (!session.provider_user_id) {
    throw new Error('尚未收到微信授权结果，请重新扫码')
  }

  const existing = await db.raw.get<{ user_id: string }>(`
    SELECT user_id
    FROM user_third_party_bindings
    WHERE provider = ? AND provider_user_id = ?
    LIMIT 1
  `, [provider, session.provider_user_id])

  if (existing && existing.user_id !== userId) {
    throw new Error('该微信已绑定其他平台账号，请更换微信或先解绑')
  }

  await db.raw.run(`
    INSERT INTO user_third_party_bindings
      (user_id, provider, provider_user_id, provider_display_name, provider_avatar_url, bound_at)
    VALUES (?, ?, ?, ?, ?, NOW(3))
    ON DUPLICATE KEY UPDATE
      provider_user_id = VALUES(provider_user_id),
      provider_display_name = VALUES(provider_display_name),
      provider_avatar_url = VALUES(provider_avatar_url),
      bound_at = NOW(3)
  `, [userId, provider, session.provider_user_id, session.provider_display_name || '微信用户', session.provider_avatar_url])

  await db.raw.run(`
    UPDATE third_party_bind_sessions
    SET confirmed_at = NOW(3)
    WHERE session_id = ?
  `, [sessionId])

  return {
    returnTo: session.return_to || DEFAULT_BIND_RETURN_TO,
    displayName: session.provider_display_name || '微信用户',
    avatarUrl: session.provider_avatar_url,
  }
}

export async function consumeThirdPartyLoginSession(sessionId: string) {
  await ensureAuthStorage()

  const session = await db.raw.get<{
    session_id: string
    provider: ThirdPartyProvider
    user_id: string | null
    callback_error: string | null
    is_expired: number
    completed_at: string | null
  }>(`
    SELECT session_id, provider, user_id, callback_error, expires_at <= NOW(3) AS is_expired, completed_at
    FROM third_party_login_sessions
    WHERE session_id = ?
    LIMIT 1
  `, [sessionId])

  if (!session) {
    throw new Error('微信登录会话不存在，请重新扫码')
  }
  if (session.callback_error) {
    throw new Error(session.callback_error)
  }
  if (session.is_expired || session.completed_at) {
    throw new Error('微信登录会话已失效，请重新扫码')
  }
  if (!session.user_id) {
    throw new Error('微信登录尚未完成授权，请重新扫码')
  }

  const user = await db.raw.get<LoginUserRow>(`
    SELECT u.user_id, u.email, u.display_name, u.role, u.org_id,
           EXISTS(
             SELECT 1 FROM learning_plans lp
             WHERE lp.user_id = u.user_id
             LIMIT 1
           ) AS onboarding_completed
    FROM users u
    WHERE u.user_id = ?
    LIMIT 1
  `, [session.user_id])

  if (!user) {
    throw new Error('绑定的平台账号不存在')
  }

  await db.raw.run(`
    UPDATE third_party_login_sessions
    SET completed_at = NOW(3)
    WHERE session_id = ?
  `, [sessionId])

  await db.raw.run(`
    UPDATE user_third_party_bindings
    SET last_login_at = NOW(3)
    WHERE provider = ? AND user_id = ?
  `, [session.provider, user.user_id])

  const role = isLoginRole(user.role) ? user.role : 'student'
  const token = signToken({ userId: user.user_id, role, orgId: user.org_id })
  const onboardingCompleted = role !== 'student' || Boolean(user.onboarding_completed)

  return {
    token,
    userId: user.user_id,
    email: user.email,
    displayName: user.display_name,
    role,
    onboardingCompleted,
  }
}

export async function unbindThirdParty(userId: string, provider: ThirdPartyProvider) {
  await ensureAuthStorage()
  await db.raw.run(`
    DELETE FROM user_third_party_bindings
    WHERE user_id = ? AND provider = ?
  `, [userId, provider])
}
