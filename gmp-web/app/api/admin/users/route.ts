import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifyToken } from '@/lib/auth'

const ROLES = new Set(['student', 'teacher', 'admin'])

function getAuthPayload(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

function ensureAdmin(req: NextRequest) {
  const payload = getAuthPayload(req)
  return payload?.role === 'admin' ? payload : null
}

function sanitizeRole(role: unknown) {
  return typeof role === 'string' && ROLES.has(role) ? role : 'student'
}

export async function GET(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role') || 'all'
  const search = (searchParams.get('search') || '').trim().toLowerCase()

  let rows = db.select({
    userId: users.userId,
    orgId: users.orgId,
    groupId: users.groupId,
    role: users.role,
    persona: users.persona,
    displayName: users.displayName,
    email: users.email,
    createdAt: users.createdAt,
    realName: users.realName,
    school: users.school,
    major: users.major,
    className: users.className,
    studentId: users.studentId,
    phone: users.phone,
  }).from(users).all()

  if (role !== 'all') {
    rows = rows.filter(user => user.role === role)
  }

  if (search) {
    rows = rows.filter(user => [
      user.displayName,
      user.realName,
      user.email,
      user.school,
      user.major,
      user.className,
      user.studentId,
      user.phone,
    ].some(value => value?.toLowerCase().includes(search)))
  }

  rows.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  return NextResponse.json({
    items: rows,
    total: rows.length,
  })
}

export async function POST(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json() as {
      email?: string
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

    const email = body.email?.trim()
    const displayName = body.displayName?.trim() || body.realName?.trim() || email
    const password = body.password?.trim()
    const role = sanitizeRole(body.role)

    if (!email || !password || !displayName) {
      return NextResponse.json({ error: '邮箱、姓名和密码不能为空' }, { status: 400 })
    }

    const existing = db.select({ userId: users.userId }).from(users).where(eq(users.email, email)).get()
    if (existing) {
      return NextResponse.json({ error: '该邮箱已存在' }, { status: 409 })
    }

    const userId = uuidv4()
    const passwordHash = await bcrypt.hash(password, 10)

    db.insert(users).values({
      userId,
      email,
      passwordHash,
      displayName,
      role,
      persona: role,
      realName: body.realName?.trim() || null,
      school: body.school?.trim() || null,
      major: body.major?.trim() || null,
      className: body.className?.trim() || null,
      studentId: body.studentId?.trim() || null,
      phone: body.phone?.trim() || null,
    }).run()

    return NextResponse.json({ success: true, userId }, { status: 201 })
  } catch (err) {
    console.error('create user failed', err)
    return NextResponse.json({ error: '创建用户失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const payload = ensureAdmin(req)
  if (!payload) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json() as {
      userId?: string
      email?: string
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

    if (!body.userId) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 })
    }

    const target = db.select({ userId: users.userId, role: users.role }).from(users).where(eq(users.userId, body.userId)).get()
    if (!target) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }

    const updates: Partial<typeof users.$inferInsert> = {}

    if (body.email?.trim()) updates.email = body.email.trim()
    if (body.displayName?.trim()) updates.displayName = body.displayName.trim()
    if (body.role !== undefined) {
      const nextRole = sanitizeRole(body.role)
      updates.role = nextRole
      updates.persona = nextRole
    }
    if (body.realName !== undefined) updates.realName = body.realName.trim()
    if (body.school !== undefined) updates.school = body.school.trim()
    if (body.major !== undefined) updates.major = body.major.trim()
    if (body.className !== undefined) updates.className = body.className.trim()
    if (body.studentId !== undefined) updates.studentId = body.studentId.trim()
    if (body.phone !== undefined) updates.phone = body.phone.trim()
    if (body.password?.trim()) updates.passwordHash = await bcrypt.hash(body.password.trim(), 10)

    if (body.userId === payload.userId && updates.role && updates.role !== 'admin') {
      return NextResponse.json({ error: '不能取消自己的管理员权限' }, { status: 400 })
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '没有可更新内容' }, { status: 400 })
    }

    db.update(users).set(updates).where(eq(users.userId, body.userId)).run()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('update user failed', err)
    return NextResponse.json({ error: '更新用户失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const payload = ensureAdmin(req)
  if (!payload) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: '缺少用户ID' }, { status: 400 })
  }

  if (userId === payload.userId) {
    return NextResponse.json({ error: '不能删除当前登录的管理员账号' }, { status: 400 })
  }

  try {
    db.delete(users).where(eq(users.userId, userId)).run()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('delete user failed', err)
    return NextResponse.json({ error: '删除用户失败，可能仍有关联学习记录' }, { status: 500 })
  }
}
