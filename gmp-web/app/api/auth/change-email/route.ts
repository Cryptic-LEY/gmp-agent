import bcrypt from 'bcryptjs'
import { desc, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { learningPlans, users } from '@/db/schema'
import { signToken } from '@/lib/auth'
import {
  isValidEmail,
  normalizeEmail,
  verifyVerificationCode,
  VerificationCodeError,
} from '@/lib/email-verification'

export async function POST(req: NextRequest) {
  try {
    const { oldEmail: rawOldEmail, newEmail: rawNewEmail, password, code, role } = await req.json() as {
      oldEmail?: string
      newEmail?: string
      password?: string
      code?: string
      role?: string
    }

    const oldEmail = normalizeEmail(rawOldEmail)
    const newEmail = normalizeEmail(rawNewEmail)
    if (!isValidEmail(oldEmail) || !isValidEmail(newEmail) || !password || !code?.trim()) {
      return NextResponse.json({ error: '请输入旧邮箱、密码、新邮箱和验证码' }, { status: 400 })
    }
    if (oldEmail === newEmail) {
      return NextResponse.json({ error: '新邮箱不能和当前邮箱相同' }, { status: 400 })
    }

    const expectedRole = role === 'teacher' || role === 'admin' ? role : 'student'
    const user = (await db.select().from(users).where(eq(users.email, oldEmail)).limit(1))[0]
    if (!user) {
      return NextResponse.json({ error: '旧邮箱或密码错误' }, { status: 401 })
    }
    if (user.role !== expectedRole) {
      return NextResponse.json({ error: '所选角色与账号权限不匹配' }, { status: 403 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: '旧邮箱或密码错误' }, { status: 401 })
    }

    const occupied = (await db.select({ userId: users.userId }).from(users)
      .where(eq(users.email, newEmail))
      .limit(1))[0]
    if (occupied) {
      return NextResponse.json({ error: '该新邮箱已被其他账号使用' }, { status: 409 })
    }

    await verifyVerificationCode(newEmail, 'change-email', code)
    await db.update(users).set({ email: newEmail }).where(eq(users.userId, user.userId)).execute()

    const latestPlan = user.role === 'student'
      ? (await db.select({ id: learningPlans.id })
        .from(learningPlans)
        .where(eq(learningPlans.userId, user.userId))
        .orderBy(desc(learningPlans.createdAt))
        .limit(1))[0]
      : null
    const token = signToken({ userId: user.userId, role: user.role, orgId: user.orgId })

    return NextResponse.json({
      token,
      userId: user.userId,
      displayName: user.displayName,
      role: user.role,
      email: newEmail,
      onboardingCompleted: user.role !== 'student' || Boolean(latestPlan),
    })
  } catch (err) {
    if (err instanceof VerificationCodeError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('change email failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '邮箱换绑失败' },
      { status: 500 },
    )
  }
}
