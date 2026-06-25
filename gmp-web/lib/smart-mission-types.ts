export type SmartMissionModule =
  | 'dashboard'
  | 'plan'
  | 'course'
  | 'practice'
  | 'simulation'
  | 'progress'
  | 'report'
  | 'streak'
  | 'chat'
  | 'profile'

export interface SmartMissionItem {
  module: SmartMissionModule
  label: string
  title: string
  detail: string
  href: string
  reason: string
  evidence: string[]
  reward: string
  status: 'recommended' | 'next' | 'support' | 'done'
  tone: 'teal' | 'blue' | 'amber' | 'red' | 'green' | 'violet'
}

export interface SmartMissionResponse {
  hasPlan: boolean
  generatedBy: 'rules' | 'ai+rules' | 'starter'
  student: {
    displayName: string
    eduLevel: string
    major: string
    score: number | null
    rankTitle: string
    streakDays: number
  }
  summary: string
  primaryFocus: string
  weakItems: Array<{
    title: string
    priority: 'high' | 'medium' | 'low'
    evidence: string[]
    adaptiveScore: number
    href: string
  }>
  chain: SmartMissionItem[]
  modules: SmartMissionItem[]
  simulation: {
    projectId: number
    projectTitle: string
    missionCode: string
    caseFocus: string
    riskSignal: string
    reward: string
    reason: string
  }
}
