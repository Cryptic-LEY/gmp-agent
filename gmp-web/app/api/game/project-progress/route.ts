import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import {
  getUserSimulationProjectProgress,
  isSimulationMedal,
  saveUserSimulationProjectProgress,
  type SimulationProjectProgressEntry,
} from '@/lib/simulation/project-progress-store'
import { PROJECT_MISSIONS, creditForProjectMedal, type ProjectMedal } from '@/lib/simulation/project-missions'

function cleanScore(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0
}

function cleanCreditHours(value: unknown, medal: ProjectMedal, projectId: number) {
  void value
  const project = PROJECT_MISSIONS.find(item => item.id === projectId)
  if (!project || medal === 'none') return 0

  return creditForProjectMedal(projectId, medal)
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const progress = await getUserSimulationProjectProgress(payload.userId)
  return NextResponse.json({ progress })
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const body = await req.json() as Partial<SimulationProjectProgressEntry> & {
    projectId?: unknown
  }
  const projectId = Number(body.projectId)
  if (!Number.isInteger(projectId) || projectId <= 0 || !isSimulationMedal(body.medal) || body.medal === 'none') {
    return NextResponse.json({ error: 'Invalid simulation project progress payload' }, { status: 400 })
  }

  const entry: SimulationProjectProgressEntry = {
    medal: body.medal,
    bestScore: cleanScore(body.bestScore),
    storyScore: cleanScore(body.storyScore),
    bossAccuracy: cleanScore(body.bossAccuracy),
    creditHours: cleanCreditHours(body.creditHours, body.medal, projectId),
    completedAt: typeof body.completedAt === 'string' && body.completedAt ? body.completedAt : new Date().toISOString(),
  }

  const saved = await saveUserSimulationProjectProgress(payload.userId, projectId, entry)
  const progress = await getUserSimulationProjectProgress(payload.userId)
  return NextResponse.json({ entry: saved, progress })
}
