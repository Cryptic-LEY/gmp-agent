import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const body = await req.json()
  const question = String(body.question ?? '')
  const teacherMode = body.audience === 'teacher' || payload.role === 'teacher' || payload.role === 'admin'
  const upstreamBody = {
    ...body,
    question: teacherMode
      ? [
        '请以GMP课程教师的教学支持视角回答下面问题。',
        '回答应优先服务教师备课、课堂讲解、案例讨论、学生错点诊断、题目设计和教学评价。',
        '涉及法规时仍需严格依据检索到的法规原文，不要编造条款。',
        `教师问题：${question}`,
      ].join('\n')
      : question,
  }
  delete upstreamBody.audience

  try {
    const resp = await fetch('http://localhost:8001/chat/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upstreamBody),
    })
    const data = await resp.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'AI服务暂时不可用，请稍后重试' }, { status: 503 })
  }
}
