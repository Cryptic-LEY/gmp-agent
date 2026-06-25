import { NextRequest, NextResponse } from 'next/server'
import { consumeThirdPartyLoginSession } from '@/lib/third-party-auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { sessionId?: string }
    if (!body.sessionId) {
      return NextResponse.json({ error: '缺少微信登录会话' }, { status: 400 })
    }

    const result = await consumeThirdPartyLoginSession(body.sessionId)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '微信登录失败' },
      { status: 400 },
    )
  }
}
