const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const mysql = require('mysql2/promise')

const ROOT = path.resolve(__dirname, '..')
const DEFAULT_SQLITE_PATH = path.resolve(ROOT, '..', 'gmp.db', 'gmp.db')
const SCHEMA_PATH = path.resolve(ROOT, 'db', 'mysql-schema.sql')
const BATCH_SIZE = Number(process.env.MIGRATION_BATCH_SIZE || 500)

const TABLES = [
  'users',
  'knowledge_points',
  'reg_library',
  'case_library',
  'school_profiles',
  'system_settings',
  'questions',
  'skill_library',
  'training_projects',
  'kp_dependencies',
  'kp_mastery',
  'user_game_state',
  'checkin_log',
  'kp_reg_links',
  'case_kp_links',
  'learning_plans',
  'simulation_sessions',
  'question_history',
  'skill_reg_links',
  'skill_training_links',
  'module_scores',
  'skill_kp_links',
  'course_discussions',
  'course_discussion_replies',
  'course_assignments',
  'course_assignment_submissions',
  'course_study_logs',
  'school_classes',
  'query_log',
  'course_lessons',
  'course_lesson_progress',
  'course_final_tests',
]

const DATE_COLUMNS = new Map([
  ['checkin_log', new Set(['date'])],
  ['school_profiles', new Set(['opened_at', 'expires_at'])],
  ['user_game_state', new Set(['last_login_date'])],
])

const DATETIME_COLUMNS = new Map([
  ['users', new Set(['created_at'])],
  ['knowledge_points', new Set(['updated_at'])],
  ['kp_mastery', new Set(['last_tested_at'])],
  ['user_game_state', new Set(['punish_until'])],
  ['learning_plans', new Set(['created_at'])],
  ['simulation_sessions', new Set(['completed_at'])],
  ['question_history', new Set(['answered_at'])],
  ['questions', new Set(['created_at'])],
  ['school_profiles', new Set(['created_at', 'updated_at'])],
  ['school_classes', new Set(['created_at', 'updated_at'])],
  ['system_settings', new Set(['updated_at'])],
  ['query_log', new Set(['timestamp'])],
  ['module_scores', new Set(['completed_at'])],
  ['course_discussions', new Set(['created_at'])],
  ['course_discussion_replies', new Set(['created_at'])],
  ['course_assignments', new Set(['created_at', 'due_date'])],
  ['course_assignment_submissions', new Set(['submitted_at', 'graded_at'])],
  ['course_study_logs', new Set(['logged_at'])],
  ['course_lessons', new Set(['created_at', 'updated_at'])],
  ['course_lesson_progress', new Set(['updated_at', 'completed_at'])],
  ['course_final_tests', new Set(['completed_at'])],
])

function buildMysqlConnectionUrl(mysqlUrl) {
  const url = new URL(mysqlUrl)
  url.searchParams.set('multipleStatements', 'true')
  url.searchParams.set('dateStrings', 'true')
  url.searchParams.set('supportBigNumbers', 'true')
  return url.toString()
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function getOption(name) {
  const prefix = `${name}=`
  const value = process.argv.find(arg => arg.startsWith(prefix))
  return value ? value.slice(prefix.length) : ''
}

function sqliteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`
}

function mysqlIdent(name) {
  return `\`${name.replace(/`/g, '``')}\``
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return null
  const raw = String(value).trim()
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function pad(value, size = 2) {
  return String(value).padStart(size, '0')
}

function formatDateTime(date) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join('-') + ' ' + [
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join(':') + `.${pad(date.getUTCMilliseconds(), 3)}`
}

function normalizeDateTime(value) {
  if (value === null || value === undefined || value === '') return null
  const raw = String(value).trim()

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(raw)) {
    return raw.includes('.') ? raw : `${raw}.000`
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const date = new Date(raw)
    if (!Number.isNaN(date.getTime())) return formatDateTime(date)
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw} 00:00:00.000`
  }

  const fallback = new Date(raw)
  return Number.isNaN(fallback.getTime()) ? null : formatDateTime(fallback)
}

function normalizeValue(table, column, value) {
  if (DATE_COLUMNS.get(table)?.has(column)) return normalizeDate(value)
  if (DATETIME_COLUMNS.get(table)?.has(column)) return normalizeDateTime(value)
  if (Buffer.isBuffer(value)) return value
  return value
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(statement => statement.trim())
    .filter(statement => statement && !statement.startsWith('--'))
}

async function applySchema(connection) {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8')
  const statements = splitSqlStatements(sql)
  for (const statement of statements) {
    await connection.query(statement)
  }
  await applyCompatibilityAlters(connection)
  console.log(`Created/verified MySQL schema (${statements.length} statements).`)
}

async function applyCompatibilityAlters(connection) {
  const alters = [
    'ALTER TABLE reg_library MODIFY appendix_name TEXT NULL',
    'ALTER TABLE reg_library MODIFY chapter_name TEXT NULL',
    'ALTER TABLE reg_library MODIFY section_name TEXT NULL',
    'ALTER TABLE users ADD COLUMN real_name VARCHAR(255) NULL',
    'ALTER TABLE users ADD COLUMN school VARCHAR(255) NULL',
    'ALTER TABLE users ADD COLUMN major VARCHAR(255) NULL',
    'ALTER TABLE users ADD COLUMN class_name VARCHAR(255) NULL',
    'ALTER TABLE users ADD COLUMN student_id VARCHAR(191) NULL',
    'ALTER TABLE users ADD COLUMN id_card VARCHAR(64) NULL',
    'ALTER TABLE users ADD COLUMN phone VARCHAR(64) NULL',
    'ALTER TABLE users ADD COLUMN avatar_url LONGTEXT NULL',
    'ALTER TABLE users ADD COLUMN teacher_user_id VARCHAR(191) NULL',
    'ALTER TABLE users ADD INDEX idx_users_teacher (teacher_user_id)',
    'ALTER TABLE users ADD CONSTRAINT fk_users_teacher FOREIGN KEY (teacher_user_id) REFERENCES users(user_id)',
    'ALTER TABLE course_lessons ADD COLUMN training_id VARCHAR(191) NULL AFTER lesson_id',
    'ALTER TABLE course_lessons ADD INDEX idx_course_lessons_training (training_id)',
    'ALTER TABLE course_lessons ADD CONSTRAINT fk_course_lessons_training FOREIGN KEY (training_id) REFERENCES training_projects(training_id)',
    'ALTER TABLE course_lessons ADD COLUMN teacher_id VARCHAR(191) NULL AFTER training_id',
    'ALTER TABLE course_lessons ADD INDEX idx_course_lessons_teacher (teacher_id)',
    'ALTER TABLE course_lessons ADD CONSTRAINT fk_course_lessons_teacher FOREIGN KEY (teacher_id) REFERENCES users(user_id)',
  ]

  for (const alter of alters) {
    await connection.query(alter).catch(error => {
      if (
        error?.code !== 'ER_NO_SUCH_TABLE' &&
        error?.code !== 'ER_DUP_FIELDNAME' &&
        error?.code !== 'ER_DUP_KEYNAME' &&
        error?.code !== 'ER_FK_DUP_NAME'
      ) throw error
    })
  }
}

function getSqliteColumns(sqlite, table) {
  return sqlite.prepare(`PRAGMA table_info(${sqliteIdent(table)})`).all().map(column => column.name)
}

async function getMysqlColumns(connection, table) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM ${mysqlIdent(table)}`)
  return rows.map(row => row.Field)
}

