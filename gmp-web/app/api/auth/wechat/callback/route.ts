import { NextRequest, NextResponse } from 'next/server'
import {
  completeWechatOAuthCallback,
  exchangeWechatCodeForProfile,
  findThirdPartyOAuthTarget,
  markThirdPartyOAuthFailed,
} from '@/lib/third-party-auth'

function redirectTo(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.url))
}

function loginFailurePath(message: string, status = 'failed') {
  return `/login?wechat=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}`
}

function bindFailurePath(sessionId: string) {
  return `/auth/wechat/bind/confirm?sessionId=${encodeURIComponent(sessionId)}`
}

export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get('state') || ''
  const code = req.nextUrl.searchParams.get('code') || ''
  const oauthError = req.nextUrl.searchParams.get('errmsg')
    || req.nextUrl.searchParams.get('error_description')
    || req.nextUrl.searchParams.get('error')

  if (!state) {
    return redirectTo(req, loginFailurePath('微信登录状态缺失，请重新扫码'))
  }

  const target = await findThirdPartyOAuthTarget(state)
  if (!target) {
    return redirectTo(req, loginFailurePath('微信登录状态不存在或已过期，请重新扫码'))
  }

  if (!code) {
    const message = oauthError || '你已取消微信授权，请重新扫码'
    await markThirdPartyOAuthFailed(state, message)
    return redirectTo(
      req,
      target.purpose === 'bind'
        ? bindFailurePath(target.sessionId)
        : loginFailurePath(message, 'cancelled'),
    )
  }

  try {
    const profile = await exchangeWechatCodeForProfile(code)
    const result = await completeWechatOAuthCallback(state, profile)
    return redirectTo(req, result.redirectPath)
  } catch (err) {
    const message = err instanceof Error ? err.message : '微信授权失败，请重新扫码'
    await markThirdPartyOAuthFailed(state, message)
    return redirectTo(
      req,
      target.purpose === 'bind'
        ? bindFailurePath(target.sessionId)
        : loginFailurePath(message),
    )
  }
}
