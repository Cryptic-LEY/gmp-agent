export type CourseQuizQuestionType = '单选题' | '多选题' | '判断题' | '填空题' | '简答题' | '综合分析题' | '案例分析题'

export interface CourseQuizQuota {
  label: CourseQuizQuestionType
  matchTypes: CourseQuizQuestionType[]
  count: number
  points: number
}

export const CHAPTER_QUIZ_RETAKE_LIMIT = 3
export const CHAPTER_QUIZ_MAX_ATTEMPTS = CHAPTER_QUIZ_RETAKE_LIMIT + 1

export const CHAPTER_QUIZ_BLUEPRINT: CourseQuizQuota[] = [
  { label: '单选题', matchTypes: ['单选题'], count: 20, points: 1 },
  { label: '多选题', matchTypes: ['多选题'], count: 10, points: 2 },
  { label: '判断题', matchTypes: ['判断题'], count: 10, points: 1 },
  { label: '填空题', matchTypes: ['填空题'], count: 10, points: 2 },
  { label: '简答题', matchTypes: ['简答题'], count: 5, points: 3 },
  { label: '综合分析题', matchTypes: ['综合分析题', '案例分析题'], count: 5, points: 3 },
]

export const COURSE_ASSIGNMENT_BLUEPRINT: CourseQuizQuota[] = [
  { label: '单选题', matchTypes: ['单选题'], count: 8, points: 1 },
  { label: '多选题', matchTypes: ['多选题'], count: 4, points: 2 },
  { label: '判断题', matchTypes: ['判断题'], count: 4, points: 1 },
  { label: '填空题', matchTypes: ['填空题'], count: 4, points: 2 },
  { label: '简答题', matchTypes: ['简答题'], count: 2, points: 3 },
  { label: '综合分析题', matchTypes: ['综合分析题', '案例分析题'], count: 2, points: 3 },
]

export const CHAPTER_QUIZ_TOTAL_COUNT = CHAPTER_QUIZ_BLUEPRINT.reduce((sum, item) => sum + item.count, 0)
export const CHAPTER_QUIZ_TOTAL_POINTS = CHAPTER_QUIZ_BLUEPRINT.reduce((sum, item) => sum + item.count * item.points, 0)

export function isChoiceQuestionType(questionType: string) {
  return questionType === '单选题' || questionType === '多选题' || questionType === '判断题'
}

export function isTextQuestionType(questionType: string) {
  return questionType === '填空题' || questionType === '简答题' || questionType === '综合分析题' || questionType === '案例分析题'
}

export function isSubjectiveQuestionType(questionType: string) {
  return questionType === '简答题' || questionType === '综合分析题' || questionType === '案例分析题'
}

export function getCourseQuizQuestionPoints(questionType: string) {
  const quota = CHAPTER_QUIZ_BLUEPRINT.find(item => item.matchTypes.includes(questionType as CourseQuizQuestionType))
  return quota?.points ?? 1
}

export function getCourseAssignmentQuestionPoints(questionType: string) {
  const quota = COURSE_ASSIGNMENT_BLUEPRINT.find(item => item.matchTypes.includes(questionType as CourseQuizQuestionType))
  return quota?.points ?? 1
}

export function describeCourseQuizBlueprint(items = CHAPTER_QUIZ_BLUEPRINT) {
  return items.map(item => `${item.count}道${item.label}`).join('、')
}
