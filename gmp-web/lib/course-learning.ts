export interface LessonQuestion {
  id: string
  type: 'single' | 'multiple' | 'judge'
  stem: string
  options: Array<{ key: string; text: string }>
  answer: string
  analysis?: string
}

export interface LessonProgressLike {
  pptCompleted?: boolean | number | null
  videoCompleted?: boolean | number | null
  testPassed?: boolean | number | null
  testScore?: number | null
  noteContent?: string | null
  annotationCount?: number | null
}

export interface LessonScoreOptions {
  hasPpt?: boolean
  hasVideo?: boolean
  hasTest?: boolean
}

export const COURSE_PROCESS_SCORE = 350
export const COURSE_FINAL_TEST_SCORE = 150
export const PPT_WEIGHT = 0.25
export const VIDEO_WEIGHT = 0.45
export const TEST_WEIGHT = 0.25
export const NOTE_WEIGHT = 0.05

export function safeJsonArray<T>(value: string | null | undefined, fallback: T[] = []) {
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : fallback
  } catch {
    return fallback
  }
}

export function boolValue(value: boolean | number | null | undefined) {
  return value === true || value === 1
}

export function roundScore(value: number) {
  return Math.round(value * 100) / 100
}

export function getLessonBaseScore(totalLessons: number) {
  return totalLessons > 0 ? COURSE_PROCESS_SCORE / totalLessons : 0
}

export function calculateLessonScore(
  progress: LessonProgressLike,
  lessonBaseScore: number,
  options: LessonScoreOptions = {},
) {
  if (lessonBaseScore <= 0) return 0

  const hasPpt = options.hasPpt ?? true
  const hasVideo = options.hasVideo ?? true
  const hasTest = options.hasTest ?? false
  const pptCompleted = boolValue(progress.pptCompleted)
  const videoCompleted = boolValue(progress.videoCompleted)
  const testPassed = boolValue(progress.testPassed)

  const testScore = Math.max(0, Math.min(100, Number(progress.testScore ?? 0)))
  const hasNote = Boolean(progress.noteContent?.trim()) || Number(progress.annotationCount ?? 0) > 0
  const availableResourceWeight = (hasPpt ? PPT_WEIGHT : 0) + (hasVideo ? VIDEO_WEIGHT : 0)
  if (availableResourceWeight <= 0) return 0

  const completedResourceWeight = (hasPpt && pptCompleted ? PPT_WEIGHT : 0) +
    (hasVideo && videoCompleted ? VIDEO_WEIGHT : 0)
  if (completedResourceWeight <= 0) return 0

  const resourceScore = lessonBaseScore *
    (PPT_WEIGHT + VIDEO_WEIGHT + TEST_WEIGHT) *
    (completedResourceWeight / availableResourceWeight)
  const testBonus = hasTest && testPassed
    ? lessonBaseScore * TEST_WEIGHT * (testScore / 100)
    : 0
  const noteBonus = hasNote ? lessonBaseScore * NOTE_WEIGHT : 0

  return roundScore(Math.min(lessonBaseScore, resourceScore + testBonus + noteBonus))
}

export function isLessonResourceCompleted(progress: LessonProgressLike, options: LessonScoreOptions = {}) {
  const hasPpt = options.hasPpt ?? true
  const hasVideo = options.hasVideo ?? true
  const hasAnyResource = hasPpt || hasVideo
  if (!hasAnyResource) return false
  return (!hasPpt || boolValue(progress.pptCompleted)) &&
    (!hasVideo || boolValue(progress.videoCompleted))
}

export function sanitizeQuestions(questions: LessonQuestion[], includeAnswer = false) {
  return questions.map(question => ({
    id: question.id,
    type: question.type,
    stem: question.stem,
    options: question.options,
    ...(includeAnswer ? { answer: question.answer, analysis: question.analysis ?? '' } : {}),
  }))
}

export function gradeLessonTest(questions: LessonQuestion[], answers: Record<string, string>) {
  if (questions.length === 0) return { score: 0, correctCount: 0, total: 0 }

  let correctCount = 0
  for (const question of questions) {
    const expected = normalizeAnswer(question.answer)
    const actual = normalizeAnswer(answers[question.id] ?? '')
    if (expected && expected === actual) correctCount += 1
  }

  return {
    score: roundScore((correctCount / questions.length) * 100),
    correctCount,
    total: questions.length,
  }
}

function normalizeAnswer(value: string) {
  return value.toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('')
}
