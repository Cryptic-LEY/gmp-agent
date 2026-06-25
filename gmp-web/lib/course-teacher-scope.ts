import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import type { JwtPayload } from '@/lib/auth'

type CoursePayload = Pick<JwtPayload, 'userId' | 'role'>

export async function getAssignedTeacherId(userId: string) {
  const [user] = await db.select({
    teacherUserId: users.teacherUserId,
  }).from(users).where(eq(users.userId, userId)).limit(1)

  return user?.teacherUserId ?? null
}

export async function getCourseScopeTeacherId(payload: CoursePayload) {
  if (payload.role === 'admin') return null
  if (payload.role === 'teacher') return payload.userId
  return getAssignedTeacherId(payload.userId)
}

export async function canUseTeacherResource(payload: CoursePayload, teacherId: string | null | undefined) {
  if (payload.role === 'admin') return true
  const scopeTeacherId = await getCourseScopeTeacherId(payload)
  return Boolean(scopeTeacherId && teacherId === scopeTeacherId)
}
