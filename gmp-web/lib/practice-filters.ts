export type PracticeMode = 'random' | 'filters' | 'project' | 'knowledge'

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
  const params = new URLSearchParams()

  if (selection.mode === 'filters' && selection.questionType) params.set('type', selection.questionType)
  if (selection.difficulty) params.set('difficulty', selection.difficulty)

  if (selection.mode === 'project' && selection.project) params.set('project', selection.project)
  if (selection.mode === 'knowledge' && selection.kpId) params.set('kpId', selection.kpId)

  const query = params.toString()
  return `/api/practice/question${query ? `?${query}` : ''}`
}
