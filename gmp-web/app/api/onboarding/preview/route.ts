import { NextRequest, NextResponse } from 'next/server'
import { previewOnboardingResult, type OnboardingAnswerItem } from '@/lib/onboarding-results'

// POST /api/onboarding/preview
// Body: { edu_level, major, answers: [{question_id, answer}] }
export async function POST(req: NextRequest) {
  const { edu_level, major, answers } = await req.json() as {
    edu_level?: string
    major?: string
    answers?: OnboardingAnswerItem[]
  }

  if (!edu_level || !major) return NextResponse.json({ error: '请先选择学历和专业方向' }, { status: 400 })
  if (!answers?.length) return NextResponse.json({ error: 'No answers' }, { status: 400 })

  const result = await previewOnboardingResult(edu_level, major, answers)
  return NextResponse.json(result)
}
