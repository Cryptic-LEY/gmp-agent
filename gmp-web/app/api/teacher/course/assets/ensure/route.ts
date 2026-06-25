import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { ensureCourseAssetsForTeacher, type EduLevel } from '@/lib/course-assets-ensure'

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
  if (!payload || (payload.role !== 'teacher' && payload.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    teacherId?: string
    trainingId?: string
    eduLevel?: EduLevel
  }
  const teacherId = payload.role === 'teacher'
    ? payload.userId
    : body.teacherId?.trim()
  if (!teacherId) {
    return NextResponse.json({ error: '请指定教师' }, { status: 400 })
  }

  const trainingId = normalizeTrainingId(body.trainingId)
  if (trainingId === null) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }

  const requestedEduLevel = normalizeEduLevel(body.eduLevel)
  const result = await ensureCourseAssetsForTeacher({
    teacherId,
    trainingId,
    eduLevels: requestedEduLevel ? [requestedEduLevel] : ['college', 'undergraduate'],
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
