import bcrypt from 'bcryptjs'
import { desc, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { learningPlans, users } from '@/db/schema'
import { signToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password, role } = await req.json() as {
      email?: string
      password?: string
      role?: string
    }

    if (!email || !password) {
      return NextResponse.json({ error: '请填写邮箱和密码' }, { status: 400 })
    }

    const expectedRole = role === 'teacher' || role === 'admin' ? role : 'student'

    const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0]
    if (!user) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 })
    }

    if (user.role !== expectedRole) {
      return NextResponse.json({ error: '所选角色与账号权限不匹配' }, { status: 403 })
    }

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
      onboardingCompleted: user.role !== 'student' || Boolean(latestPlan),
    })
  } catch (err) {
    console.error('login failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '登录失败' },
      { status: 500 },
    )
  }
}
