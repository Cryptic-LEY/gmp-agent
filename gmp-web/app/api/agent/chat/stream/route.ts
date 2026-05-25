import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return new Response('Unauthorized', { status: 401 })
  if (!verifyToken(token)) return new Response('Invalid token', { status: 401 })

  const body = await req.json()

  const upstream = await fetch('http://localhost:8001/chat/tutor/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!upstream.ok) {
    return new Response('AI服务暂时不可用', { status: 503 })
  }

  // 直接透传 FastAPI 的 SSE 流
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
