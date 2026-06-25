import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { localizeOpenmaicPayload } from '@/lib/openmaic-localization'

// GET /api/openmaic/poll/[jobId]
// Proxies the polling request to OpenMAIC's job status endpoint.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { jobId } = await context.params
  const openmaicUrl = process.env.OPENMAIC_URL ?? 'http://localhost:3002'

  try {
    const upstream = await fetch(`${openmaicUrl}/api/generate-classroom/${jobId}`, {
      signal: AbortSignal.timeout(10_000),
    })
    const data = await upstream.json()
    return NextResponse.json(localizeOpenmaicPayload(data), { status: upstream.status })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[openmaic/poll/${jobId}] upstream error:`, msg)
    return NextResponse.json(
      { success: false, error: `OpenMAIC 服务连接失败：${msg}` },
      { status: 502 },
    )
  }
}
