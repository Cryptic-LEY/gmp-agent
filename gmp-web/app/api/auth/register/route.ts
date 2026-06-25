import bcrypt from 'bcryptjs'
import { eq, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/db'
import { userGameState, users } from '@/db/schema'
import { signToken } from '@/lib/auth'
import {
  isValidEmail,
  normalizeEmail,
  verifyVerificationCode,
  VerificationCodeError,
} from '@/lib/email-verification'
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '@/lib/password-policy'

function clean(value?: string) {
  const trimmed = value?.trim()
  return trimmed || null
}

async function cleanupCreatedUser(userId: string) {
  await db.raw.run('DELETE FROM user_game_state WHERE user_id = ?', [userId])
  await db.raw.run('DELETE FROM users WHERE user_id = ?', [userId])
}

export async function POST(req: NextRequest) {
  let createdUserId: string | null = null

  try {
    const {
      email: rawEmail,
      code,
      password,
      displayName,
      role,
      realName,
      school,
      major,
      className,
      studentId,
      phone,
    } = await req.json() as {
      email?: string
      code?: string
      password?: string
      displayName?: string
      role?: string
      realName?: string
      school?: string
      major?: string
      className?: string
      studentId?: string
      phone?: string
    }

    const email = normalizeEmail(rawEmail)
    const trimmedDisplayName = displayName?.trim()
    if (!isValidEmail(email) || !code?.trim() || !password || !trimmedDisplayName) {
      return NextResponse.json({ error: '请填写邮箱、验证码和账号' }, { status: 400 })
    }

    if (!isStrongPassword(password)) {
      return NextResponse.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 })
    }

    const registerRole = role === 'teacher' ? 'teacher' : 'student'
    if (registerRole === 'teacher' && !school?.trim()) {
      return NextResponse.json({ error: '请填写学校或机构' }, { status: 400 })
    }

    const existing = (await db.select({
      userId: users.userId,
      email: users.email,
      displayName: users.displayName,
    }).from(users).where(or(
      eq(users.email, email),
      eq(users.displayName, trimmedDisplayName),
    )).limit(1))[0]
    if (existing) {
      return NextResponse.json({
        error: existing.email === email ? '该邮箱已注册，请直接登录' : '该账号已存在，请换一个账号',
      }, { status: 409 })
    }

    await verifyVerificationCode(email, 'register', code)

    const userId = uuidv4()
    const token = signToken({ userId, role: registerRole, orgId: 'default' })

    await db.insert(users).values({
      userId,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      displayName: trimmedDisplayName,
      role: registerRole,
      persona: registerRole,
      realName: registerRole === 'teacher' ? (clean(realName) ?? trimmedDisplayName) : null,
      school: registerRole === 'teacher' ? clean(school) : null,
      major: registerRole === 'teacher' ? clean(major) : null,
      className: registerRole === 'teacher' ? clean(className) : null,
      studentId: registerRole === 'teacher' ? clean(studentId) : null,
      phone: registerRole === 'teacher' ? clean(phone) : null,
    })
    createdUserId = userId

    if (registerRole === 'student') {
      await db.insert(userGameState).values({
        userId,
        xp: 0,
        points: 0,
        rankLevel: 1,
        rankTitle: 'GMP新人',
        streakDays: 0,
        maxStreak: 0,
        punishUntil: null,
        lastLoginDate: null,
      }).execute()
    }

    return NextResponse.json({
      token,
      userId,
      displayName: trimmedDisplayName,
      role: registerRole,
      onboardingCompleted: registerRole === 'teacher',
    })
  } catch (err) {
    if (err instanceof VerificationCodeError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (createdUserId) {
      try {
        await cleanupCreatedUser(createdUserId)
      } catch (cleanupErr) {
        console.error('cleanup failed registration user failed', cleanupErr)
      }
    }
    console.error('register failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '注册失败' },
      { status: 500 },
    )
  }
}
