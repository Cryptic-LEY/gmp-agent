import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { signToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: '请填写邮箱和密码' }, { status: 400 })
  }

  const user = await db.select().from(users).where(eq(users.email, email)).get()
  if (!user) {
    return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 })
  }

  const token = signToken({ userId: user.userId, role: user.role, orgId: user.orgId })

  return NextResponse.json({
    token,
    userId: user.userId,
    displayName: user.displayName,
    role: user.role,
  })
}
