import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/auth'

const AGENT_API_URL = process.env.AGENT_API_URL ?? 'http://127.0.0.1:8001'
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
}

function sseData(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function serviceUnavailable(message = 'AI 服务暂时不可用，请确认 gmp-api 已启动') {
  return new Response(sseData({ error: message, done: true }), {
    status: 200,
    headers: SSE_HEADERS,
  })
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return new Response('Unauthorized', { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return new Response('Invalid token', { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const teacherMode = body.audience === 'teacher' || payload.role === 'teacher' || payload.role === 'admin'
  const upstreamBody = {
    ...body,
    audience: teacherMode ? 'teacher' : body.audience,
  }

  try {
    const upstream = await fetch(`${AGENT_API_URL}/chat/tutor/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upstreamBody),
    })

    if (!upstream.ok || !upstream.body) {
      return serviceUnavailable()
    }

    const upstreamStream = upstream.body
    return new Response(new ReadableStream({
      async start(controller) {
        const reader = upstreamStream.getReader()
        const encoder = new TextEncoder()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
        } catch {
          controller.enqueue(encoder.encode(sseData({
            error: 'AI 服务连接中断，请稍后重试。',
            done: true,
          })))
        } finally {
          reader.releaseLock()
          controller.close()
        }
      },
    }), { headers: SSE_HEADERS })
  } catch {
    return serviceUnavailable()
  }
}
