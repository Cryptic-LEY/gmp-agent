import type { RowDataPacket } from 'mysql2'
import { db } from '@/db'

export interface SimulationWalletSnapshot {
  coins: number
  gems: number
  trophies: number
  unlockedHeroIds?: string[]
}

export interface StoredSimulationWallet extends RowDataPacket {
  simulation_coins: number | null
  simulation_gems: number | null
  simulation_trophies: number | null
  simulation_unlocked_heroes_json: string | null
  simulation_wallet_synced_at: string | null
}

const MAX_WALLET_AMOUNT = 2_147_483_647
const MAX_HERO_IDS = 24
const MAX_HERO_ID_LENGTH = 64

let ensureWalletColumnsPromise: Promise<void> | null = null

function clampWalletAmount(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return 0
  return Math.max(0, Math.min(MAX_WALLET_AMOUNT, Math.round(numberValue)))
}

function normalizeHeroIds(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const ids = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0 && item.length <= MAX_HERO_ID_LENGTH)
  return Array.from(new Set(ids)).slice(0, MAX_HERO_IDS)
}

export function normalizeSimulationWalletSnapshot(value: unknown): SimulationWalletSnapshot {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    coins: clampWalletAmount(record.coins),
    gems: clampWalletAmount(record.gems),
    trophies: clampWalletAmount(record.trophies),
    unlockedHeroIds: normalizeHeroIds(record.unlockedHeroIds),
  }
}

export async function ensureSimulationWalletColumns() {
  if (!ensureWalletColumnsPromise) {
    ensureWalletColumnsPromise = (async () => {
      await db.raw.run(`
        ALTER TABLE user_game_state
        ADD COLUMN simulation_coins INT NOT NULL DEFAULT 0
      `).catch(() => undefined)
      await db.raw.run(`
        ALTER TABLE user_game_state
        ADD COLUMN simulation_gems INT NOT NULL DEFAULT 0
      `).catch(() => undefined)
      await db.raw.run(`
        ALTER TABLE user_game_state
        ADD COLUMN simulation_trophies INT NOT NULL DEFAULT 0
      `).catch(() => undefined)
      await db.raw.run(`
        ALTER TABLE user_game_state
        ADD COLUMN simulation_unlocked_heroes_json LONGTEXT
      `).catch(() => undefined)
      await db.raw.run(`
        ALTER TABLE user_game_state
        ADD COLUMN simulation_wallet_synced_at DATETIME(3)
      `).catch(() => undefined)
    })().catch(error => {
      ensureWalletColumnsPromise = null
      throw error
    })
  }
  return ensureWalletColumnsPromise
}

export async function ensureSimulationWalletRowsForStudents() {
  await ensureSimulationWalletColumns()
  await db.$client.execute(`
    INSERT IGNORE INTO user_game_state (user_id)
    SELECT user_id FROM users WHERE role = 'student'
  `)
}

export async function saveSimulationWalletSnapshot(userId: string, snapshot: SimulationWalletSnapshot) {
  await ensureSimulationWalletColumns()

  const normalized = normalizeSimulationWalletSnapshot(snapshot)
  const heroIds = normalized.unlockedHeroIds

  await db.$client.execute('INSERT IGNORE INTO user_game_state (user_id) VALUES (?)', [userId])
  if (heroIds) {
    await db.$client.execute(`
      UPDATE user_game_state
      SET simulation_coins = ?,
          simulation_gems = ?,
          simulation_trophies = ?,
          simulation_unlocked_heroes_json = ?,
          simulation_wallet_synced_at = CURRENT_TIMESTAMP(3)
      WHERE user_id = ?
    `, [
      normalized.coins,
      normalized.gems,
      normalized.trophies,
      JSON.stringify(heroIds),
      userId,
    ])
  } else {
    await db.$client.execute(`
      UPDATE user_game_state
      SET simulation_coins = ?,
          simulation_gems = ?,
          simulation_trophies = ?,
          simulation_wallet_synced_at = CURRENT_TIMESTAMP(3)
      WHERE user_id = ?
    `, [
      normalized.coins,
      normalized.gems,
      normalized.trophies,
      userId,
    ])
  }

  return normalized
}

export async function getSimulationWalletSnapshot(userId: string) {
  await ensureSimulationWalletColumns()
  await db.$client.execute('INSERT IGNORE INTO user_game_state (user_id) VALUES (?)', [userId])

  const [rows] = await db.$client.execute<StoredSimulationWallet[]>(`
    SELECT
      simulation_coins,
      simulation_gems,
      simulation_trophies,
      simulation_unlocked_heroes_json,
      simulation_wallet_synced_at
    FROM user_game_state
    WHERE user_id = ?
    LIMIT 1
  `, [userId])

  const row = rows[0]
  return {
    coins: Number(row?.simulation_coins) || 0,
    gems: Number(row?.simulation_gems) || 0,
    trophies: Number(row?.simulation_trophies) || 0,
    unlockedHeroIds: normalizeHeroIds(parseHeroJson(row?.simulation_unlocked_heroes_json)) ?? [],
    syncedAt: row?.simulation_wallet_synced_at ?? null,
  }
}

export function parseHeroJson(value: string | null | undefined) {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}
