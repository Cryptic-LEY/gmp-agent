import { NextRequest, NextResponse } from 'next/server'
import {
  isSupportedProvider,
  resolveWechatRedirectUri,
  startThirdPartyLogin,
} from '@/lib/third-party-auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      provider?: string
      role?: string
      returnTo?: string
    }
    const provider = body.provider || 'wechat'

    if (!isSupportedProvider(provider)) {
      return NextResponse.json({ error: '暂不支持该第三方平台' }, { status: 400 })
    }

    const session = await startThirdPartyLogin(provider, {
      redirectUri: resolveWechatRedirectUri(req.headers),
      expectedRole: body.role,
      returnTo: body.returnTo,
    })

    return NextResponse.json({ ok: true, ...session })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '微信登录发起失败' },
      { status: 500 },
    )
  }
}
