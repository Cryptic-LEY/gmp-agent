import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { join, normalize, posix as pathPosix } from 'path'
import { and, asc, eq } from 'drizzle-orm'
import JSZip from 'jszip'
import { db } from '@/db'
import { courseLessons, knowledgePoints, trainingProjects } from '@/db/schema'
import { ensureCourseChapterQuizTable } from '@/lib/course-chapter-quiz'
import {
  CHAPTER_QUIZ_BLUEPRINT,
  CHAPTER_QUIZ_TOTAL_COUNT,
  COURSE_ASSIGNMENT_BLUEPRINT,
  describeCourseQuizBlueprint,
} from '@/lib/course-quiz-blueprint'
import { appendAssignmentQuestions, extractAssignmentQuestions, type CourseAssignmentQuestion } from '@/lib/course-assignment-questions'

type EduLevel = 'college' | 'undergraduate'
type AiQuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'short' | 'analysis'

interface GeneratedQuestion {
  type: AiQuestionType
  stem: string
  options: Array<{ key: string; text: string }>
  answer: string
  difficulty: '易' | '中' | '难'
  explanation: string
}

interface GeneratedAssignment {
  title: string
  description: string
  assignmentType: string
  maxScore: number
  dueDateDays: number
}

interface AiGenerationResult {
  questions: GeneratedQuestion[]
  assignment: GeneratedAssignment
}

interface AutomationContext {
  trainingId: string
  teacherId: string
  eduLevel: EduLevel
  chapterName: string
  projectName: string | null
  knowledgeTitles: string[]
  materialText: string
}

interface CountRow {
  count: number
}

interface LockRow {
  acquired: number | string | null
}

interface AssignmentSummaryRow {
  id: number
  title: string | null
  description: string | null
  assignment_type: string | null
}

const COURSE_ASSET_LOCK_TIMEOUT_SECONDS = 10

const EDU_CN: Record<EduLevel, '专科' | '本科'> = {
  college: '专科',
  undergraduate: '本科',
}

const QUESTION_TYPE_LABEL: Record<AiQuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  fill: '填空题',
  short: '简答题',
  analysis: '综合分析题',
}

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
const DEFAULT_QUESTION_COUNT = CHAPTER_QUIZ_TOTAL_COUNT

