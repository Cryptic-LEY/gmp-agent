export const PASSWORD_POLICY_MESSAGE = '密码至少 8 位，且需包含大写字母、小写字母、数字和特殊字符'

const STRONG_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

export const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: '至少 8 位', test: (value: string) => value.length >= 8 },
  { key: 'uppercase', label: '包含大写字母', test: (value: string) => /[A-Z]/.test(value) },
  { key: 'lowercase', label: '包含小写字母', test: (value: string) => /[a-z]/.test(value) },
  { key: 'number', label: '包含数字', test: (value: string) => /\d/.test(value) },
  { key: 'special', label: '包含特殊字符', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const

export function isStrongPassword(value?: string | null) {
  return typeof value === 'string' && STRONG_PASSWORD_PATTERN.test(value)
}
