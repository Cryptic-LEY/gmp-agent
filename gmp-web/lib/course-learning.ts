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

export function calculateLessonScore(progress: LessonProgressLike, lessonBaseScore: number) {
  const pptCompleted = boolValue(progress.pptCompleted)
  const videoCompleted = boolValue(progress.videoCompleted)
  const testPassed = boolValue(progress.testPassed)

  if (!pptCompleted || !videoCompleted || !testPassed) return 0

  const testScore = Math.max(0, Math.min(100, Number(progress.testScore ?? 0)))
  const hasNote = Boolean(progress.noteContent?.trim()) || Number(progress.annotationCount ?? 0) > 0

  return roundScore(
    lessonBaseScore * PPT_WEIGHT +
    lessonBaseScore * VIDEO_WEIGHT +
    lessonBaseScore * TEST_WEIGHT * (testScore / 100) +
    (hasNote ? lessonBaseScore * NOTE_WEIGHT : 0),
  )
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