function compact(value: string, max = 500) {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function toMysqlDateTime(date: Date) {
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

function buildDueDate(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + Math.max(1, Math.min(30, Math.round(days || 7))))
  date.setHours(23, 59, 59, 0)
  return toMysqlDateTime(date)
}

function getExt(url: string) {
  const clean = url.split('?')[0].split('#')[0].toLowerCase()
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot) : ''
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function normalizeLine(value: string) {
  return decodeXml(value).replace(/\s+/g, ' ').trim()
}

async function loadCourseFileBuffer(url: string) {
  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`Courseware fetch failed: ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  }

  const publicRoot = join(process.cwd(), 'public')
  const relativePath = url.startsWith('/') ? url : `/${url}`
  const filePath = normalize(join(publicRoot, relativePath))
  if (!filePath.startsWith(publicRoot)) throw new Error('Invalid courseware path')
  return readFile(filePath)
}

async function extractPptxText(url: string) {
  if (getExt(url) !== '.pptx') return ''

  try {
    const buffer = await loadCourseFileBuffer(url)
    const zip = await JSZip.loadAsync(buffer)
    const slideFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((left, right) => {
        const leftNo = Number(left.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
        const rightNo = Number(right.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
        return leftNo - rightNo
      })

    const slideTexts: string[] = []
    for (const [index, name] of slideFiles.slice(0, 40).entries()) {
      const xml = await zip.files[name].async('string')
      const lines = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
        .map(match => normalizeLine(match[1]))
        .filter(Boolean)
        .filter((line, lineIndex, arr) => arr.indexOf(line) === lineIndex)
        .slice(0, 12)
      if (lines.length) slideTexts.push(`第 ${index + 1} 页：${lines.join('；')}`)

      const relsXml = await zip.files[`ppt/slides/_rels/slide${index + 1}.xml.rels`]?.async('string')
      const notesPath = relsXml
        ? [...relsXml.matchAll(/<Relationship\b[^>]*Target="([^"]+)"[^>]*>/g)]
          .map(match => match[1])
          .map(target => target.startsWith('/') ? target.replace(/^\/+/, '') : pathPosix.normalize(pathPosix.join('ppt/slides', target)))
          .find(target => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(target))
        : null
      if (notesPath && zip.files[notesPath]) {
        const notesXml = await zip.files[notesPath].async('string')
        const notesLines = [...notesXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
          .map(match => normalizeLine(match[1]))
          .filter(Boolean)
          .slice(0, 6)
        if (notesLines.length) slideTexts.push(`第 ${index + 1} 页讲解备注：${notesLines.join('；')}`)
      }
    }

    return slideTexts.join('\n').slice(0, 12_000)
  } catch (error) {
    console.error('[course-ai-automation] PPT text extraction failed', error)
    return ''
  }
}

function normalizeQuestionType(value: string | undefined): AiQuestionType {
  if (value === 'multiple' || value === '多选题') return 'multiple'
  if (value === 'judge' || value === '判断题') return 'judge'
  if (value === 'fill' || value === '填空题') return 'fill'
  if (value === 'short' || value === '简答题') return 'short'
  if (value === 'analysis' || value === '综合分析题' || value === '案例分析题') return 'analysis'
  return 'single'
}

function normalizeDifficulty(value: string | undefined): '易' | '中' | '难' {
  if (value === '易' || value === 'easy') return '易'
  if (value === '难' || value === 'hard') return '难'
  return '中'
}

function normalizeOptions(type: AiQuestionType, options: unknown): Array<{ key: string; text: string }> {
  if (type === 'judge') return [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
  if (type === 'fill' || type === 'short' || type === 'analysis') return []
  if (!Array.isArray(options)) return []

  return options
    .map((option, index) => {
      const raw = option as { key?: unknown; text?: unknown }
      const key = String(raw.key ?? OPTION_KEYS[index] ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1)
      const text = compact(String(raw.text ?? ''), 240)
      return key && text ? { key, text } : null
    })
    .filter((option): option is { key: string; text: string } => Boolean(option))
    .filter((option, index, arr) => arr.findIndex(item => item.key === option.key) === index)
    .slice(0, 6)
}

function normalizeAnswer(type: AiQuestionType, answer: unknown, options: Array<{ key: string; text: string }>) {
  if (type === 'fill' || type === 'short' || type === 'analysis') {
    return compact(String(answer ?? ''), 1000) || '参考答案需围绕题干要点作答。'
  }

  const available = new Set(options.map(option => option.key))
  const letters = String(answer ?? 'A')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('')
    .filter((letter, index, arr) => available.has(letter) && arr.indexOf(letter) === index)
    .sort()
    .join('')

  if (type === 'multiple') return letters.length >= 2 ? letters : options.slice(0, 2).map(option => option.key).join('')
  if (type === 'judge') return letters === 'B' ? 'B' : 'A'
  return letters[0] ?? options[0]?.key ?? 'A'
}

function aiTypeMatchesLabel(type: AiQuestionType, label: string) {
  return QUESTION_TYPE_LABEL[type] === label
}

function hasRequiredQuestionMix(questions: GeneratedQuestion[]) {
  return CHAPTER_QUIZ_BLUEPRINT.every(quota => {
    const count = questions.filter(question => aiTypeMatchesLabel(question.type, quota.label)).length
    return count >= quota.count
  })
}

function sanitizeAiResult(raw: unknown, fallback: AiGenerationResult): AiGenerationResult {
  const data = raw as Partial<AiGenerationResult> | null
  const questions = Array.isArray(data?.questions)
    ? data.questions
      .map(item => {
        const source = item as Partial<GeneratedQuestion>
        const type = normalizeQuestionType(String(source.type ?? 'single'))
        const options = normalizeOptions(type, source.options)
        if ((type === 'single' || type === 'multiple') && options.length < 2) return null
        const answer = normalizeAnswer(type, source.answer, options)
        return {
          type,
          stem: compact(String(source.stem ?? ''), 800),
          options,
          answer,
          difficulty: normalizeDifficulty(String(source.difficulty ?? '中')),
          explanation: compact(String(source.explanation ?? ''), 800),
        }
      })
      .filter((question): question is GeneratedQuestion => Boolean(question?.stem))
      .slice(0, DEFAULT_QUESTION_COUNT)
    : []

  const assignment = data?.assignment as Partial<GeneratedAssignment> | undefined
  const validQuestions = questions.length >= DEFAULT_QUESTION_COUNT && hasRequiredQuestionMix(questions)
    ? questions.slice(0, DEFAULT_QUESTION_COUNT)
    : fallback.questions

  return {
    questions: validQuestions,
    assignment: {
      title: compact(String(assignment?.title ?? fallback.assignment.title), 180),
      description: String(assignment?.description ?? fallback.assignment.description).trim().slice(0, 3000),
      assignmentType: compact(String(assignment?.assignmentType ?? fallback.assignment.assignmentType), 80),
      maxScore: Math.max(1, Math.min(100, Number(assignment?.maxScore ?? fallback.assignment.maxScore))),
      dueDateDays: Math.max(1, Math.min(30, Number(assignment?.dueDateDays ?? fallback.assignment.dueDateDays))),
    },
  }
}

function fallbackGeneration(context: AutomationContext): AiGenerationResult {
  const focus = context.knowledgeTitles.length
    ? context.knowledgeTitles
    : [`${context.chapterName} 的核心 GMP 要求`, '质量风险管理', '文件记录完整性', '偏差与 CAPA']
  const typeSequence = CHAPTER_QUIZ_BLUEPRINT.flatMap(item => {
    const type: AiQuestionType =
      item.label === '单选题' ? 'single'
        : item.label === '多选题' ? 'multiple'
          : item.label === '判断题' ? 'judge'
            : item.label === '填空题' ? 'fill'
              : item.label === '简答题' ? 'short'
                : 'analysis'
    return Array.from({ length: item.count }, () => type)
  })
  const questions: GeneratedQuestion[] = typeSequence.map((type, index) => {
    const title = focus[index % focus.length]
    if (type === 'multiple') {
      return {
        type: 'multiple',
        stem: `关于“${title}”的学习要求，下列哪些做法符合 GMP 管理思路？`,
        options: [
          { key: 'A', text: '结合风险识别关键控制点' },
          { key: 'B', text: '保留真实、完整、可追溯的记录' },
          { key: 'C', text: '发现偏差后开展原因分析并制定 CAPA' },
          { key: 'D', text: '为提高效率可以省略必要复核' },
        ],
        answer: 'ABC',
        difficulty: '中',
        explanation: 'GMP 强调风险控制、真实记录和持续改进，不能省略必要复核。',
      }
    }
    if (type === 'judge') {
      return {
        type: 'judge',
        stem: `学习“${title}”时，只要完成操作结果，相关过程记录是否完整并不重要。`,
        options: [{ key: 'A', text: '对' }, { key: 'B', text: '错' }],
        answer: 'B',
        difficulty: '易',
        explanation: 'GMP 要求过程可追溯，记录完整性是质量保证的重要基础。',
      }
    }
    if (type === 'fill') {
      return {
        type: 'fill',
        stem: `在“${title}”相关活动中，应以______为线索识别关键控制点并保留可追溯证据。`,
        options: [],
        answer: '质量风险',
        difficulty: index % 3 === 0 ? '易' : '中',
        explanation: '章节学习应把法规要求和质量风险控制联系起来。',
      }
    }
    if (type === 'short') {
      return {
        type: 'short',
        stem: `请简述“${title}”在 GMP 质量体系中的作用，并列出至少 2 个现场执行要点。`,
        options: [],
        answer: '参考要点：说明该要求与质量风险控制、文件记录完整性、人员职责或偏差预防的关系；执行时应明确职责、按批准规程操作、及时真实记录、发现异常及时报告并启动偏差/CAPA。',
        difficulty: '中',
        explanation: '简答题重点考查概念理解与现场执行关联。',
      }
    }
    if (type === 'analysis') {
      return {
        type: 'analysis',
        stem: `某车间在执行“${title}”相关操作时发现记录不完整且复核滞后。请从法规依据、质量风险、原因分析和 CAPA 措施四个方面进行综合分析。`,
        options: [],
        answer: '参考要点：指出记录完整性和及时复核是 GMP 基本要求；分析可能导致批记录不可追溯、偏差未及时发现、产品质量风险扩大；原因可包括培训不足、职责不清、流程设计不合理、现场监督不足；CAPA 应包括补充调查、风险评估、人员再培训、流程优化、复核节点前移和有效性确认。',
        difficulty: '难',
        explanation: '综合分析题考查法规理解、质量风险判断和 CAPA 设计能力。',
      }
    }
    return {
      type: 'single',
      stem: `围绕“${title}”，下列哪一项最符合本章节的 GMP 学习重点？`,
      options: [
        { key: 'A', text: '以质量风险为线索理解法规要求和操作控制' },
        { key: 'B', text: '只记忆术语，不分析实际应用场景' },
        { key: 'C', text: '只关注产量，不关注质量系统运行' },
        { key: 'D', text: '遇到偏差时先完成生产再补充原因分析' },
      ],
      answer: 'A',
      difficulty: index % 3 === 0 ? '易' : '中',
      explanation: '章节学习应围绕质量风险、法规依据和现场应用展开。',
    }
  })

  return {
    questions,
    assignment: {
      title: `${context.chapterName} AI 巩固作业`,
      assignmentType: 'AI综合题组作业',
      maxScore: 100,
      dueDateDays: 7,
      description: [
        `请结合“${context.chapterName}”PPT 内容完成一份小型综合题组作业。`,
        `题量建议：${describeCourseQuizBlueprint(COURSE_ASSIGNMENT_BLUEPRINT)}。`,
        '1. 选择题和判断题直接写题号与答案，例如 1.A、2.AC。',
        '2. 填空题写出关键术语或短语。',
        '3. 简答题需说明法规依据、质量风险和现场执行要点。',
        '4. 综合分析题需包含情境判断、原因分析、CAPA 措施和有效性确认思路。',
        '教师可在后台编辑题目数量、情境和评分关注点。',
      ].join('\n'),
    },
  }
}

function pickAssignmentQuestions(questions: GeneratedQuestion[], prefix: string) {
  const picked: CourseAssignmentQuestion[] = []

  for (const quota of COURSE_ASSIGNMENT_BLUEPRINT) {
    const candidates = questions
      .map((question, index) => ({ question, index }))
      .filter(item => QUESTION_TYPE_LABEL[item.question.type] === quota.label)
    for (const { question, index } of candidates.slice(0, quota.count)) {
      const id = questionId(prefix, question.stem, index)
      picked.push({
        id: `aq_${String(picked.length + 1).padStart(2, '0')}`,
        questionId: id,
        questionType: quota.label,
        stem: question.stem,
        points: quota.points,
        options: question.options,
        correctAnswer: question.answer,
        explanation: question.explanation,
      })
    }
  }

  return picked
}

function withAssignmentQuestionBlock(assignment: GeneratedAssignment, questions: GeneratedQuestion[], prefix: string) {
  const assignmentQuestions = pickAssignmentQuestions(questions, prefix)
  if (assignmentQuestions.length === 0) return assignment
  return {
    ...assignment,
    description: appendAssignmentQuestions(assignment.description, assignmentQuestions),
  }
}

async function generateWithOpenAi(context: AutomationContext, fallback: AiGenerationResult) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { result: fallback, usedFallback: true }

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = process.env.OPENAI_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'
  const prompt = `
请根据课程 PPT 文本和知识点，为 GMP 课程章节自动生成章节测验题和一份课后作业。

章节：${context.trainingId} · ${context.chapterName}
学历层级：${EDU_CN[context.eduLevel]}
项目：${context.projectName ?? '未设置'}
知识点：
${context.knowledgeTitles.slice(0, 20).map((item, index) => `${index + 1}. ${item}`).join('\n') || '暂无结构化知识点'}

PPT/课件文本：
${context.materialText || '暂无可解析 PPT 文本，请基于章节标题和知识点生成。'}

只返回 JSON，不要 Markdown。格式：
{
  "questions": [
    {
      "type": "single | multiple | judge | fill | short | analysis",
      "stem": "题干",
      "options": [{"key":"A","text":"选项，填空/简答/综合分析可为空数组"}],
      "answer": "选择题为 A 或 AB；填空/简答/综合分析为参考答案或评分要点",
      "difficulty": "易 | 中 | 难",
      "explanation": "解析"
    }
  ],
  "assignment": {
    "title": "作业标题",
    "description": "作业说明，包含提交要求和评分关注点",
    "assignmentType": "案例分析/法规梳理/学习反思等",
    "maxScore": 100,
    "dueDateDays": 7
  }
}

要求：
- 严格生成 ${DEFAULT_QUESTION_COUNT} 道章节测验题：${describeCourseQuizBlueprint()}。
- 作业题量少于章节测验，建议使用：${describeCourseQuizBlueprint(COURSE_ASSIGNMENT_BLUEPRINT)}，写进作业说明里。
- 单选/多选必须给出 4 个以上选项；判断题选项固定为“对/错”；填空、简答、综合分析不需要选项。
- 选项必须有明确正确答案，不能出现“以上都对”作为唯一正确选项。
- 填空题答案要短，适合学生输入关键术语。
- 简答题和综合分析题的 answer 字段要写清参考要点，便于教师查看和系统兜底评分。
- 题干要贴近 PPT 内容、GMP 法规理解、质量风险和现场应用。
- 作业要能让学生完成，不要求上传附件，以文本提交为主。
`.trim()

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是 GMP 课程教学设计助手，只输出可解析 JSON。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.25,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`)
    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    const parsed = JSON.parse(content)
    return { result: sanitizeAiResult(parsed, fallback), usedFallback: false }
  } catch (error) {
    console.error('[course-ai-automation] AI generation failed, using fallback', error)
    return { result: fallback, usedFallback: true }
  }
}

