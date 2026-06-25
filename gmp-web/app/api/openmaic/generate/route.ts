import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { enrichOpenmaicRequestWithCourseMaterials } from '@/lib/openmaic-course-context'
import { localizeOpenmaicPayload } from '@/lib/openmaic-localization'

// POST /api/openmaic/generate
// Proxies to the local OpenMAIC service to avoid browser CORS restrictions.
// Body: { requirement: string, enableWebSearch?, agentMode? }
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const openmaicUrl = process.env.OPENMAIC_URL ?? 'http://localhost:3002'

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const requestBody = body && typeof body === 'object' && !Array.isArray(body)
    ? await enrichOpenmaicRequestWithCourseMaterials(body as Record<string, unknown>, payload)
    : body

  try {
    const upstream = await fetch(`${openmaicUrl}/api/generate-classroom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(15_000),
    })
    const data = await upstream.json()
    return NextResponse.json(localizeOpenmaicPayload(data), { status: upstream.status })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[openmaic/generate] upstream error:', msg)
    return NextResponse.json(
      { success: false, error: `无法连接到 OpenMAIC 服务（${openmaicUrl}）：${msg}` },
      { status: 502 },
    )
  }
}
