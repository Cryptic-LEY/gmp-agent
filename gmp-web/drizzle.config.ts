import type { Config } from 'drizzle-kit'

export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.MYSQL_URL || process.env.DATABASE_URL || 'mysql://root:123456@127.0.0.1:3306/gmp',
  },
} satisfies Config
