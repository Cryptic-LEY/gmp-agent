export type PracticeMode = 'random' | 'filters' | 'project' | 'knowledge' | 'review'

export type DifficultiesByType = Record<string, string[]>

interface QuestionFilterRow {
  questionType: string
  difficulty: string
}

interface PracticeQuestionSelection {
  mode: PracticeMode
  questionType: string
  difficulty: string
  project: string
  kpId: string
  reviewKpId?: string   // 今日复习模式下当前抽取的 KP
}

export function buildDifficultiesByType(rows: QuestionFilterRow[]): DifficultiesByType {
  return rows.reduce<DifficultiesByType>((grouped, question) => {
    if (!question.questionType || !question.difficulty) return grouped

    const values = grouped[question.questionType] ?? []
    if (!values.includes(question.difficulty)) values.push(question.difficulty)
    grouped[question.questionType] = values
    return grouped
  }, {})
}

export function getVisibleDifficulties(
  allDifficulties: string[],
  difficultiesByType: DifficultiesByType,
  mode: PracticeMode,
  questionType: string,
) {
  if (mode === 'filters' && questionType) return difficultiesByType[questionType] ?? []
  return allDifficulties
}

export function selectQuestionType(
  questionType: string,
  selectedDifficulty: string,
  difficultiesByType: DifficultiesByType,
) {
  return {
    questionType,
    difficulty: (difficultiesByType[questionType] ?? []).includes(selectedDifficulty)
      ? selectedDifficulty
      : '',
  }
}

export function buildPracticeQuestionUrl(selection: PracticeQuestionSelection) {
  // 今日复习模式：按当前抽取的 KP 取题
  if (selection.mode === 'review' && selection.reviewKpId) {
    return `/api/practice/question?kpId=${encodeURIComponent(selection.reviewKpId)}`
  }

  const params = new URLSearchParams()

  if (selection.mode === 'filters' && selection.questionType) params.set('type', selection.questionType)
  if (selection.difficulty) params.set('difficulty', selection.difficulty)

  if (selection.mode === 'project' && selection.project) params.set('project', selection.project)
  if (selection.mode === 'knowledge' && selection.kpId) params.set('kpId', selection.kpId)

  const query = params.toString()
  return `/api/practice/question${query ? `?${query}` : ''}`
}