export function getCourseAiQuestionPrefix(teacherId: string, trainingId: string, eduLevel: EduLevel) {
  const teacherPart = teacherId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'teacher'
  return `ai_${teacherPart}_${trainingId}_${eduLevel}_`
}

function questionId(prefix: string, stem: string, index: number) {
  const hash = createHash('sha1').update(`${prefix}|${index}|${stem}`).digest('hex').slice(0, 12)
  return `${prefix}${String(index + 1).padStart(2, '0')}_${hash}`
}

async function existingAiQuestionCount(prefix: string) {
  const row = await db.raw.get<CountRow>(
    `SELECT COUNT(*) AS count FROM questions WHERE question_id LIKE ? AND status = 'active'`,
    [`${prefix}%`],
  )
  return Number(row?.count ?? 0)
}

function courseAssetLockName(teacherId: string, trainingId: string, eduLevel: EduLevel) {
  const hash = createHash('sha1').update(`${teacherId}|${trainingId}|${eduLevel}`).digest('hex').slice(0, 40)
  return `gmp_course_assets_${hash}`
}

async function acquireCourseAssetLock(lockName: string) {
  const row = await db.raw.get<LockRow>(
    'SELECT GET_LOCK(?, ?) AS acquired',
    [lockName, COURSE_ASSET_LOCK_TIMEOUT_SECONDS],
  )
  return Number(row?.acquired ?? 0) === 1
}

