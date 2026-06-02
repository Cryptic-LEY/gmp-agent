import jwt from 'jsonwebtoken'

function getJwtSecret(): string {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'gmp-dev-secret-change-me'
  }

  throw new Error('JWT_SECRET is not configured')
}

export interface JwtPayload {
  userId: string
  role: string
  orgId: string
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload
  } catch {
    return null
  }
}
