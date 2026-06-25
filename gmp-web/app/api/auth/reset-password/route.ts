import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import {
  isValidEmail,
  normalizeEmail,
  verifyVerificationCode,
  VerificationCodeError,
} from '@/lib/email-verification'
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '@/lib/password-policy'

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, code, newPassword } = await req.json() as {
      email?: string
      code?: string
      newPassword?: string
    }

    const email = normalizeEmail(rawEmail)
    if (!isValidEmail(email) || !code?.trim() || !newPassword) {
      return NextResponse.json({ error: '请输入邮箱、验证码和新密码' }, { status: 400 })
    }

    if (!isStrongPassword(newPassword)) {
      return NextResponse.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 })
    }

    const user = (await db.select({ userId: users.userId }).from(users)
      .where(eq(users.email, email))
      .limit(1))[0]
    if (!user) {
      return NextResponse.json({ error: '该邮箱尚未注册' }, { status: 404 })
    }

    await verifyVerificationCode(email, 'reset-password', code)
    await db.update(users)
      .set({ passwordHash: await bcrypt.hash(newPassword, 10) })
      .where(eq(users.userId, user.userId))
      .execute()

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof VerificationCodeError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('reset password failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '密码重置失败' },
      { status: 500 },
    )
  }
}