async function releaseCourseAssetLock(lockName: string) {
  await db.raw.run('SELECT RELEASE_LOCK(?)', [lockName])
}

async function listChapterAssignments(trainingId: string, teacherId: string) {
  return db.raw.all<AssignmentSummaryRow>(
    `
      SELECT id, title, description, assignment_type
      FROM course_assignments
      WHERE training_id = ? AND teacher_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    [trainingId, teacherId],
  )
}

function hasStructuredAssignmentQuestions(assignment: AssignmentSummaryRow) {
  return extractAssignmentQuestions(assignment.description).length > 0
}

function looksLikeLegacyAiAssignment(assignment: AssignmentSummaryRow) {
  return /AI/i.test(`${assignment.title ?? ''} ${assignment.assignment_type ?? ''}`)
}

async function buildAutomationContext(trainingId: string, teacherId: string, eduLevel: EduLevel): Promise<AutomationContext | null> {
  const [chapter] = await db.select().from(trainingProjects)
    .where(eq(trainingProjects.trainingId, trainingId))
    .limit(1)
  if (!chapter) return null

  const lessons = await db.select().from(courseLessons)
    .where(and(
      eq(courseLessons.trainingId, trainingId),
      eq(courseLessons.teacherId, teacherId),
      eq(courseLessons.status, 'published'),
    ))
    .orderBy(asc(courseLessons.sortOrder))

  const projectName = eduLevel === 'undergraduate' ? chapter.kpProjUg : chapter.kpProjCol
  const kps = projectName
    ? await db.select().from(knowledgePoints)
      .where(and(eq(knowledgePoints.projectName, projectName), eq(knowledgePoints.eduLevel, EDU_CN[eduLevel])))
    : []

  const lessonTexts = await Promise.all(lessons.slice(0, 5).map(async lesson => {
    const pptText = lesson.pptUrl ? await extractPptxText(lesson.pptUrl) : ''
    return [
      `课时：${lesson.title}`,
      lesson.description ? `简介：${lesson.description}` : '',
      pptText,
    ].filter(Boolean).join('\n')
  }))

  const materialText = [
    ...lessonTexts,
    kps.slice(0, 24).map(kp => `知识点：${kp.title}${kp.content ? `。${kp.content}` : ''}`).join('\n'),
  ].filter(Boolean).join('\n\n').slice(0, 16_000)

  return {
    trainingId,
    teacherId,
    eduLevel,
    chapterName: chapter.displayName,
    projectName: projectName ?? null,
    knowledgeTitles: kps.map(kp => kp.title).filter(Boolean).slice(0, 30),
    materialText,
  }
}

async function ensureQuizConfig(context: AutomationContext) {
  await ensureCourseChapterQuizTable()
  await db.raw.run(
    `
      INSERT INTO course_chapter_quizzes
        (training_id, teacher_id, title, description, question_count, pass_score, duration_minutes, status)
      VALUES (?, ?, ?, ?, ?, 60, 90, 'published')
      ON DUPLICATE KEY UPDATE
        status = 'published',
        question_count = VALUES(question_count),
        duration_minutes = GREATEST(duration_minutes, VALUES(duration_minutes)),
        description = VALUES(description),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [
      context.trainingId,
      context.teacherId,
      `${context.chapterName} 章节测验`,
      `${context.chapterName} 的 AI 自动生成章节测验：${describeCourseQuizBlueprint()}`,
      DEFAULT_QUESTION_COUNT,
    ],
  )
}

