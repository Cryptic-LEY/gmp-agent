import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { knowledgePoints, kpRegLinks, learningPlans, regLibrary, trainingProjects } from '@/db/schema'

type EduLevel = 'college' | 'undergraduate'

interface AuthPayload {
  userId: string
  role: string
}

interface OpenmaicRequest {
  [key: string]: unknown
}

type KnowledgePointRow = typeof knowledgePoints.$inferSelect

interface ScopedKnowledgePoint extends KnowledgePointRow {
  eduLabel: '专科' | '本科'
}

interface RegContext {
  regId: string
  docType: string
  regDoc: string
  chapter: string | null
  section: string | null
  article: string | null
  content: string | null
}

const EDU_LABEL: Record<EduLevel, '专科' | '本科'> = {
  college: '专科',
  undergraduate: '本科',
}

const CHAPTER_KEYWORD_STOP_WORDS = new Set([
  'GMP',
  '管理',
  '质量',
  '生产',
  '产品',
  '基础',
  '实训',
  '综合',
  '课程',
  '章节',
])

const REG_CHAPTER_SCOPE: Record<string, string[]> = {
  T01: ['第一章'],
  T02: ['第二章'],
  T03: ['第四章', '第五章'],
  T04: ['第八章', '计算机化系统'],
  T05: ['第七章', '确认与验证'],
  T06: ['第六章'],
  T07: ['第九章'],
  T08: ['第十章'],
  T09: ['第十二章', '产品发运', '召回', '投诉', '放行'],
  T10: ['第十一章'],
  T11: ['第十三章', '自检', '风险'],
}

const CHAPTER_PPT_STYLE_HINTS: Record<string, string> = {
  T01: '视觉风格：深海蓝+琥珀橙，偏法规导览和体系总览；使用清晰编号、阶梯、时间线，不要使用大面积同色箭头堆叠。',
  T02: '视觉风格：墨绿+浅青，偏质量体系仪表盘；多用流程卡、职责矩阵、风险热区，版面留白充足。',
  T03: '视觉风格：靛蓝+玫瑰红，偏组织岗位与人员能力；多用岗位泳道、职责对照、培训闭环图。',
  T04: '视觉风格：青蓝+冷灰，偏文件与数据完整性；多用表格校核、证据链、ALCOA+ 检查清单。',
  T05: '视觉风格：紫灰+亮青，偏确认验证；多用验证生命周期、V 模型、关键参数卡片。',
  T06: '视觉风格：松石绿+金色，偏物料追溯；多用批次流转图、仓储分区、放行节点。',
  T07: '视觉风格：深蓝+安全黄，偏生产过程控制；多用现场控制点、污染防控流程、操作红线。',
  T08: '视觉风格：石墨灰+湖蓝，偏质量控制与保证；多用实验室数据、OOS/OOT 调查、QA/QC 分工。',
  T09: '视觉风格：孔雀蓝+珊瑚橙，偏发运、投诉和召回；多用决策树、追踪路线、召回等级图。',
  T10: '视觉风格：酒红+米白，偏委托生产与检验；多用双方责任边界、协议清单、技术转移流程。',
  T11: '视觉风格：森林绿+警示红，偏自检与 CAPA；多用审计闭环、缺陷分级、整改追踪看板。',
}

function textValue(value: unknown, max = 500) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : ''
}

function compactMaterial(value: unknown, max = 800) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, max)
}

function appendBounded(base: unknown, addition: string, max: number) {
  const current = typeof base === 'string' ? base.trim() : ''
  const next = [current, addition.trim()].filter(Boolean).join('\n')
  return next.slice(0, max)
}

function chapterPptStyleHint(trainingId: string) {
  const style = CHAPTER_PPT_STYLE_HINTS[trainingId] ?? '视觉风格：根据章节主题选择差异化配色和版式。'
  return [
    style,
    '每页必须避免文字与图形、边框、箭头重叠；图形和文字之间至少保留明显间距；若信息较多，应拆页展示。',
    '同一章节内保持统一风格，但不同章节必须在主色、布局结构或图示语言上有明显区别。',
  ].join('\n')
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

function buildChapterKeywords(displayName: string) {
  const cleaned = displayName
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[，,;；:：·\-]/g, '、')
  const parts = cleaned
    .split(/[与和及、\s]+/)
    .map(part => part.trim())
    .filter(part => part.length >= 2)
  const terms: string[] = []

  for (const part of parts) {
    terms.push(part)
    const compact = part.replace(/(管理|实训|基础)$/g, '')
    if (compact.length >= 2) terms.push(compact)
    for (const size of [2, 3]) {
      for (let index = 0; index <= part.length - size; index += 1) {
        terms.push(part.slice(index, index + size))
      }
    }
  }

  return unique(terms)
    .map(term => term.trim())
    .filter(term => term.length >= 2 && !CHAPTER_KEYWORD_STOP_WORDS.has(term))
    .sort((left, right) => right.length - left.length)
}

