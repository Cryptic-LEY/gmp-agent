import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const user = db.select({
    userId:      users.userId,
    displayName: users.displayName,
    email:       users.email,
    role:        users.role,
    orgId:       users.orgId,
    createdAt:   users.createdAt,
    // 学生个人信息
    realName:    users.realName,
    school:      users.school,
    major:       users.major,
    className:   users.className,
    studentId:   users.studentId,
    idCard:      users.idCard,
    phone:       users.phone,
  }).from(users).where(eq(users.userId, payload.userId)).get()

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}

export async function PATCH(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const body = await req.json() as {
    displayName?: string
    email?: string
    realName?: string
    school?: string
    major?: string
    className?: string
    studentId?: string
    idCard?: string
    phone?: string
  }

  const updates: Partial<{
    displayName: string
    email:       string
    realName:    string
    school:      string
    major:       string
    className:   string
    studentId:   string
    idCard:      string
    phone:       string
  }> = {}

  if (body.displayName?.trim()) updates.displayName = body.displayName.trim()
  if (body.email?.trim())       updates.email       = body.email.trim()
  // 允许空字符串清除，但 undefined 跳过
  if (body.realName  !== undefined) updates.realName  = body.realName.trim()
  if (body.school    !== undefined) updates.school    = body.school.trim()
  if (body.major     !== undefined) updates.major     = body.major.trim()
  if (body.className !== undefined) updates.className = body.className.trim()
  if (body.studentId !== undefined) updates.studentId = body.studentId.trim()
  if (body.idCard    !== undefined) updates.idCard    = body.idCard.trim()
  if (body.phone     !== undefined) updates.phone     = body.phone.trim()

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  db.update(users).set(updates).where(eq(users.userId, payload.userId)).run()
  return NextResponse.json({ ok: true })
}
