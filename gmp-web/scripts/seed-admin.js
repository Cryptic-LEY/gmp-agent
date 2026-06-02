const bcrypt = require('bcryptjs')
const mysql = require('mysql2/promise')

const mysqlUrl = process.env.MYSQL_URL || process.env.DATABASE_URL
if (!mysqlUrl) {
  throw new Error('Missing MYSQL_URL. Example: mysql://root:123456@127.0.0.1:3306/gmp')
}

const email = process.env.GMP_ADMIN_EMAIL || 'admin@gmp.local'
const password = process.env.GMP_ADMIN_PASSWORD || 'Admin@123456'
const displayName = process.env.GMP_ADMIN_NAME || '系统管理员'
const userId = '8edc3e62-b567-47e0-acf9-7636e307c785'

async function main() {
  const connection = await mysql.createConnection(mysqlUrl)

  try {
    console.log(`Database: ${mysqlUrl.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@')}`)
    const passwordHash = await bcrypt.hash(password, 10)
    const [rows] = await connection.execute('select user_id from users where email = ? limit 1', [email])
    const existing = Array.isArray(rows) && rows.length > 0

    if (existing) {
      await connection.execute(`
        update users
        set display_name = ?,
            password_hash = ?,
            role = 'admin',
            persona = 'admin'
        where email = ?
      `, [displayName, passwordHash, email])
    } else {
      await connection.execute(`
        insert into users (
          user_id, org_id, role, persona, display_name, email, password_hash
        ) values (
          ?, 'default', 'admin', 'admin', ?, ?, ?
        )
      `, [userId, displayName, email, passwordHash])
    }

    console.log(`Admin account is ready: ${email}`)
    console.log(`Password: ${password}`)
  } finally {
    await connection.end()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
