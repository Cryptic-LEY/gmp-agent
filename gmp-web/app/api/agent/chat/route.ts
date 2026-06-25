import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

const AGENT_API_URL = process.env.AGENT_API_URL ?? 'http://127.0.0.1:8001'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const teacherMode = body.audience === 'teacher' || payload.role === 'teacher' || payload.role === 'admin'
  const upstreamBody = {
    ...body,
    audience: teacherMode ? 'teacher' : body.audience,
  }

  try {
    const resp = await fetch(`${AGENT_API_URL}/chat/tutor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upstreamBody),
    })

    const data = await resp.json().catch(() => ({ error: 'AI 服务返回异常' }))
    return NextResponse.json(data, { status: resp.ok ? 200 : 503 })
  } catch {
    return NextResponse.json({ error: 'AI 服务暂时不可用，请确认 gmp-api 已启动' }, { status: 503 })
  }
}
