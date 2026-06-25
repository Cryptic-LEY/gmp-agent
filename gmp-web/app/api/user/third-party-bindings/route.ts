import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import {
  confirmThirdPartyBind,
  getPendingThirdPartyBind,
  getThirdPartyBindings,
  isSupportedProvider,
  resolveWechatRedirectUri,
  startThirdPartyBind,
  unbindThirdParty,
} from '@/lib/third-party-auth'

const PROVIDERS = [
  {
    provider: 'wechat',
    label: '微信',
    description: '绑定后可使用微信扫码登录',
  },
] as const

function getBearerToken(req: NextRequest) {
  return req.headers.get('authorization')?.replace('Bearer ', '')
}

function requireUser(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return null
  return verifyToken(token)
}

export async function GET(req: NextRequest) {
  try {
    const payload = requireUser(req)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sessionId = req.nextUrl.searchParams.get('sessionId')
    if (sessionId) {
      const session = await getPendingThirdPartyBind(payload.userId, sessionId)
      return NextResponse.json({ ok: true, session })
    }

    const bindings = await getThirdPartyBindings(payload.userId)
    return NextResponse.json({
      providers: PROVIDERS.map(item => {
        const binding = bindings.find(row => row.provider === item.provider)
        return {
          ...item,
          bound: Boolean(binding),
          boundAt: binding?.bound_at ?? null,
          displayName: binding?.provider_display_name ?? null,
          avatarUrl: binding?.provider_avatar_url ?? null,
        }
      }),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '第三方绑定查询失败' },
      { status: 400 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireUser(req)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as {
      provider?: string
      action?: 'start' | 'confirm' | 'unbind'
      sessionId?: string
      returnTo?: string
    }
    if (!body.provider || !isSupportedProvider(body.provider)) {
      return NextResponse.json({ error: '暂不支持该第三方平台' }, { status: 400 })
    }

    if (body.action === 'start') {
      const session = await startThirdPartyBind(payload.userId, body.provider, {
        redirectUri: resolveWechatRedirectUri(req.headers),
        returnTo: body.returnTo,
      })
      return NextResponse.json({ ok: true, ...session })
    }

    if (body.action === 'confirm') {
      if (!body.sessionId) {
        return NextResponse.json({ error: '缺少绑定会话' }, { status: 400 })
      }
      const result = await confirmThirdPartyBind(payload.userId, body.provider, body.sessionId)
      return NextResponse.json({ ok: true, ...result })
    }

    if (body.action === 'unbind') {
      await unbindThirdParty(payload.userId, body.provider)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 })
  } catch (err) {
    console.error('third-party binding failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '第三方绑定操作失败' },
      { status: 500 },
    )
  }
}
