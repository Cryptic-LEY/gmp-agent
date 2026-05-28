import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/db'
import { userGameState, users } from '@/db/schema'
import { signToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password, displayName, role } = await req.json() as {
      email?: string
      password?: string
      displayName?: string
      role?: string
    }

    if (!email || !password || !displayName) {
      return NextResponse.json({ error: '请填写所有必填字段' }, { status: 400 })
    }

    const registerRole = role === 'teacher' ? 'teacher' : 'student'

    const existing = await db.select().from(users).where(eq(users.email, email)).get()
    if (existing) {
      return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const userId = uuidv4()

    await db.insert(users).values({
      userId,
      email,
      passwordHash,
      displayName,
      role: registerRole,
      persona: registerRole,
    })

    if (registerRole === 'student') {
      await db.insert(userGameState).values({ userId })
    }

    const token = signToken({ userId, role: registerRole, orgId: 'default' })

    return NextResponse.json({
      token,
      userId,
      displayName,
      role: registerRole,
    })
  } catch (err) {
    console.error('register failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '注册失败' },
      { status: 500 },
    )
  }
}
