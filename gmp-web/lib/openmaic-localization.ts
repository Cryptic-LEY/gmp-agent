const OPENMAIC_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Initializing classroom generation...': '正在初始化课件生成任务...',
  'Analyzing GMP learning goals and context...': '正在分析 GMP 学习目标与章节素材...',
  'Generating classroom outline...': '正在生成课件大纲...',
  'Generating classroom scenes...': '正在生成课件页面...',
  'Preparing visual teaching cards...': '正在准备可视化教学卡片...',
  'Preparing narration notes...': '正在生成讲解备注...',
  'Saving classroom package...': '正在保存课件文件...',
  'Classroom package is ready.': '课件已生成完成。',
  'Classroom generation failed.': '课件生成失败。',
  'Task accepted.': '任务已创建，正在生成...',
  'Internal Server Error': 'OpenMAIC 服务内部错误',
}

export function localizeOpenmaicMessage(value: unknown) {
  if (typeof value !== 'string') return ''
  const message = value.trim()
  if (!message) return ''

  const normalized = message.replace(/\s+/g, ' ')
  const sceneMatch = normalized.match(/^Generating classroom scenes\.\.\.\s*\((\d+)\/(\d+)\)$/i)
  if (sceneMatch) return `正在生成课件页面（${sceneMatch[1]}/${sceneMatch[2]}）`

  return OPENMAIC_MESSAGE_TRANSLATIONS[normalized] ?? message
}

export function localizeOpenmaicPayload<T>(payload: T): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload

  const record = payload as Record<string, unknown>
  const localized: Record<string, unknown> = { ...record }
  const message = localizeOpenmaicMessage(record.message)
  const error = localizeOpenmaicMessage(record.error)

  if (message) localized.message = message
  if (error) localized.error = error

  return localized as T
}