async function ensureAssignment(context: AutomationContext, assignment: GeneratedAssignment) {
  await db.raw.run(
    `
      UPDATE course_assignments
      SET title = ?, description = ?, assignment_type = ?, max_score = ?, due_date = ?
      WHERE training_id = ? AND teacher_id = ?
        AND (assignment_type LIKE 'AI%' OR title LIKE '%AI%')
        AND description NOT LIKE '%[[AI_ASSIGNMENT_QUESTIONS]]%'
    `,
    [
      assignment.title,
      assignment.description,
      assignment.assignmentType || 'AI综合题组作业',
      Math.max(1, Math.min(100, Number(assignment.maxScore || 100))),
      buildDueDate(assignment.dueDateDays),
      context.trainingId,
      context.teacherId,
    ],
  )

  await db.raw.run(
    `
      INSERT INTO course_assignments
        (training_id, teacher_id, title, description, assignment_type, max_score, due_date)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM course_assignments WHERE training_id = ? AND teacher_id = ?
      )
    `,
    [
      context.trainingId,
      context.teacherId,
      assignment.title,
      assignment.description,
      assignment.assignmentType || 'AI综合题组作业',
      Math.max(1, Math.min(100, Number(assignment.maxScore || 100))),
      buildDueDate(assignment.dueDateDays),
      context.trainingId,
      context.teacherId,
    ],
  )
}

