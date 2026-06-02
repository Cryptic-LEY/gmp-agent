import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifyToken } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null

  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const teacherRows = await db.select({
    userId: users.userId,
    displayName: users.displayName,
    realName: users.realName,
    email: users.email,
    school: users.school,
    major: users.major,
    className: users.className,
  }).from(users).where(eq(users.role, 'teacher'))

  const teachers = teacherRows
    .map(teacher => ({
      userId: teacher.userId,
      displayName: teacher.realName?.trim() || teacher.displayName,
      email: teacher.email,
      school: teacher.school || '',
      major: teacher.major || '',
      className: teacher.className || '',
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-CN'))

  return NextResponse.json({ teachers })
}
