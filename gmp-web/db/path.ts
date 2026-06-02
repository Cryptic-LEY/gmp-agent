import path from 'path'

export function getDatabasePath() {
  return process.env.GMP_DB_PATH
    ? path.resolve(process.env.GMP_DB_PATH)
    : path.resolve(process.cwd(), '..', 'gmp.db', 'gmp.db')
}
