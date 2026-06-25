import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/db'
import { userGameState, users } from '@/db/schema'
import { signToken, verifyPendingRegistrationToken } from '@/lib/auth'
import { saveOnboardingResult, type OnboardingAnswerItem } from '@/lib/onboarding-results'

interface StudentProfilePayload {
  realName?: string
  school?: string
  className?: string
  teacherUserId?: string
  studentId?: string
  idCard?: string
  phone?: string
}

interface PendingRegistrationPayload {
  registrationToken?: string
  profile?: StudentProfilePayload
}

function clean(value?: string) {
  const trimmed = value?.trim()
  return trimmed || ''
}

async function cleanupCreatedStudent(userId: string) {
  await db.raw.run('DELETE FROM question_history WHERE user_id = ?', [userId])
  await db.raw.run('DELETE FROM learning_plans WHERE user_id = ?', [userId])
  await db.raw.run('DELETE FROM kp_mastery WHERE user_id = ?', [userId])
  await db.raw.run('DELETE FROM user_game_state WHERE user_id = ?', [userId])
  await db.raw.run('DELETE FROM users WHERE user_id = ?', [userId])
}

// POST /api/onboarding/register-complete
// Body: { registration, edu_level, major, answers }
export async function POST(req: NextRequest) {
  let createdUserId: string | null = null

  try {
    const { registration, edu_level, major, answers } = await req.json() as {
      registration?: PendingRegistrationPayload
      edu_level?: string
      major?: string
      answers?: OnboardingAnswerItem[]
    }

    const pendingToken = registration?.registrationToken
      ? verifyPendingRegistrationToken(registration.registrationToken)
      : null
    const email = clean(pendingToken?.email)
    const displayName = clean(pendingToken?.displayName)
    const profile = registration?.profile ?? {}
    const realName = clean(profile.realName)
    const school = clean(profile.school)
    const teacherUserId = clean(profile.teacherUserId)
    const phone = clean(profile.phone)
    const selectedMajor = clean(major)
    const eduLevel = clean(edu_level)

    if (!email || !displayName || !pendingToken) {
      return NextResponse.json({ error: '注册账号信息不完整，请返回登录页重新注册' }, { status: 400 })
    }
    if (!realName || !school || !teacherUserId) {
      return NextResponse.json({ error: '请完善真实姓名、学校和任课老师' }, { status: 400 })
    }
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 })
    }
    if (!eduLevel || !selectedMajor) {
      return NextResponse.json({ error: '请先选择学历和专业方向' }, { status: 400 })
    }
    if (!answers?.length) {
      return NextResponse.json({ error: '请完成能力前测后再进入系统' }, { status: 400 })
    }

    const existing = (await db.select({ userId: users.userId }).from(users)
      .where(eq(users.email, email))
      .limit(1))[0]
    if (existing) return NextResponse.json({ error: '该邮箱已注册，请直接登录' }, { status: 409 })

    const teacher = (await db.select({ userId: users.userId, role: users.role }).from(users)
      .where(eq(users.userId, teacherUserId))
      .limit(1))[0]
    if (!teacher || teacher.role !== 'teacher') {
      return NextResponse.json({ error: '请选择有效的任课老师' }, { status: 400 })
    }

    const userId = uuidv4()
    createdUserId = userId
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10)

    await db.insert(users).values({
      userId,
      email,
      passwordHash,
      displayName,
      role: 'student',
      persona: 'student',
      realName,
      school,
      major: selectedMajor,
      className: clean(profile.className) || null,
      teacherUserId,
      studentId: clean(profile.studentId) || null,
      idCard: clean(profile.idCard) || null,
      phone: phone || null,
    }).execute()

    await db.insert(userGameState).values({ userId }).execute()

    const result = await saveOnboardingResult(userId, eduLevel, selectedMajor, answers)
    const token = signToken({ userId, role: 'student', orgId: 'default' })

    return NextResponse.json({
      token,
      userId,
      displayName,
      role: 'student',
      onboardingCompleted: true,
      ...result,
    })
  } catch (err) {
    if (createdUserId) {
      try {
        await cleanupCreatedStudent(createdUserId)
      } catch (cleanupErr) {
        console.error('cleanup pending student failed', cleanupErr)
      }
    }

    console.error('complete student registration failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '注册完成失败' },
      { status: 500 },
    )
  }
}