function pickChapterScopedKps<T extends { title: string; taskName: string | null; content: string | null }>(
  kps: T[],
  chapterName: string,
) {
  const keywords = buildChapterKeywords(chapterName)
  if (keywords.length === 0) return kps

  const matched = kps.filter(kp => {
    const haystack = `${kp.title ?? ''} ${kp.taskName ?? ''} ${kp.content ?? ''}`
    return keywords.some(keyword => haystack.includes(keyword))
  })

  return matched.length > 0 ? matched : kps
}

function scoreRegForChapter(reg: RegContext, keywords: string[]) {
  const location = `${reg.chapter ?? ''} ${reg.section ?? ''}`
  const haystack = `${reg.docType} ${reg.regDoc} ${location} ${reg.article ?? ''} ${reg.content ?? ''}`
  return keywords.reduce((score, keyword) => {
    if (!haystack.includes(keyword)) return score
    return score + (location.includes(keyword) ? 6 : keyword.length >= 4 ? 4 : 2)
  }, 0)
}

function filterRegsByTrainingScope(trainingId: string, regs: RegContext[]) {
  const scope = REG_CHAPTER_SCOPE[trainingId]
  if (!scope?.length) return regs

  const scoped = regs.filter(reg => {
    const haystack = `${reg.docType} ${reg.regDoc} ${reg.chapter ?? ''} ${reg.section ?? ''} ${reg.article ?? ''} ${reg.content ?? ''}`
    return scope.some(term => haystack.includes(term))
  })

  return scoped.length > 0 ? scoped : regs
}

function inferEduLevelFromRequest(body: OpenmaicRequest): EduLevel[] | null {
  const explicit = textValue(body.eduLevel).toLowerCase()
  if (explicit === 'undergraduate') return ['undergraduate']
  if (explicit === 'college') return ['college']

  const studentLevel = textValue(body.studentLevel, 160)
  const hasUndergraduate = studentLevel.includes('本科')
  const hasCollege = studentLevel.includes('专科') || studentLevel.includes('高职')
  if (hasUndergraduate && !hasCollege) return ['undergraduate']
  if (hasCollege && !hasUndergraduate) return ['college']
  return null
}

async function resolveEduLevels(body: OpenmaicRequest, payload: AuthPayload): Promise<EduLevel[]> {
  const inferred = inferEduLevelFromRequest(body)
  if (inferred) return inferred

  if (payload.role === 'student') {
    const [latestPlan] = await db.select({ eduLevel: learningPlans.eduLevel })
      .from(learningPlans)
      .where(eq(learningPlans.userId, payload.userId))
      .orderBy(desc(learningPlans.createdAt))
      .limit(1)
    if (latestPlan?.eduLevel === 'undergraduate') return ['undergraduate']
    if (latestPlan?.eduLevel === 'college') return ['college']
  }

  return ['college', 'undergraduate']
}

function buildSourceMaterials({
  trainingId,
  chapterName,
  projectNames,
  kps,
  regs,
}: {
  trainingId: string
  chapterName: string
  projectNames: string[]
  kps: ScopedKnowledgePoint[]
  regs: RegContext[]
}) {
  const knowledgeLines = kps.slice(0, 18).map((kp, index) => {
    const source = [kp.eduLabel, kp.projectName, kp.taskName].filter(Boolean).join(' / ')
    const content = compactMaterial(kp.content, 360)
    const articles = compactMaterial(kp.gmpArticles, 140)
    return [
      `${index + 1}. 【${source || '教材'}】${kp.title}`,
      content ? `原文要点：${content}` : '',
      articles ? `关联法规：${articles}` : '',
    ].filter(Boolean).join('；')
  })

  const regLines = regs.slice(0, 14).map((reg, index) => {
    const location = [reg.docType, `《${reg.regDoc}》`, reg.chapter, reg.section, reg.article].filter(Boolean).join(' ')
    return `${index + 1}. ${location}：${compactMaterial(reg.content, 320)}`
  })

  return [
    `【章节】${trainingId} · ${chapterName}`,
    projectNames.length ? `【教材项目】${unique(projectNames).join('；')}` : '',
    '【教材知识点原文】',
    knowledgeLines.join('\n') || '未检索到结构化教材知识点，请仅围绕章节标题生成。',
    regLines.length ? '【关联法规条文】' : '',
    regLines.join('\n'),
  ].filter(Boolean).join('\n')
}