function getSqliteTableNames(sqlite) {
  return new Set(sqlite.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name NOT LIKE 'reg_fts%'
      AND name <> '__drizzle_migrations'
  `).all().map(row => row.name))
}

async function truncateTables(connection, tables) {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const table of [...tables].reverse()) {
    await connection.query(`DELETE FROM ${mysqlIdent(table)}`)
    await connection.query(`ALTER TABLE ${mysqlIdent(table)} AUTO_INCREMENT = 1`).catch(() => {})
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1')
}

async function migrateTable(sqlite, connection, table) {
  const sqliteColumns = getSqliteColumns(sqlite, table)
  const mysqlColumns = await getMysqlColumns(connection, table)
  const columns = mysqlColumns.filter(column => sqliteColumns.includes(column))

  if (columns.length === 0) {
    console.log(`- ${table}: skipped, no shared columns`)
    return
  }

  const total = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${sqliteIdent(table)}`).get().count
  if (total === 0) {
    console.log(`- ${table}: 0 rows`)
    return
  }

  const selectSql = `SELECT ${columns.map(sqliteIdent).join(', ')} FROM ${sqliteIdent(table)}`
  const rows = sqlite.prepare(selectSql).all()
  const columnSql = columns.map(mysqlIdent).join(', ')
  const updateSql = columns
    .map(column => `${mysqlIdent(column)} = VALUES(${mysqlIdent(column)})`)
    .join(', ')

  let migrated = 0
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE)
    const placeholders = batch
      .map(() => `(${columns.map(() => '?').join(', ')})`)
      .join(', ')
    const values = []

    for (const row of batch) {
      for (const column of columns) {
        values.push(normalizeValue(table, column, row[column]))
      }
    }

    await connection.query(
      `INSERT INTO ${mysqlIdent(table)} (${columnSql}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updateSql}`,
      values,
    )
    migrated += batch.length
  }

  console.log(`- ${table}: ${migrated}/${total} rows`)
}

async function main() {
  const mysqlUrl = process.env.MYSQL_URL || process.env.DATABASE_URL
  if (!mysqlUrl) {
    throw new Error('Missing MYSQL_URL or DATABASE_URL, for example mysql://root:password@127.0.0.1:3306/gmp')
  }

  const sqlitePath = path.resolve(
    getOption('--sqlite') ||
    process.env.SQLITE_DB_PATH ||
    process.env.GMP_DB_PATH ||
    DEFAULT_SQLITE_PATH,
  )

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite database not found: ${sqlitePath}`)
  }

  const requestedTables = getOption('--tables')
    ? getOption('--tables').split(',').map(item => item.trim()).filter(Boolean)
    : TABLES

  const sqlite = new Database(sqlitePath, { readonly: true })
  const existingSqliteTables = getSqliteTableNames(sqlite)
  const tables = requestedTables.filter(table => existingSqliteTables.has(table))

  const connection = await mysql.createConnection(buildMysqlConnectionUrl(mysqlUrl))

  try {
    console.log(`SQLite: ${sqlitePath}`)
    console.log(`MySQL: ${mysqlUrl.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@')}`)

    if (hasFlag('--create-schema')) {
      await applySchema(connection)
    }

    if (hasFlag('--skip-data')) {
      console.log('Skipped data migration.')
      return
    }

    if (hasFlag('--truncate')) {
      await truncateTables(connection, tables)
      console.log('Cleared target MySQL tables.')
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const table of tables) {
      await migrateTable(sqlite, connection, table)
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1')

    console.log('SQLite to MySQL migration completed.')
  } finally {
    sqlite.close()
    await connection.end()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
