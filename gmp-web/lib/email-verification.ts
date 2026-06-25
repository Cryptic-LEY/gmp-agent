import { createHash, randomInt } from 'crypto'
import { db } from '@/db'
import { ensureAuthStorage } from '@/lib/auth-storage'

export type VerificationPurpose = 'login' | 'register' | 'reset-password' | 'change-email'

export class VerificationCodeError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

interface CodeRow {
  id: number
  code_hash: string
  attempts: number
  expired: number
}

export function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() ?? ''
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function codeSecret() {
  return process.env.EMAIL_CODE_SECRET
    || process.env.JWT_SECRET
    || 'gmp-dev-email-code-secret'
}

function hashCode(email: string, purpose: VerificationPurpose, code: string) {
  return createHash('sha256')
    .update(`${email}:${purpose}:${code}:${codeSecret()}`)
    .digest('hex')
}

export function generateVerificationCode() {
  return String(randomInt(100000, 1000000))
}

export async function createVerificationCode(
  emailInput: string,
  purpose: VerificationPurpose,
  role?: string,
) {
  const email = normalizeEmail(emailInput)
  if (!isValidEmail(email)) {
    throw new VerificationCodeError('请输入有效的邮箱地址')
  }

  await ensureAuthStorage()

  const minuteWindow = await db.raw.get<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM auth_email_codes
    WHERE email = ? AND purpose = ? AND consumed_at IS NULL AND created_at > DATE_SUB(NOW(3), INTERVAL 60 SECOND)
  `, [email, purpose])
  if (Number(minuteWindow?.count ?? 0) > 0) {
    throw new VerificationCodeError('验证码发送太频繁，请 60 秒后再试', 429)
  }

  const hourWindow = await db.raw.get<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM auth_email_codes
    WHERE email = ? AND purpose = ? AND created_at > DATE_SUB(NOW(3), INTERVAL 1 HOUR)
  `, [email, purpose])
  if (Number(hourWindow?.count ?? 0) >= 10) {
    throw new VerificationCodeError('该邮箱验证码发送次数过多，请稍后再试', 429)
  }

  const code = generateVerificationCode()
  await db.raw.run(`
    UPDATE auth_email_codes
    SET consumed_at = NOW(3)
    WHERE email = ? AND purpose = ? AND consumed_at IS NULL
  `, [email, purpose])
  await db.raw.run(`
    INSERT INTO auth_email_codes (email, purpose, role, code_hash, expires_at)
    VALUES (?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL 10 MINUTE))
  `, [email, purpose, role ?? null, hashCode(email, purpose, code)])

  return {
    email,
    code,
    expiresIn: 600,
  }
}

export async function verifyVerificationCode(
  emailInput: string,
  purpose: VerificationPurpose,
  codeInput: string,
) {
  const email = normalizeEmail(emailInput)
  const code = codeInput.trim()
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    throw new VerificationCodeError('验证码格式不正确')
  }

  await ensureAuthStorage()

  const row = await db.raw.get<CodeRow>(`
    SELECT id, code_hash, attempts, IF(expires_at <= NOW(3), 1, 0) AS expired
    FROM auth_email_codes
    WHERE email = ? AND purpose = ? AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `, [email, purpose])

  if (!row) {
    throw new VerificationCodeError('请先获取邮箱验证码')
  }
  if (Number(row.expired) === 1) {
    await db.raw.run('UPDATE auth_email_codes SET consumed_at = NOW(3) WHERE id = ?', [row.id])
    throw new VerificationCodeError('验证码已过期，请重新获取')
  }
  if (Number(row.attempts) >= 5) {
    await db.raw.run('UPDATE auth_email_codes SET consumed_at = NOW(3) WHERE id = ?', [row.id])
    throw new VerificationCodeError('验证码错误次数过多，请重新获取', 429)
  }

  if (row.code_hash !== hashCode(email, purpose, code)) {
    await db.raw.run(`
      UPDATE auth_email_codes
      SET attempts = attempts + 1,
          consumed_at = IF(attempts + 1 >= 5, NOW(3), consumed_at)
      WHERE id = ?
    `, [row.id])
    throw new VerificationCodeError('验证码不正确')
  }

  await db.raw.run('UPDATE auth_email_codes SET consumed_at = NOW(3) WHERE id = ?', [row.id])
  return { email }
}

export async function discardPendingVerificationCodes(
  emailInput: string,
  purpose: VerificationPurpose,
) {
  const email = normalizeEmail(emailInput)
  if (!isValidEmail(email)) return

  await ensureAuthStorage()
  await db.raw.run(`
    UPDATE auth_email_codes
    SET consumed_at = NOW(3)
    WHERE email = ? AND purpose = ? AND consumed_at IS NULL
  `, [email, purpose])
}
