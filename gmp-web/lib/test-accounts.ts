export const TEST_ACCOUNT_EMAILS = [
  'admin@gmp.local',
  '3246073404@qq.com',
  '2260798460@qq.com',
] as const

export function isTestAccountEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase()
  return Boolean(normalized && TEST_ACCOUNT_EMAILS.includes(normalized as typeof TEST_ACCOUNT_EMAILS[number]))
}
