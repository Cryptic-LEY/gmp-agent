import type { RowDataPacket } from 'mysql2'
import { db } from '@/db'
import { PROJECT_MISSIONS, creditForProjectMedal, medalRank, type ProjectMedal } from './project-missions'

export interface SimulationProjectProgressEntry {
  medal: ProjectMedal
  bestScore: number
  storyScore: number
  bossAccuracy: number
  creditHours: number
  completedAt: string
}

export type SimulationProjectProgressMap = Record<string, SimulationProjectProgressEntry>

interface ProgressRow extends RowDataPacket {
  project_id: number
  medal: ProjectMedal
  best_score: number
  story_score: number
  boss_accuracy: number
  credit_hours: number
  completed_at: string
}

interface RewardClaimRow extends RowDataPacket {
  reward_key: string
  claimed_at: string
}

const VALID_MEDALS: ProjectMedal[] = ['bronze', 'silver', 'gold', 'none']

let ensureTablePromise: Promise<void> | null = null

export function isSimulationMedal(value: unknown): value is ProjectMedal {
  return typeof value === 'string' && VALID_MEDALS.includes(value as ProjectMedal)
}

export async function ensureSimulationProjectProgressTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = db.$client.execute(`
      CREATE TABLE IF NOT EXISTS simulation_project_progress (
        user_id VARCHAR(191) NOT NULL,
        project_id INT NOT NULL,
        medal VARCHAR(32) NOT NULL,
        best_score INT NOT NULL DEFAULT 0,
        story_score INT NOT NULL DEFAULT 0,
        boss_accuracy INT NOT NULL DEFAULT 0,
        credit_hours DOUBLE NOT NULL DEFAULT 0,
        completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id, project_id),
        KEY idx_simulation_project_progress_user_completed (user_id, completed_at),
        CONSTRAINT fk_simulation_project_progress_user FOREIGN KEY (user_id) REFERENCES users(user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).then(() => undefined).catch(error => {
      ensureTablePromise = null
      throw error
    })
  }
  return ensureTablePromise
}

export function projectProgressKey(projectId: number) {
  return String(projectId)
}

function normalizeCreditHours(value: unknown, medal: ProjectMedal, projectId: number) {
  void value
  if (!PROJECT_MISSIONS.some(project => project.id === projectId) || medal === 'none') return 0

  return creditForProjectMedal(projectId, medal)
}

export function isSimulationProjectUnlocked(progress: SimulationProjectProgressMap, projectId: number) {
  if (projectId <= 1) return true
  return progress[projectProgressKey(projectId - 1)]?.medal !== undefined
    && progress[projectProgressKey(projectId - 1)]?.medal !== 'none'
}

export function getCurrentUnlockedSimulationProject(progress: SimulationProjectProgressMap) {
  return PROJECT_MISSIONS.find(project => {
    const key = projectProgressKey(project.id)
    return isSimulationProjectUnlocked(progress, project.id) && progress[key]?.medal === undefined
  }) ?? [...PROJECT_MISSIONS].reverse().find(project => progress[projectProgressKey(project.id)]?.medal !== 'none') ?? PROJECT_MISSIONS[0]
}

export function chooseUnlockedSimulationProject(progress: SimulationProjectProgressMap, preferredProjectId: number | null | undefined) {
  const preferred = PROJECT_MISSIONS.find(project => project.id === preferredProjectId)
  if (preferred && isSimulationProjectUnlocked(progress, preferred.id) && progress[projectProgressKey(preferred.id)]?.medal === undefined) {
    return preferred
  }

  return getCurrentUnlockedSimulationProject(progress)
}

export function getBestSimulationProgressEntry(existing: SimulationProjectProgressEntry | undefined, next: SimulationProjectProgressEntry) {
  if (!existing) return next

  const existingRank = medalRank(existing.medal)
  const nextRank = medalRank(next.medal)
  if (nextRank > existingRank) return next
  if (nextRank === existingRank && next.bestScore > existing.bestScore) return next
  return existing
}

export function mergeSimulationProgressMaps(...maps: SimulationProjectProgressMap[]) {
  return maps.reduce<SimulationProjectProgressMap>((merged, map) => {
    for (const [key, entry] of Object.entries(map)) {
      merged[key] = getBestSimulationProgressEntry(merged[key], entry)
    }
    return merged
  }, {})
}

function toClientEntry(row: ProgressRow): SimulationProjectProgressEntry {
  return {
    medal: row.medal,
    bestScore: Number(row.best_score) || 0,
    storyScore: Number(row.story_score) || 0,
    bossAccuracy: Number(row.boss_accuracy) || 0,
    creditHours: normalizeCreditHours(row.credit_hours, row.medal, row.project_id),
    completedAt: String(row.completed_at),
  }
}

function toProgressMap(rows: ProgressRow[]) {
  return rows.reduce<SimulationProjectProgressMap>((map, row) => {
    if (isSimulationMedal(row.medal) && row.medal !== 'none') {
      map[projectProgressKey(row.project_id)] = toClientEntry(row)
    }
    return map
  }, {})
}

function toMysqlDateTime(value: string | undefined) {
  const date = value ? new Date(value) : new Date()
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  return safeDate.toISOString().slice(0, 23).replace('T', ' ')
}

async function getRewardClaimFallbackProgress(userId: string, existing: SimulationProjectProgressMap) {
  const [claims] = await db.$client.execute<RewardClaimRow[]>(`
    SELECT reward_key, claimed_at
    FROM game_reward_claims
    WHERE user_id = ? AND reward_key LIKE 'simulation:project:%:completion'
    ORDER BY claimed_at ASC
  `, [userId])

  return claims.reduce<SimulationProjectProgressMap>((map, claim) => {
    const projectId = Number(claim.reward_key.match(/^simulation:project:(\d+):completion$/)?.[1])
    if (!Number.isInteger(projectId) || projectId <= 0 || existing[projectProgressKey(projectId)] || map[projectProgressKey(projectId)]) {
      return map
    }

    map[projectProgressKey(projectId)] = {
      medal: 'bronze',
      bestScore: 60,
      storyScore: 60,
      bossAccuracy: 60,
      creditHours: normalizeCreditHours(undefined, 'bronze', projectId),
      completedAt: String(claim.claimed_at),
    }
    return map
  }, {})
}

export async function getUserSimulationProjectProgress(userId: string) {
  await ensureSimulationProjectProgressTable()
  const [rows] = await db.$client.execute<ProgressRow[]>(`
    SELECT project_id, medal, best_score, story_score, boss_accuracy, credit_hours, completed_at
    FROM simulation_project_progress
    WHERE user_id = ?
    ORDER BY project_id ASC
  `, [userId])

  const stored = toProgressMap(rows)
  const fallback = await getRewardClaimFallbackProgress(userId, stored).catch(() => ({}))
  return mergeSimulationProgressMaps(stored, fallback)
}

export async function saveUserSimulationProjectProgress(userId: string, projectId: number, entry: SimulationProjectProgressEntry) {
  if (!PROJECT_MISSIONS.some(project => project.id === projectId)) {
    throw new Error('Invalid simulation project id')
  }
  if (!isSimulationMedal(entry.medal) || entry.medal === 'none') {
    throw new Error('Invalid simulation project medal')
  }

  await ensureSimulationProjectProgressTable()
  const connection = await db.$client.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute<ProgressRow[]>(`
      SELECT project_id, medal, best_score, story_score, boss_accuracy, credit_hours, completed_at
      FROM simulation_project_progress
      WHERE user_id = ? AND project_id = ?
      FOR UPDATE
    `, [userId, projectId])

    const incoming: SimulationProjectProgressEntry = {
      medal: entry.medal,
      bestScore: Math.max(0, Math.min(100, Math.round(Number(entry.bestScore) || 0))),
      storyScore: Math.max(0, Math.min(100, Math.round(Number(entry.storyScore) || 0))),
      bossAccuracy: Math.max(0, Math.min(100, Math.round(Number(entry.bossAccuracy) || 0))),
      creditHours: normalizeCreditHours(entry.creditHours, entry.medal, projectId),
      completedAt: entry.completedAt || new Date().toISOString(),
    }
    const existing = rows[0] ? toClientEntry(rows[0]) : undefined
    const best = getBestSimulationProgressEntry(existing, incoming)

    if (!existing || best !== existing) {
      await connection.execute(`
        INSERT INTO simulation_project_progress
          (user_id, project_id, medal, best_score, story_score, boss_accuracy, credit_hours, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          medal = VALUES(medal),
          best_score = VALUES(best_score),
          story_score = VALUES(story_score),
          boss_accuracy = VALUES(boss_accuracy),
          credit_hours = VALUES(credit_hours),
          completed_at = VALUES(completed_at),
          updated_at = CURRENT_TIMESTAMP(3)
      `, [
        userId,
        projectId,
        best.medal,
        best.bestScore,
        best.storyScore,
        best.bossAccuracy,
        best.creditHours,
        toMysqlDateTime(best.completedAt),
      ])
    }

    await connection.commit()
    return best
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
