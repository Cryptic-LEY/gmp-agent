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

export interface PendingRegistrationTokenPayload {
  kind: 'pending-registration'
  email: string
  displayName: string
  role: 'student'
  emailVerifiedAt: number
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload
  } catch {
    return null
  }
}

export function signPendingRegistrationToken(payload: Omit<PendingRegistrationTokenPayload, 'kind' | 'emailVerifiedAt'>): string {
  return jwt.sign({
    ...payload,
    kind: 'pending-registration',
    emailVerifiedAt: Date.now(),
  } satisfies PendingRegistrationTokenPayload, getJwtSecret(), { expiresIn: '30m' })
}

export function verifyPendingRegistrationToken(token: string): PendingRegistrationTokenPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as PendingRegistrationTokenPayload
    if (payload.kind !== 'pending-registration' || payload.role !== 'student') {
      return null
    }
    return payload
  } catch {
    return null
  }
}
