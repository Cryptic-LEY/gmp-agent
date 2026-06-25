import type { trainingProjects } from '@/db/schema'

type TrainingProject = typeof trainingProjects.$inferSelect
type EduLevel = 'college' | 'undergraduate'

export const COURSE_TARGET_HOURS: Record<EduLevel, number> = {
  college: 48,
  undergraduate: 54,
}

export const COURSE_LEARNING_CREDIT_TARGET = 350

export const COURSE_HOUR_WEIGHTS = {
  quiz: 0.7,
  assignment: 0.3,
} as const

function normalizeEduLevel(eduLevel: string): EduLevel {
  return eduLevel === 'undergraduate' ? 'undergraduate' : 'college'
}

export function getCourseProjectHours(project: TrainingProject, eduLevel: string) {
  return eduLevel === 'undergraduate' ? (project.hoursUg ?? 0) : (project.hoursCollege ?? 0)
}

export function getCourseChapterMaxHours(projects: TrainingProject[], trainingId: string, eduLevel: string) {
  const normalizedEduLevel = normalizeEduLevel(eduLevel)
  const totalProjectHours = projects.reduce((sum, item) => sum + getCourseProjectHours(item, normalizedEduLevel), 0)
  const project = projects.find(item => item.trainingId === trainingId)
  if (!project || totalProjectHours <= 0) return 0
  return (getCourseProjectHours(project, normalizedEduLevel) / totalProjectHours) * COURSE_TARGET_HOURS[normalizedEduLevel]
}

export function getCourseComponentMaxHours(projects: TrainingProject[], trainingId: string, eduLevel: string, component: keyof typeof COURSE_HOUR_WEIGHTS) {
  return getCourseChapterMaxHours(projects, trainingId, eduLevel) * COURSE_HOUR_WEIGHTS[component]
}

export function scoreToEarnedHours(maxHours: number, score: number) {
  return Number((Math.max(0, maxHours) * (Math.max(0, Math.min(100, score)) / 100)).toFixed(2))
}

export function hoursToCourseCredits(hours: number, eduLevel: string) {
  const normalizedEduLevel = normalizeEduLevel(eduLevel)
  const targetHours = COURSE_TARGET_HOURS[normalizedEduLevel]
  if (targetHours <= 0) return 0

  const cappedHours = Math.max(0, Math.min(targetHours, Number(hours) || 0))
  return Number(((cappedHours / targetHours) * COURSE_LEARNING_CREDIT_TARGET).toFixed(1))
}

export function getCourseChapterMaxCredits(projects: TrainingProject[], trainingId: string, eduLevel: string) {
  return hoursToCourseCredits(getCourseChapterMaxHours(projects, trainingId, eduLevel), eduLevel)
}
