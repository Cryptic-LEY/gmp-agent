import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import {
  createVerificationCode,
  discardPendingVerificationCodes,
  isValidEmail,
  normalizeEmail,
  type VerificationPurpose,
  VerificationCodeError,
} from '@/lib/email-verification'
import { sendVerificationMail } from '@/lib/mailer'

function isPublicPurpose(value: string): value is Exclude<VerificationPurpose, 'login'> {
  return value === 'register' || value === 'reset-password' || value === 'change-email'
}

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, purpose: rawPurpose, role } = await req.json() as {
      email?: string
      purpose?: string
      role?: string
    }

    const email = normalizeEmail(rawEmail)
    const purpose = rawPurpose ?? ''
    if (!isValidEmail(email) || !isPublicPurpose(purpose)) {
      return NextResponse.json({ error: '请输入有效邮箱并选择验证码用途' }, { status: 400 })
    }

    const expectedRole = role === 'teacher' || role === 'admin' ? role : 'student'
    const existing = (await db.select({
      userId: users.userId,
      role: users.role,
    }).from(users).where(eq(users.email, email)).limit(1))[0]

    if (purpose === 'register' && existing) {
      return NextResponse.json({ error: '该邮箱已注册，请直接登录' }, { status: 409 })
    }

    if (purpose === 'reset-password' && !existing) {
      return NextResponse.json({ error: '该邮箱尚未注册' }, { status: 404 })
    }

    if (purpose === 'change-email' && existing) {
      return NextResponse.json({ error: '该邮箱已被其他账号使用' }, { status: 409 })
    }

    const verification = await createVerificationCode(email, purpose, expectedRole)
    const mailResult = await sendVerificationMail(email, verification.code, purpose).catch(async err => {
      await discardPendingVerificationCodes(email, purpose).catch(cleanupErr => {
        console.error('discard pending email code failed', cleanupErr)
      })
      throw err
    })

    return NextResponse.json({
      ok: true,
      expiresIn: verification.expiresIn,
      delivered: mailResult.delivered,
      devCode: mailResult.devOnly ? verification.code : undefined,
    })
  } catch (err) {
    if (err instanceof VerificationCodeError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('send email code failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '验证码发送失败' },
      { status: 500 },
    )
  }
}
