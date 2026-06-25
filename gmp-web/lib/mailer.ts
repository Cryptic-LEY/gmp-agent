import nodemailer from 'nodemailer'
import type { VerificationPurpose } from '@/lib/email-verification'

interface SendVerificationMailResult {
  delivered: boolean
  devOnly: boolean
}

const PURPOSE_COPY: Record<VerificationPurpose, { title: string; action: string }> = {
  login: { title: '登录验证码', action: '登录' },
  register: { title: '注册验证码', action: '注册' },
  'reset-password': { title: '找回密码验证码', action: '重置密码' },
  'change-email': { title: '邮箱换绑验证码', action: '换绑邮箱' },
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM)
}

function smtpPort() {
  if (process.env.SMTP_PORT) return Number(process.env.SMTP_PORT)
  return process.env.SMTP_SECURE === 'true' ? 465 : 587
}

function smtpSecure() {
  if (process.env.SMTP_SECURE) return process.env.SMTP_SECURE === 'true'
  return smtpPort() === 465
}

function buildHtml(code: string, purpose: VerificationPurpose) {
  const copy = PURPOSE_COPY[purpose]
  return `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#183b4b">
      <h2 style="margin:0 0 12px">${copy.title}</h2>
      <p>你正在使用 GMP 助学平台${copy.action}，验证码为：</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:18px 0;color:#0f766e">${code}</p>
      <p>验证码 10 分钟内有效，请勿转发给他人。</p>
      <p style="font-size:12px;color:#7a8b96">如果不是你本人操作，可以忽略这封邮件。</p>
    </div>
  `
}

export async function sendVerificationMail(
  to: string,
  code: string,
  purpose: VerificationPurpose,
): Promise<SendVerificationMailResult> {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === 'production' || process.env.EMAIL_REQUIRE_SMTP === 'true') {
      throw new Error('SMTP is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER and SMTP_PASS.')
    }
    console.info(`[email-code] ${purpose} ${to}: ${code}`)
    return { delivered: false, devOnly: true }
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort(),
    secure: smtpSecure(),
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  })

  const copy = PURPOSE_COPY[purpose]
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: `GMP 助学平台${copy.title}`,
    text: `你的 GMP 助学平台${copy.action}验证码是 ${code}，10 分钟内有效。`,
    html: buildHtml(code, purpose),
  })

  return { delivered: true, devOnly: false }
}
