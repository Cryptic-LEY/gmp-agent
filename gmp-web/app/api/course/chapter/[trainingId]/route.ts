import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import {
  trainingProjects, knowledgePoints, kpMastery, kpRegLinks, regLibrary,
  moduleScores, learningPlans, courseDiscussions, courseDiscussionReplies,
  courseAssignments, courseAssignmentSubmissions, courseStudyLogs, users,
} from '@/db/schema'
import { eq, desc, and, inArray, sql } from 'drizzle-orm'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ trainingId: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId } = payload

  const { trainingId } = await context.params
  if (!/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }

  // 1. 章节基本信息
  const project = db.select().from(trainingProjects)
    .where(eq(trainingProjects.trainingId, trainingId)).get()
  if (!project) return NextResponse.json({ error: '章节不存在' }, { status: 404 })

  // 2. 学历推断
  const latestPlan = db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt)).limit(1).get()
  const eduLevel: 'college' | 'undergraduate' = (latestPlan?.eduLevel as 'college' | 'undergraduate') || 'college'
  const eduCn = eduLevel === 'undergraduate' ? '本科' : '专科'
  const projName = eduLevel === 'undergraduate' ? project.kpProjUg : project.kpProjCol

  // 3. 章节知识点
  const kps = projName
    ? db.select().from(knowledgePoints)
        .where(and(eq(knowledgePoints.projectName, projName), eq(knowledgePoints.eduLevel, eduCn))).all()
    : []
  const kpIds = kps.map(k => k.kpId)

  // 用户掌握度
  const masteryRows = kpIds.length > 0
    ? db.select().from(kpMastery)
        .where(and(eq(kpMastery.userId, userId), inArray(kpMastery.kpId, kpIds))).all()
    : []
  const masteryMap = new Map(masteryRows.map(m => [m.kpId, m]))

  const knowledgePointsResult = kps.map(kp => {
    const m = masteryMap.get(kp.kpId)
    const confidence = m?.confidence ?? 0
    const status: 'mastered' | 'learning' | 'weak' | 'untested' =
      !m || m.attemptCount === 0 ? 'untested'
        : confidence >= 0.8 ? 'mastered'
        : confidence >= 0.5 ? 'learning'
        : 'weak'
    return {
      kpId: kp.kpId,
      title: kp.title,
      content: kp.content,
      difficulty: kp.difficulty,
      pointType: kp.pointType,
      taskName: kp.taskName,
      confidence: parseFloat(confidence.toFixed(2)),
      attemptCount: m?.attemptCount ?? 0,
      status,
    }
  })

  // 4. 章节关联法规（去重）
  const linkedRegs = kpIds.length > 0
    ? db.select({
        regId:   kpRegLinks.regId,
        docType: regLibrary.docType,
        regDoc:  regLibrary.regDoc,
        chapter: regLibrary.chapterName,
        section: regLibrary.sectionName,
        article: regLibrary.articleNum,
        content: regLibrary.content,
      })
        .from(kpRegLinks)
        .innerJoin(regLibrary, eq(kpRegLinks.regId, regLibrary.regId))
        .where(inArray(kpRegLinks.kpId, kpIds))
        .all()
    : []
  // 按 docType 分组 + 去重
  const seenReg = new Set<string>()
  const regsByDocType = new Map<string, typeof linkedRegs>()
  for (const r of linkedRegs) {
    if (seenReg.has(r.regId)) continue
    seenReg.add(r.regId)
    if (!regsByDocType.has(r.docType)) regsByDocType.set(r.docType, [])
    regsByDocType.get(r.docType)!.push(r)
  }
  const resources = Array.from(regsByDocType.entries()).map(([docType, items]) => ({
    docType,
    count: items.length,
    items: items.slice(0, 20),                          // 每类最多展示20条
  }))

  // 5. 最近一次章节测验成绩
  const latestQuiz = db.select().from(moduleScores)
    .where(and(eq(moduleScores.userId, userId), eq(moduleScores.trainingId, trainingId)))
    .orderBy(desc(moduleScores.completedAt)).limit(1).get()

  // 6. 讨论区（最近 10 条 + 总数 + 作者展示名）
  const discussions = db.select({
    id: courseDiscussions.id,
    title: courseDiscussions.title,
    content: courseDiscussions.content,
    tag: courseDiscussions.tag,
    pinned: courseDiscussions.pinned,
    viewCount: courseDiscussions.viewCount,
    replyCount: courseDiscussions.replyCount,
    createdAt: courseDiscussions.createdAt,
    userId: courseDiscussions.userId,
    authorName: users.displayName,
  })
    .from(courseDiscussions)
    .innerJoin(users, eq(courseDiscussions.userId, users.userId))
    .where(eq(courseDiscussions.trainingId, trainingId))
    .orderBy(desc(courseDiscussions.pinned), desc(courseDiscussions.createdAt))
    .limit(10).all()

  const discussionTotal = db.select({ count: sql<number>`COUNT(*)`.as('count') })
    .from(courseDiscussions)
    .where(eq(courseDiscussions.trainingId, trainingId)).get()

  // 7. 作业列表 + 本人提交状态
  const assignments = db.select().from(courseAssignments)
    .where(eq(courseAssignments.trainingId, trainingId))
    .orderBy(desc(courseAssignments.createdAt)).all()

  const myAssignmentIds = assignments.map(a => a.id)
  const mySubmissions = myAssignmentIds.length > 0
    ? db.select().from(courseAssignmentSubmissions)
        .where(and(
          eq(courseAssignmentSubmissions.userId, userId),
          inArray(courseAssignmentSubmissions.assignmentId, myAssignmentIds),
        )).all()
    : []
  const submissionMap = new Map(mySubmissions.map(s => [s.assignmentId, s]))

  const assignmentsResult = assignments.map(a => {
    const sub = submissionMap.get(a.id)
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      assignmentType: a.assignmentType,
      maxScore: a.maxScore,
      dueDate: a.dueDate,
      createdAt: a.createdAt,
      submitted: !!sub,
      mySubmission: sub
        ? {
            id: sub.id,
            score: sub.score,
            submittedAt: sub.submittedAt,
            graded: sub.score !== null,
          }
        : null,
    }
  })

  // 8. 学习时长
  const studyAgg = db.select({ seconds: sql<number>`COALESCE(SUM(${courseStudyLogs.seconds}), 0)`.as('seconds') })
    .from(courseStudyLogs)
    .where(and(eq(courseStudyLogs.userId, userId), eq(courseStudyLogs.trainingId, trainingId)))
    .get()
  const studySeconds = Number(studyAgg?.seconds) || 0

  return NextResponse.json({
    chapter: {
      trainingId: project.trainingId,
      displayName: project.displayName,
      seqOrder: project.seqOrder,
      eduLevel,
      hours: eduLevel === 'undergraduate' ? project.hoursUg : project.hoursCollege,
      projectName: projName,
    },
    knowledgePoints: knowledgePointsResult,
    resources,
    quiz: {
      latestScore: latestQuiz?.score ?? null,
      earnedHours: latestQuiz?.earnedHours ?? null,
      completedAt: latestQuiz?.completedAt ?? null,
      passed: (latestQuiz?.score ?? 0) >= 60,
    },
    discussions: {
      total: Number(discussionTotal?.count ?? 0),
      list: discussions.map(d => ({
        id: d.id,
        title: d.title,
        content: d.content,
        tag: d.tag,
        pinned: d.pinned,
        replyCount: d.replyCount,
        viewCount: d.viewCount,
        createdAt: d.createdAt,
        author: d.authorName,
      })),
    },
    assignments: assignmentsResult,
    studyMinutes: Math.round(studySeconds / 60),
  })
}