async function insertQuestions(context: AutomationContext, questions: GeneratedQuestion[]) {
  const prefix = getCourseAiQuestionPrefix(context.teacherId, context.trainingId, context.eduLevel)
  const kpRows = context.projectName
    ? await db.select({
      kpId: knowledgePoints.kpId,
      title: knowledgePoints.title,
    }).from(knowledgePoints)
      .where(and(eq(knowledgePoints.projectName, context.projectName), eq(knowledgePoints.eduLevel, EDU_CN[context.eduLevel])))
    : []
  const kpIds = kpRows.map(row => row.kpId)

  for (const [index, question] of questions.entries()) {
    const options = question.options.slice(0, 7)
    const values = OPTION_KEYS.map(key => options.find(option => option.key === key)?.text ?? null)
    await db.raw.run(
      `
        INSERT INTO questions (
          question_id, kp_id, question_type, stem, correct_answer, difficulty, option_count,
          option_a, option_b, option_c, option_d, option_e, option_f, option_g,
          explanation, project_name, edu_level, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        ON DUPLICATE KEY UPDATE
          kp_id = VALUES(kp_id),
          question_type = VALUES(question_type),
          stem = VALUES(stem),
          correct_answer = VALUES(correct_answer),
          difficulty = VALUES(difficulty),
          option_count = VALUES(option_count),
          option_a = VALUES(option_a),
          option_b = VALUES(option_b),
          option_c = VALUES(option_c),
          option_d = VALUES(option_d),
          option_e = VALUES(option_e),
          option_f = VALUES(option_f),
          option_g = VALUES(option_g),
          explanation = VALUES(explanation),
          project_name = VALUES(project_name),
          edu_level = VALUES(edu_level),
          status = 'active'
      `,
      [
        questionId(prefix, question.stem, index),
        kpIds[index % Math.max(1, kpIds.length)] ?? null,
        QUESTION_TYPE_LABEL[question.type],
        question.stem,
        question.answer,
        question.difficulty,
        options.length,
        values[0],
        values[1],
        values[2],
        values[3],
        values[4],
        values[5],
        values[6],
        question.explanation,
        context.projectName,
        context.eduLevel,
      ],
    )
  }
}

