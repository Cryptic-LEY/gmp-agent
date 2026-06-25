import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '@/lib/password-policy'

// POST /api/user/password
// Body: { oldPassword, newPassword }
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { oldPassword, newPassword } = await req.json() as {
    oldPassword?: string
    newPassword?: string
  }

  if (!oldPassword || !newPassword)
    return NextResponse.json({ error: '请填写旧密码和新密码' }, { status: 400 })

  if (!isStrongPassword(newPassword))
    return NextResponse.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 })

  const user = (await db.select({ passwordHash: users.passwordHash })
    .from(users).where(eq(users.userId, payload.userId)).limit(1))[0]

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const valid = await bcrypt.compare(oldPassword, user.passwordHash)
  if (!valid) return NextResponse.json({ error: '旧密码不正确' }, { status: 400 })

  const newHash = await bcrypt.hash(newPassword, 10)
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.userId, payload.userId)).execute()

  return NextResponse.json({ ok: true })
}