export async function enrichOpenmaicRequestWithCourseMaterials(body: OpenmaicRequest, payload: AuthPayload) {
  const trainingId = textValue(body.trainingId, 32)
  if (!/^T(0[1-9]|1[01])$/.test(trainingId)) return body

  const [chapter] = await db.select().from(trainingProjects)
    .where(eq(trainingProjects.trainingId, trainingId))
    .limit(1)
  if (!chapter) return body

  const eduLevels = await resolveEduLevels(body, payload)
  const scopedKps: ScopedKnowledgePoint[] = []
  const projectNames: string[] = []

  for (const eduLevel of eduLevels) {
    const projectName = eduLevel === 'undergraduate' ? chapter.kpProjUg : chapter.kpProjCol
    if (!projectName) continue
    projectNames.push(projectName)
    const rows = await db.select().from(knowledgePoints)
      .where(and(
        eq(knowledgePoints.projectName, projectName),
        eq(knowledgePoints.eduLevel, EDU_LABEL[eduLevel]),
      ))
    scopedKps.push(...pickChapterScopedKps(rows, chapter.displayName).map(row => ({
      ...row,
      eduLabel: EDU_LABEL[eduLevel],
    })))
  }

  const dedupedKps = Array.from(
    new Map(scopedKps.map(kp => [kp.kpId, kp])).values(),
  )
  const kpIds = dedupedKps.map(kp => kp.kpId)

  const linkedRegs = kpIds.length > 0
    ? await db.select({
      regId: kpRegLinks.regId,
      docType: regLibrary.docType,
      regDoc: regLibrary.regDoc,
      chapter: regLibrary.chapterName,
      section: regLibrary.sectionName,
      article: regLibrary.articleNum,
      content: regLibrary.content,
    })
      .from(kpRegLinks)
      .innerJoin(regLibrary, eq(kpRegLinks.regId, regLibrary.regId))
      .where(inArray(kpRegLinks.kpId, kpIds))
    : []

  const keywords = buildChapterKeywords(chapter.displayName)
  const regs = filterRegsByTrainingScope(
    trainingId,
    linkedRegs
      .map(reg => ({ reg, score: scoreRegForChapter(reg, keywords) }))
      .sort((left, right) => right.score - left.score)
      .map(item => item.reg),
  )

  const sourceMaterials = buildSourceMaterials({
    trainingId,
    chapterName: chapter.displayName,
    projectNames,
    kps: dedupedKps,
    regs,
  }).slice(0, 16_000)

  const titleKeyPoints = dedupedKps.slice(0, 12).map(kp => `教材知识点：${kp.title}`).join('；')
  const regulationHints = regs.slice(0, 5)
    .map(reg => [reg.regDoc, reg.chapter, reg.section, reg.article].filter(Boolean).join(' '))
    .join('；')

  return {
    ...body,
    trainingId,
    chapterTitle: chapter.displayName,
    projectName: unique(projectNames).join('；'),
    eduLevel: eduLevels.length === 1 ? eduLevels[0] : 'mixed',
    requirement: textValue(body.requirement) || `${chapter.displayName} 教学PPT`,
    teachingGoals: appendBounded(
      body.teachingGoals,
      '必须严格依据教材知识点原文组织课件，先核对章节主题，再展开法规依据、现场动作、记录证据和风险判断。',
      900,
    ),
    keyPoints: appendBounded(body.keyPoints, titleKeyPoints, 1200),
    caseContext: appendBounded(
      body.caseContext,
      regulationHints ? `关联法规范围：${regulationHints}` : '',
      1200,
    ),
    styleHint: appendBounded(body.styleHint, chapterPptStyleHint(trainingId), 1400),
    sourceMaterials: appendBounded(body.sourceMaterials, sourceMaterials, 18_000),
  }
}
