import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { saveOnboardingResult, type OnboardingAnswerItem } from '@/lib/onboarding-results'

// POST /api/onboarding/submit
// Body: { edu_level, major, answers: [{question_id, answer}] }
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { edu_level, major, answers } = await req.json() as {
    edu_level?: string
    major?: string
    answers?: OnboardingAnswerItem[]
  }

  if (!edu_level || !major) return NextResponse.json({ error: '请先选择学历和专业方向' }, { status: 400 })
  if (!answers?.length) return NextResponse.json({ error: 'No answers' }, { status: 400 })

  const result = await saveOnboardingResult(payload.userId, edu_level, major, answers)
  return NextResponse.json(result)
}
