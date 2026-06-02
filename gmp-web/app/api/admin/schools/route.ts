import { eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/db'
import { learningPlans, questionHistory, schoolClasses, schoolProfiles, users } from '@/db/schema'
import { verifyToken } from '@/lib/auth'

const SCHOOL_STATUSES = new Set(['active', 'paused', 'expired'])
const CLASS_STATUSES = new Set(['active', 'archived'])

let schoolSchemaEnsured = false

function getAuthPayload(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

function ensureAdmin(req: NextRequest) {
  const payload = getAuthPayload(req)
  return payload?.role === 'admin' ? payload : null
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function optional(value: unknown) {
  const next = clean(value)
  return next || null
}

async function ensureSchoolSchema() {
  if (schoolSchemaEnsured) return
  schoolSchemaEnsured = true
}

async function syncSchoolProfilesFromUsers() {
  await db.execute(sql`
    INSERT IGNORE INTO school_profiles (
      school_id,
      name,
      code,
      package_name,
      status,
      opened_at,
      created_at,
      updated_at
    )
    SELECT
      concat('school-', lower(hex(random_bytes(8)))),
      trimmed_school,
      '',
      '高校实训标准版',
      'active',
      curdate(),
      current_timestamp(3),
      current_timestamp(3)
    FROM (
      SELECT DISTINCT trim(school) AS trimmed_school
      FROM users
      WHERE trim(coalesce(school, '')) <> ''
    ) AS user_schools
  `)

  await db.execute(sql`
    INSERT IGNORE INTO school_classes (
      class_id,
      school_id,
      class_name,
      major,
      education_level,
      student_capacity,
      status,
      created_at,
      updated_at
    )
    SELECT
      concat('class-', lower(hex(random_bytes(8)))),
      school_profiles.school_id,
      user_classes.class_name,
      user_classes.major,
      '本科',
      0,
      'active',
      current_timestamp(3),
      current_timestamp(3)
    FROM (
      SELECT DISTINCT
        trim(school) AS school_name,
        trim(coalesce(class_name, group_id, '默认班级')) AS class_name,
        trim(coalesce(major, '')) AS major
      FROM users
      WHERE role = 'student'
        AND trim(coalesce(school, '')) <> ''
        AND trim(coalesce(class_name, group_id, '')) <> ''
    ) AS user_classes
    JOIN school_profiles ON school_profiles.name = user_classes.school_name
    WHERE NOT EXISTS (
      SELECT 1
      FROM school_classes
      WHERE school_classes.school_id = school_profiles.school_id
        AND school_classes.class_name = user_classes.class_name
        AND coalesce(school_classes.major, '') = user_classes.major
    )
  `)
}

function normalizeEducation(value: string | null | undefined) {
  if (value === 'college') return '专科'
  if (value === 'undergraduate') return '本科'
  return value?.trim() || '未选择'
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function getSchoolPayload(body: Record<string, unknown>) {
  const name = clean(body.name)

  return {
    name,
    code: optional(body.code),
    region: optional(body.region),
    contactPerson: optional(body.contactPerson),
    contactPhone: optional(body.contactPhone),
    packageName: clean(body.packageName) || '高校实训标准版',
    status: SCHOOL_STATUSES.has(clean(body.status)) ? clean(body.status) : 'active',
    openedAt: optional(body.openedAt),
    expiresAt: optional(body.expiresAt),
    notes: optional(body.notes),
    updatedAt: new Date().toISOString(),
  }
}

function getClassPayload(body: Record<string, unknown>) {
  return {
    schoolId: clean(body.schoolId),
    className: clean(body.className),
    major: optional(body.major),
    educationLevel: clean(body.educationLevel) || '本科',
    gradeYear: optional(body.gradeYear),
    teacherUserId: optional(body.teacherUserId),
    studentCapacity: Math.max(0, Number(body.studentCapacity) || 0),
    status: CLASS_STATUSES.has(clean(body.status)) ? clean(body.status) : 'active',
    updatedAt: new Date().toISOString(),
  }
}

export async function GET(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureSchoolSchema()
  await syncSchoolProfilesFromUsers()

  const { searchParams } = new URL(req.url)
  const search = (searchParams.get('search') || '').trim().toLowerCase()

  const schoolRows = await db.select().from(schoolProfiles)
  const classRows = await db.select().from(schoolClasses)
  const userRows = await db.select({
    userId: users.userId,
    role: users.role,
    displayName: users.displayName,
    realName: users.realName,
    email: users.email,
    school: users.school,
    major: users.major,
    className: users.className,
    groupId: users.groupId,
  }).from(users)
  const planRows = await db.select({
    userId: learningPlans.userId,
    eduLevel: learningPlans.eduLevel,
    score: learningPlans.score,
    createdAt: learningPlans.createdAt,
  }).from(learningPlans)
  const historyRows = await db.select({
    userId: questionHistory.userId,
    isCorrect: questionHistory.isCorrect,
    reviewed: questionHistory.reviewed,
  }).from(questionHistory)

  const latestPlanByUser = new Map<string, typeof planRows[number]>()
  for (const plan of planRows) {
    const current = latestPlanByUser.get(plan.userId)
    if (!current || new Date(plan.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      latestPlanByUser.set(plan.userId, plan)
    }
  }

  const historyByUser = new Map<string, { pendingReview: number }>()
  for (const row of historyRows) {
    const item = historyByUser.get(row.userId) ?? { pendingReview: 0 }
    if (!row.isCorrect && !row.reviewed) item.pendingReview += 1
    historyByUser.set(row.userId, item)
  }

  const classesBySchoolId = new Map<string, typeof classRows>()
  for (const row of classRows) {
    const rows = classesBySchoolId.get(row.schoolId) ?? []
    rows.push(row)
    classesBySchoolId.set(row.schoolId, rows)
  }

  const schoolById = new Map(schoolRows.map(school => [school.schoolId, school]))
  const schoolItems = schoolRows.map(school => {
    const usersInSchool = userRows.filter(user => (user.school || '').trim() === school.name)
    const students = usersInSchool.filter(user => user.role === 'student')
    const teachers = usersInSchool.filter(user => user.role === 'teacher')
    const plans = students.map(student => latestPlanByUser.get(student.userId)).filter(Boolean) as Array<typeof planRows[number]>
    const scoreSum = plans.reduce((sum, plan) => sum + plan.score, 0)
    const pendingReviewCount = students.reduce((sum, student) => sum + (historyByUser.get(student.userId)?.pendingReview ?? 0), 0)
    const majors = [...new Set(students.map(student => student.major?.trim()).filter(Boolean) as string[])]
    const classNames = [...new Set(students.map(student => student.className?.trim() || student.groupId?.trim()).filter(Boolean) as string[])]

    return {
      schoolId: school.schoolId,
      name: school.name,
      code: school.code || '',
      region: school.region || '',
      contactPerson: school.contactPerson || '',
      contactPhone: school.contactPhone || '',
      packageName: school.packageName,
      status: school.status,
      openedAt: school.openedAt || '',
      expiresAt: school.expiresAt || '',
      notes: school.notes || '',
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
      studentCount: students.length,
      teacherCount: teachers.length,
      classCount: Math.max(classesBySchoolId.get(school.schoolId)?.length ?? 0, classNames.length),
      majorCount: majors.length,
      onboardingCompletedCount: plans.length,
      averageDiagnosticScore: plans.length ? round(scoreSum / plans.length) : 0,
      pendingReviewCount,
      classNames,
      majors,
    }
  })

  const classItems = classRows.map(row => {
    const school = schoolById.get(row.schoolId)
    const teacher = row.teacherUserId ? userRows.find(user => user.userId === row.teacherUserId) : null
    const enrolledStudents = school
      ? userRows.filter(user => user.role === 'student' && (user.school || '').trim() === school.name && (user.className || user.groupId || '').trim() === row.className).length
      : 0

    return {
      classId: row.classId,
      schoolId: row.schoolId,
      schoolName: school?.name || '未知学校',
      className: row.className,
      major: row.major || '',
      educationLevel: normalizeEducation(row.educationLevel),
      gradeYear: row.gradeYear || '',
      teacherUserId: row.teacherUserId || '',
      teacherName: teacher?.realName || teacher?.displayName || '',
      studentCapacity: row.studentCapacity,
      enrolledStudents,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  })

  const filteredSchools = search
    ? schoolItems.filter(school => [
      school.name,
      school.code,
      school.region,
      school.contactPerson,
      school.packageName,
      school.majors.join(' '),
      school.classNames.join(' '),
    ].some(value => value.toLowerCase().includes(search)))
    : schoolItems

  return NextResponse.json({
    summary: {
      schoolCount: schoolItems.length,
      activeSchoolCount: schoolItems.filter(school => school.status === 'active').length,
      classCount: classItems.length,
      studentCount: userRows.filter(user => user.role === 'student').length,
      teacherCount: userRows.filter(user => user.role === 'teacher').length,
      onboardingCompletedCount: planRows.length,
      pendingReviewCount: historyRows.filter(row => !row.isCorrect && !row.reviewed).length,
      unassignedStudentCount: userRows.filter(user => user.role === 'student' && !(user.school || '').trim()).length,
    },
    schools: filteredSchools.sort((left, right) => right.studentCount - left.studentCount),
    classes: classItems.sort((left, right) => left.schoolName.localeCompare(right.schoolName, 'zh-Hans-CN') || left.className.localeCompare(right.className, 'zh-Hans-CN')),
    teachers: userRows
      .filter(user => user.role === 'teacher')
      .map(user => ({
        userId: user.userId,
        displayName: user.realName || user.displayName,
        email: user.email,
        school: user.school || '',
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-Hans-CN')),
  })
}

export async function POST(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureSchoolSchema()

  try {
    const body = await req.json() as Record<string, unknown>
    const entity = clean(body.entity)

    if (entity === 'school') {
      const payload = getSchoolPayload(body)
      if (!payload.name) {
        return NextResponse.json({ error: '学校名称不能为空' }, { status: 400 })
      }

      const existing = (await db.select({ schoolId: schoolProfiles.schoolId }).from(schoolProfiles).where(eq(schoolProfiles.name, payload.name)).limit(1))[0]
      if (existing) {
        return NextResponse.json({ error: '该学校已存在' }, { status: 409 })
      }

      const schoolId = uuidv4()
      await db.insert(schoolProfiles).values({
        schoolId,
        ...payload,
        createdAt: new Date().toISOString(),
      }).execute()

      return NextResponse.json({ success: true, schoolId }, { status: 201 })
    }

    if (entity === 'class') {
      const payload = getClassPayload(body)
      if (!payload.schoolId || !payload.className) {
        return NextResponse.json({ error: '学校和班级名称不能为空' }, { status: 400 })
      }

      const school = (await db.select({ schoolId: schoolProfiles.schoolId }).from(schoolProfiles).where(eq(schoolProfiles.schoolId, payload.schoolId)).limit(1))[0]
      if (!school) {
        return NextResponse.json({ error: '学校不存在' }, { status: 404 })
      }

      const classId = uuidv4()
      await db.insert(schoolClasses).values({
        classId,
        ...payload,
        createdAt: new Date().toISOString(),
      }).execute()

      return NextResponse.json({ success: true, classId }, { status: 201 })
    }

    return NextResponse.json({ error: '未知的学校管理对象' }, { status: 400 })
  } catch (err) {
    console.error('create school entity failed', err)
    return NextResponse.json({ error: '保存学校组织失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureSchoolSchema()

  try {
    const body = await req.json() as Record<string, unknown>
    const entity = clean(body.entity)

    if (entity === 'school') {
      const schoolId = clean(body.schoolId)
      const payload = getSchoolPayload(body)
      if (!schoolId) {
        return NextResponse.json({ error: '缺少学校ID' }, { status: 400 })
      }
      if (!payload.name) {
        return NextResponse.json({ error: '学校名称不能为空' }, { status: 400 })
      }

      await db.update(schoolProfiles).set(payload).where(eq(schoolProfiles.schoolId, schoolId)).execute()
      return NextResponse.json({ success: true })
    }

    if (entity === 'class') {
      const classId = clean(body.classId)
      const payload = getClassPayload(body)
      if (!classId) {
        return NextResponse.json({ error: '缺少班级ID' }, { status: 400 })
      }
      if (!payload.schoolId || !payload.className) {
        return NextResponse.json({ error: '学校和班级名称不能为空' }, { status: 400 })
      }

      await db.update(schoolClasses).set(payload).where(eq(schoolClasses.classId, classId)).execute()
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: '未知的学校管理对象' }, { status: 400 })
  } catch (err) {
    console.error('update school entity failed', err)
    return NextResponse.json({ error: '更新学校组织失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureSchoolSchema()

  const { searchParams } = new URL(req.url)
  const entity = searchParams.get('entity')
  const id = searchParams.get('id')

  if (!entity || !id) {
    return NextResponse.json({ error: '缺少删除对象' }, { status: 400 })
  }

  try {
    if (entity === 'school') {
      const school = (await db.select().from(schoolProfiles).where(eq(schoolProfiles.schoolId, id)).limit(1))[0]
      if (!school) {
        return NextResponse.json({ error: '学校不存在' }, { status: 404 })
      }

      const linkedUser = (await db.select({ userId: users.userId }).from(users).where(eq(users.school, school.name)).limit(1))[0]
      if (linkedUser) {
        return NextResponse.json({ error: '该学校仍有关联用户，请先调整用户学校后再删除' }, { status: 409 })
      }

      await db.delete(schoolClasses).where(eq(schoolClasses.schoolId, id)).execute()
      await db.delete(schoolProfiles).where(eq(schoolProfiles.schoolId, id)).execute()
      return NextResponse.json({ success: true })
    }

    if (entity === 'class') {
      const classRow = (await db.select().from(schoolClasses).where(eq(schoolClasses.classId, id)).limit(1))[0]
      if (!classRow) {
        return NextResponse.json({ error: '班级不存在' }, { status: 404 })
      }

      const school = (await db.select().from(schoolProfiles).where(eq(schoolProfiles.schoolId, classRow.schoolId)).limit(1))[0]
      const linkedUser = school
        ? (await db.select({
          userId: users.userId,
          className: users.className,
          groupId: users.groupId,
        }).from(users).where(eq(users.school, school.name))).find(user => (
          (user.className || user.groupId || '').trim() === classRow.className
        ))
        : null

      if (linkedUser) {
        return NextResponse.json({ error: '该班级仍有关联学生，请先调整学生班级后再删除' }, { status: 409 })
      }

      await db.delete(schoolClasses).where(eq(schoolClasses.classId, id)).execute()
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: '未知的删除对象' }, { status: 400 })
  } catch (err) {
    console.error('delete school entity failed', err)
    return NextResponse.json({ error: '删除学校组织失败' }, { status: 500 })
  }
}