export async function ensureCourseAiAutomation({
  trainingId,
  teacherId,
  eduLevel,
}: {
  trainingId: string
  teacherId: string
  eduLevel: EduLevel
}) {
  const lockName = courseAssetLockName(teacherId, trainingId, eduLevel)
  const acquired = await acquireCourseAssetLock(lockName)
  if (!acquired) {
    return {
      ok: true,
      generatedQuestions: 0,
      generatedAssignment: false,
      usedFallback: false,
      message: '课程资源正在生成中，请稍后刷新',
    }
  }

  try {
    return await ensureCourseAiAutomationLocked({ trainingId, teacherId, eduLevel })
  } finally {
    try {
      await releaseCourseAssetLock(lockName)
    } catch (error) {
      console.warn('[course-ai-automation] release lock failed', error)
    }
  }
}

async function ensureCourseAiAutomationLocked({
  trainingId,
  teacherId,
  eduLevel,
}: {
  trainingId: string
  teacherId: string
  eduLevel: EduLevel
}) {
  const context = await buildAutomationContext(trainingId, teacherId, eduLevel)
  if (!context) return { ok: false, error: '课程章节不存在' }

  const prefix = getCourseAiQuestionPrefix(teacherId, trainingId, eduLevel)
  const [existingQuestions, existingAssignments] = await Promise.all([
    existingAiQuestionCount(prefix),
    listChapterAssignments(trainingId, teacherId),
  ])
  const needsQuestions = existingQuestions < DEFAULT_QUESTION_COUNT
  const hasStructuredAssignment = existingAssignments.some(hasStructuredAssignmentQuestions)
  const hasLegacyAiAssignment = existingAssignments.some(assignment =>
    looksLikeLegacyAiAssignment(assignment) && !hasStructuredAssignmentQuestions(assignment),
  )
  const needsAssignment = existingAssignments.length === 0 || (!hasStructuredAssignment && hasLegacyAiAssignment)

  await ensureQuizConfig(context)
  if (!needsQuestions && !needsAssignment) {
    return {
      ok: true,
      generatedQuestions: 0,
      generatedAssignment: false,
      usedFallback: false,
      message: '章节测验和作业已就绪',
    }
  }

  const fallback = fallbackGeneration(context)
  const { result, usedFallback } = await generateWithOpenAi(context, fallback)
  const assignment = withAssignmentQuestionBlock(result.assignment, result.questions, prefix)
  if (needsQuestions) await insertQuestions(context, result.questions)
  if (needsAssignment) await ensureAssignment(context, assignment)

  return {
    ok: true,
    generatedQuestions: needsQuestions ? result.questions.length : 0,
    generatedAssignment: needsAssignment,
    usedFallback,
    message: usedFallback
      ? '已使用规则模板生成章节测验和作业，教师可在后台修改'
      : 'AI 已生成章节测验和作业，教师可在后台修改',
  }
}
