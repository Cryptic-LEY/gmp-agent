import { COURSE_ASSIGNMENT_BLUEPRINT, type CourseQuizQuestionType } from '@/lib/course-quiz-blueprint'

export interface CourseAssignmentQuestion {
  id: string
  questionId?: string
  questionType: CourseQuizQuestionType
  stem: string
  points: number
  options: Array<{ key: string; text: string }>
  correctAnswer?: string
  explanation?: string
}

const MARKER_START = '[[AI_ASSIGNMENT_QUESTIONS]]'
const MARKER_END = '[[/AI_ASSIGNMENT_QUESTIONS]]'

export function appendAssignmentQuestions(description: string, questions: CourseAssignmentQuestion[]) {
  return [
    stripAssignmentQuestionBlock(description).trim(),
    MARKER_START,
    JSON.stringify(questions),
    MARKER_END,
  ].filter(Boolean).join('\n')
}

export function extractAssignmentQuestions(description: string | null | undefined) {
  const source = String(description ?? '')
  const start = source.indexOf(MARKER_START)
  const end = source.indexOf(MARKER_END)
  if (start < 0 || end < start) return []

  const jsonText = source.slice(start + MARKER_START.length, end).trim()
  try {
    const parsed = JSON.parse(jsonText)
    return Array.isArray(parsed)
      ? parsed
        .map((item, index) => normalizeAssignmentQuestion(item, index))
        .filter((item): item is CourseAssignmentQuestion => Boolean(item))
      : []
  } catch {
    return []
  }
}

export function stripAssignmentQuestionBlock(description: string | null | undefined) {
  const source = String(description ?? '')
  const start = source.indexOf(MARKER_START)
  const end = source.indexOf(MARKER_END)
  if (start < 0 || end < start) return source
  return `${source.slice(0, start)}${source.slice(end + MARKER_END.length)}`.trim()
}

function normalizeAssignmentQuestion(item: unknown, index: number): CourseAssignmentQuestion | null {
  const source = item as Partial<CourseAssignmentQuestion> | null
  if (!source?.stem || !source.questionType) return null

  return {
    id: String(source.id || `aq_${index + 1}`),
    questionId: source.questionId ? String(source.questionId) : undefined,
    questionType: source.questionType,
    stem: String(source.stem).trim(),
    points: Math.max(1, Math.min(10, Number(source.points ?? 1))),
    options: Array.isArray(source.options)
      ? source.options
        .map(option => ({
          key: String(option?.key ?? '').toUpperCase().slice(0, 1),
          text: String(option?.text ?? '').trim(),
        }))
        .filter(option => option.key && option.text)
      : [],
    correctAnswer: String(source.correctAnswer ?? '').trim(),
    explanation: String(source.explanation ?? '').trim(),
  }
}

export function createFallbackAssignmentQuestions(title: string, description: string | null | undefined) {
  const topic = title.replace(/\s*AI.*$/, '').replace(/作业$/, '').trim() || '本章节'
  const context = stripAssignmentQuestionBlock(description).split(/\n|。|；/).map(item => item.trim()).filter(Boolean)
  const focus = context.find(item => item.length >= 6)?.slice(0, 80) || `${topic} 的 GMP 学习内容`

  return COURSE_ASSIGNMENT_BLUEPRINT.flatMap(quota => Array.from({ length: quota.count }, (_, index) => {
    const id = `${quota.label}_${index + 1}`
    const base = `${topic}：${focus}`
    if (quota.label === '单选题') {
      return {
        id,
        questionType: quota.label,
        points: quota.points,
        stem: `围绕“${base}”，下列哪一项最符合 GMP 管理思路？`,
        options: [
          { key: 'A', text: '以质量风险和法规要求为依据开展控制' },
          { key: 'B', text: '只关注完成进度，记录可后补' },
          { key: 'C', text: '发现异常后暂不记录，等结果稳定再处理' },
          { key: 'D', text: '仅凭经验执行，不需要批准文件' },
        ],
        correctAnswer: 'A',
        explanation: 'GMP 管理应以法规符合性、质量风险控制和完整记录为基础。',
      }
    }
    if (quota.label === '多选题') {
      return {
        id,
        questionType: quota.label,
        points: quota.points,
        stem: `关于“${base}”，哪些做法有助于降低质量风险？`,
        options: [
          { key: 'A', text: '明确职责并按批准规程执行' },
          { key: 'B', text: '及时、真实、完整记录关键活动' },
          { key: 'C', text: '发现偏差后开展原因分析和 CAPA' },
          { key: 'D', text: '为节省时间省略必要复核' },
        ],
        correctAnswer: 'ABC',
        explanation: '关键做法应覆盖职责、记录、偏差调查和 CAPA，不能省略必要复核。',
      }
    }
    if (quota.label === '判断题') {
      return {
        id,
        questionType: quota.label,
        points: quota.points,
        stem: `在“${base}”相关活动中，记录完整性和复核要求可以根据生产忙闲临时调整。`,
        options: [{ key: 'A', text: '对' }, { key: 'B', text: '错' }],
        correctAnswer: 'B',
        explanation: '记录完整性和复核要求属于 GMP 基本要求，不能随意调整。',
      }
    }
    if (quota.label === '填空题') {
      return {
        id,
        questionType: quota.label,
        points: quota.points,
        stem: `在“${topic}”相关 GMP 活动中，应以______为线索识别关键控制点。`,
        options: [],
        correctAnswer: '质量风险',
        explanation: '质量风险是识别关键控制点和制定控制措施的重要线索。',
      }
    }
    if (quota.label === '简答题') {
      return {
        id,
        questionType: quota.label,
        points: quota.points,
        stem: `请简述“${topic}”对应的 2-3 个 GMP 执行要点。`,
        options: [],
        correctAnswer: '参考要点：结合章节内容说明法规依据、职责分工、批准规程、真实完整记录、偏差上报与 CAPA 闭环等执行要点。',
        explanation: '简答题应覆盖法规依据、现场执行和质量风险控制。',
      }
    }
    return {
      id,
      questionType: quota.label,
      points: quota.points,
      stem: `请结合“${topic}”构造一个现场情境，从法规依据、质量风险、原因分析和 CAPA 措施进行综合分析。`,
      options: [],
      correctAnswer: '参考要点：情境描述清楚；能指出适用法规或 GMP 原则；分析质量风险和可能根因；提出纠正预防措施、责任人、时限和有效性确认方法。',
      explanation: '综合分析题应体现情境判断、风险分析、原因分析和 CAPA 闭环。',
    }
  }))
}
