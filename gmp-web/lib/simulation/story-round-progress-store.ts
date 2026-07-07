import type { RowDataPacket } from 'mysql2'
import { db } from '@/db'
import { PROJECT_MISSIONS } from './project-missions'

interface StoryRoundRow extends RowDataPacket {
  round_id: string
}

const MAX_ROUND_IDS = 256
const MAX_ROUND_ID_LENGTH = 191

let ensureTablePromise: Promise<void> | null = null

export function isSimulationStoryProjectId(value: unknown) {
  const projectId = Number(value)
  return Number.isInteger(projectId) && PROJECT_MISSIONS.some(project => project.id === projectId)
}

export function normalizeSimulationStoryRoundIds(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(item => item.length > 0 && item.length <= MAX_ROUND_ID_LENGTH),
  )).slice(0, MAX_ROUND_IDS)
}

export async function ensureSimulationStoryRoundProgressTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = db.$client.execute(`
      CREATE TABLE IF NOT EXISTS simulation_story_round_progress (
        user_id VARCHAR(191) NOT NULL,
        project_id INT NOT NULL,
        round_id VARCHAR(191) NOT NULL,
        watched_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id, project_id, round_id),
        KEY idx_simulation_story_round_progress_user_project (user_id, project_id, watched_at),
        CONSTRAINT fk_simulation_story_round_progress_user FOREIGN KEY (user_id) REFERENCES users(user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).then(() => undefined).catch(error => {
      ensureTablePromise = null
      throw error
    })
  }
  return ensureTablePromise
}

export async function getUserSimulationStoryRoundIds(userId: string, projectId: number) {
  if (!isSimulationStoryProjectId(projectId)) return []

  await ensureSimulationStoryRoundProgressTable()
  const [rows] = await db.$client.execute<StoryRoundRow[]>(`
    SELECT round_id
    FROM simulation_story_round_progress
    WHERE user_id = ? AND project_id = ?
    ORDER BY watched_at ASC, round_id ASC
  `, [userId, projectId])

  return normalizeSimulationStoryRoundIds(rows.map(row => row.round_id))
}

export async function saveUserSimulationStoryRoundIds(userId: string, projectId: number, roundIds: unknown) {
  if (!isSimulationStoryProjectId(projectId)) return []

  const normalizedRoundIds = normalizeSimulationStoryRoundIds(roundIds)
  await ensureSimulationStoryRoundProgressTable()

  if (normalizedRoundIds.length > 0) {
    const values = normalizedRoundIds.map(() => '(?, ?, ?)').join(', ')
    const params = normalizedRoundIds.flatMap(roundId => [userId, projectId, roundId])
    await db.$client.execute(`
      INSERT INTO simulation_story_round_progress (user_id, project_id, round_id)
      VALUES ${values}
      ON DUPLICATE KEY UPDATE watched_at = watched_at
    `, params)
  }

  return getUserSimulationStoryRoundIds(userId, projectId)
}
