const CN_NUMBERS: Record<string, string> = {
  '1': '一',
  '2': '二',
  '3': '三',
  '4': '四',
  '5': '五',
  '6': '六',
  '7': '七',
  '8': '八',
  '9': '九',
  '10': '十',
  '11': '十一',
}

export function normalizeCourseProjectName(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .replace(/^专-/, '')
    .replace(/^项目(\d+)/, (_, digit: string) => `项目${CN_NUMBERS[digit] ?? digit}`)
    .replace(/[：:·\-—\s]/g, '')
}

export function courseProjectMatches(actual: string | null | undefined, expected: string | null | undefined) {
  const left = normalizeCourseProjectName(actual)
  const right = normalizeCourseProjectName(expected)
  return Boolean(left && right && left === right)
}
