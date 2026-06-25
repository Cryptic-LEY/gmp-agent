import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'

export async function GET() {
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
