import fs from 'fs'
import path from 'path'
import mysql from 'mysql2/promise'

function splitSqlStatements(sql: string) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(statement => statement.trim())
    .filter(statement => statement && !statement.startsWith('--'))
}

async function main() {
  const mysqlUrl = process.env.MYSQL_URL || process.env.DATABASE_URL
  if (!mysqlUrl) {
    throw new Error('Missing MYSQL_URL. Example: mysql://root:123456@127.0.0.1:3306/gmp')
  }

  const schemaPath = path.resolve(__dirname, 'mysql-schema.sql')
  const statements = splitSqlStatements(fs.readFileSync(schemaPath, 'utf8'))
  const connection = await mysql.createConnection(mysqlUrl)

  try {
    for (const statement of statements) {
      await connection.query(statement)
    }
    console.log(`MySQL schema initialized successfully (${statements.length} statements)`)
  } finally {
    await connection.end()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
