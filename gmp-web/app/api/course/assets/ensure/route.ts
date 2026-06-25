import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { ensureCourseAssetsForTeacher, getLatestStudentEduLevel, type EduLevel } from '@/lib/course-assets-ensure'
import { getCourseScopeTeacherId } from '@/lib/course-teacher-scope'

export const runtime = 'nodejs'

function normalizeTrainingId(value: unknown) {
  const trainingId = String(value ?? '').trim()
  if (!trainingId) return undefined
  return /^T(0[1-9]|1[01])$/.test(trainingId) ? trainingId : null
}

function normalizeEduLevel(value: unknown): EduLevel | null {
  return value === 'undergraduate' || value === 'college' ? value : null
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { trainingId?: string; eduLevel?: EduLevel }
  const trainingId = normalizeTrainingId(body.trainingId)
  if (trainingId === null) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }

  const teacherId = await getCourseScopeTeacherId(payload)
  if (!teacherId) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: '当前账号没有绑定教师，暂不生成课程资产',
    })
  }

  const requestedEduLevel = normalizeEduLevel(body.eduLevel)
  const eduLevels: EduLevel[] = payload.role === 'student'
    ? [await getLatestStudentEduLevel(payload.userId)]
    : requestedEduLevel
      ? [requestedEduLevel]
      : ['college', 'undergraduate']

  const result = await ensureCourseAssetsForTeacher({
    teacherId,
    trainingId,
    eduLevels,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error || '课程资产初始化失败', result }, { status: 500 })
  }

  const { ok: _ok, ...summary } = result
  return NextResponse.json({
    ok: true,
    teacherId,
    trainingId,
    ...summary,
  })
}
