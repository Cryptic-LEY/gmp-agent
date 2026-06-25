import { drizzle } from 'drizzle-orm/mysql2'
import mysql, { type Pool, type QueryResult } from 'mysql2/promise'
import * as schema from './schema'

declare global {
  var __gmpMysqlPool: Pool | undefined
}

function getMysqlUrl() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL
  if (!url) {
    throw new Error('Missing MYSQL_URL. Example: mysql://root:123456@127.0.0.1:3306/gmp')
  }
  return url
}

const pool = globalThis.__gmpMysqlPool ?? mysql.createPool({
  uri: getMysqlUrl(),
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5),
  waitForConnections: true,
  queueLimit: 0,
  namedPlaceholders: false,
  dateStrings: true,
  supportBigNumbers: true,
})

globalThis.__gmpMysqlPool = pool

const drizzleDb = drizzle(pool, { schema, mode: 'default' })

type SqlParam = string | number | boolean | Date | Buffer | null

export async function executeSql<T = Record<string, unknown>>(query: string, params: SqlParam[] = []) {
  const [rows] = await pool.execute(query, params)
  return rows as T[]
}

export async function getSql<T = Record<string, unknown>>(query: string, params: SqlParam[] = []) {
  const rows = await executeSql<T>(query, params)
  return rows[0]
}

export async function runSql(query: string, params: SqlParam[] = []) {
  const [result] = await pool.execute(query, params)
  return result as QueryResult
}

export const db = Object.assign(drizzleDb, {
  $client: pool,
  raw: {
    all: executeSql,
    get: getSql,
    run: runSql,
  },
})
