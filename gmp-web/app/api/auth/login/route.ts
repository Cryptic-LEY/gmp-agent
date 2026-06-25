import bcrypt from 'bcryptjs'
import { desc, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { learningPlans, users } from '@/db/schema'
import { signToken } from '@/lib/auth'
import {
  createVerificationCode,
  discardPendingVerificationCodes,
  isValidEmail,
  normalizeEmail,
  verifyVerificationCode,
  VerificationCodeError,
} from '@/lib/email-verification'
import { sendVerificationMail } from '@/lib/mailer'
import { isTestAccountEmail } from '@/lib/test-accounts'

export async function POST(req: NextRequest) {
  try {
    const { email: rawIdentifier, password, code, role, step } = await req.json() as {
      email?: string
      password?: string
      code?: string
      role?: string
      step?: 'password' | 'verify-code'
    }

    const identifier = rawIdentifier?.trim() ?? ''
    if (!identifier || !password) {
      return NextResponse.json({ error: '请输入邮箱/账号和密码' }, { status: 400 })
    }

    const expectedRole = role === 'teacher' || role === 'admin' ? role : 'student'
    const normalizedEmail = normalizeEmail(identifier)
    const isEmailLogin = isValidEmail(normalizedEmail)
    const candidates = await db.select().from(users)
      .where(isEmailLogin ? eq(users.email, normalizedEmail) : eq(users.displayName, identifier))
      .limit(2)
    if (!isEmailLogin && candidates.length > 1) {
      return NextResponse.json({ error: '该账号存在重复记录，请使用邮箱登录' }, { status: 409 })
    }

    const user = candidates[0]
    if (!user) {
      return NextResponse.json({ error: '邮箱/账号或密码错误' }, { status: 401 })
    }

    if (user.role !== expectedRole) {
      return NextResponse.json({ error: '所选角色与账号权限不匹配' }, { status: 403 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: '邮箱/账号或密码错误' }, { status: 401 })
    }

    const completeLogin = async () => {
      const latestPlan = user.role === 'student'
        ? (await db.select({ id: learningPlans.id })
          .from(learningPlans)
          .where(eq(learningPlans.userId, user.userId))
          .orderBy(desc(learningPlans.createdAt))
          .limit(1))[0]
        : null

      const token = signToken({ userId: user.userId, role: user.role, orgId: user.orgId })

      return {
        token,
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        onboardingCompleted: user.role !== 'student' || Boolean(latestPlan),
      }
    }

    if (isTestAccountEmail(user.email)) {
      return NextResponse.json(await completeLogin())
    }

    if (step !== 'verify-code') {
      const verification = await createVerificationCode(user.email, 'login', expectedRole)
      try {
        const mailResult = await sendVerificationMail(user.email, verification.code, 'login')
        return NextResponse.json({
          requiresCode: true,
          email: user.email,
          expiresIn: verification.expiresIn,
          delivered: Boolean(mailResult.delivered),
          devCode: mailResult.devOnly ? verification.code : undefined,
        })
      } catch (err) {
        await discardPendingVerificationCodes(user.email, 'login').catch(cleanupErr => {
          console.error('discard pending login code failed', cleanupErr)
        })
        return NextResponse.json(
          { error: err instanceof Error ? `验证码发送失败：${err.message}` : '验证码发送失败' },
          { status: 500 },
        )
      }
    }

    if (!code?.trim()) {
      return NextResponse.json({ error: '请输入邮箱验证码' }, { status: 400 })
    }

    await verifyVerificationCode(user.email, 'login', code)

    return NextResponse.json(await completeLogin())
  } catch (err) {
    if (err instanceof VerificationCodeError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('login failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '登录失败' },
      { status: 500 },
    )
  }
}
