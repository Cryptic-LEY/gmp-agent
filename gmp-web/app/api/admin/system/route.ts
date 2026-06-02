import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { verifyToken } from '@/lib/auth'

const DEFAULT_SETTINGS: Record<string, { value: string; category: string; label: string }> = {
  llmModel: { value: 'qwen-plus', category: 'ai', label: '大模型配置' },
  embeddingModel: { value: 'text-embedding-v4', category: 'ai', label: 'Embedding 模型配置' },
  ragTopK: { value: '8', category: 'ai', label: 'RAG 返回条数' },
  ragScoreThreshold: { value: '0.35', category: 'ai', label: 'RAG 相似度阈值' },
  promptTemplate: { value: '你是 GMP 智能体助学平台的教学助手，请结合知识库、学生画像和当前任务给出准确、可操作的回答。', category: 'ai', label: '提示词模板' },
  knowledgeUpdatedAt: { value: '', category: 'ai', label: '知识库更新时间' },
}

function getAuthPayload(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

function ensureAdmin(req: NextRequest) {
  const payload = getAuthPayload(req)
  return payload?.role === 'admin' ? payload : null
}

async function ensureSettingsSchema() {
  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS system_settings (
      \`key\` varchar(191) primary key not null,
      \`value\` text,
      category varchar(64) not null default 'system',
      label varchar(255),
      updated_at datetime(3) not null default current_timestamp(3) on update current_timestamp(3)
    )
  `)

  for (const [key, item] of Object.entries(DEFAULT_SETTINGS)) {
    await db.raw.run(`
      INSERT IGNORE INTO system_settings (\`key\`, \`value\`, category, label, updated_at)
      VALUES (?, ?, ?, ?, current_timestamp(3))
    `, [key, item.value, item.category, item.label])
  }
}

async function tableExists(tableName: string) {
  const row = await db.raw.get<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = database()
      AND table_name = ?
    LIMIT 1
  `, [tableName])
  return Boolean(row)
}

async function countRows(tableName: string, where = '') {
  if (!(await tableExists(tableName))) return 0
  const allowed = new Set(['query_log', 'question_history', 'users', 'questions', 'knowledge_points'])
  if (!allowed.has(tableName)) return 0
  const row = await db.raw.get<{ count: number }>(`select count(*) as count from \`${tableName}\` ${where}`)
  return Number(row?.count ?? 0)
}

async function getTableCount() {
  const row = await db.raw.get<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM information_schema.tables
    WHERE table_schema = database()
      AND table_type = 'BASE TABLE'
  `)
  return Number(row?.count ?? 0)
}

async function getSettingRows() {
  const rows = await db.raw.all<{ key: string; value: string | null }>('select `key`, `value` from system_settings')
  return new Map(rows.map(row => [row.key, row.value || '']))
}

async function setSetting(key: string, value: string, category = 'ai', label = '') {
  await db.raw.run(`
    INSERT INTO system_settings (\`key\`, \`value\`, category, label, updated_at)
    VALUES (?, ?, ?, ?, current_timestamp(3))
    ON DUPLICATE KEY UPDATE
      \`value\` = VALUES(\`value\`),
      category = VALUES(category),
      label = VALUES(label),
      updated_at = current_timestamp(3)
  `, [key, value, category, label])
}

function maskSecret(value: string) {
  if (!value) return ''
  if (value.length <= 8) return '********'
  return `${value.slice(0, 4)}****${value.slice(-4)}`
}

function directorySizeMB(dirPath: string) {
  try {
    if (!fs.existsSync(dirPath)) return 0
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    let total = 0
    for (const entry of entries) {
      const nextPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) total += directorySizeMB(nextPath) * 1024 * 1024
      else total += fs.statSync(nextPath).size
    }
    return Math.round((total / 1024 / 1024) * 100) / 100
  } catch {
    return 0
  }
}

function recentLogLines() {
  const logPath = path.resolve(process.cwd(), '.next', 'dev', 'logs', 'next-development.log')
  try {
    if (!fs.existsSync(logPath)) return []
    const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean)
    return lines
      .filter(line => line.includes('"level":"ERROR"') || line.includes('"level":"WARN"'))
      .slice(-8)
      .map(line => {
        try {
          const parsed = JSON.parse(line) as { timestamp?: string; level?: string; message?: string; source?: string }
          return {
            time: parsed.timestamp || '',
            level: parsed.level || 'WARN',
            source: parsed.source || 'runtime',
            message: (parsed.message || line).slice(0, 240),
          }
        } catch {
          return { time: '', level: 'WARN', source: 'runtime', message: line.slice(0, 240) }
        }
      })
  } catch {
    return []
  }
}

async function buildMonitoring(settings: Map<string, string>) {
  const dashScopeKey = settings.get('dashScopeApiKey') || process.env.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY_ID || ''
  const queryLogTotal = await countRows('query_log')
  const queryLogToday = await countRows('query_log', 'where date(`timestamp`) = curdate()')
  const answerTotal = await countRows('question_history')
  const answerToday = await countRows('question_history', 'where date(answered_at) = curdate()')
  const errorLogs = recentLogLines()
  const avgLatencyRow = await tableExists('query_log')
    ? await db.raw.get<{ avgLatency: number | null }>('select avg(latency_ms) as avgLatency from query_log where latency_ms is not null')
    : { avgLatency: null }

  const storagePaths = [
    { label: 'MySQL 数据库', path: process.env.MYSQL_URL?.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@') || 'MYSQL_URL', sizeMB: 0 },
    { label: '公开资源', path: path.resolve(process.cwd(), 'public'), sizeMB: directorySizeMB(path.resolve(process.cwd(), 'public')) },
    { label: '素材目录', path: path.resolve(process.cwd(), '..', 'assets'), sizeMB: directorySizeMB(path.resolve(process.cwd(), '..', 'assets')) },
  ]

  return {
    serviceStatus: [
      { name: '前端服务', status: 'ok', detail: 'Next.js 页面服务正常响应' },
      { name: '接口服务', status: 'ok', detail: '管理员 API 可用' },
      { name: '数据库状态', status: 'ok', detail: 'MySQL 可读写' },
      { name: 'AI 服务', status: dashScopeKey ? 'ok' : 'warning', detail: dashScopeKey ? 'DashScope Key 已配置' : 'DashScope Key 未配置' },
      { name: 'RAG 检索', status: queryLogTotal > 0 ? 'ok' : 'warning', detail: queryLogTotal > 0 ? '已有检索调用日志' : '暂无检索调用日志' },
      { name: '存储状态', status: storagePaths.some(item => item.sizeMB > 0) ? 'ok' : 'warning', detail: '资源目录可访问' },
    ],
    apiUsage: {
      total: queryLogTotal + answerTotal,
      today: queryLogToday + answerToday,
      queryLogTotal,
      practiceSubmitTotal: answerTotal,
    },
    aiUsage: {
      total: queryLogTotal,
      today: queryLogToday,
      averageLatencyMs: Math.round(Number(avgLatencyRow.avgLatency || 0)),
      criticTriggered: await tableExists('query_log') ? await countRows('query_log', 'where critic_triggered = 1') : 0,
    },
    database: {
      status: '正常',
      path: process.env.MYSQL_URL?.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@') || 'MYSQL_URL',
      sizeMB: 0,
      tableCount: await getTableCount(),
      userCount: await countRows('users'),
      questionCount: await countRows('questions'),
      knowledgeCount: await countRows('knowledge_points'),
    },
    storage: {
      status: storagePaths.some(item => item.sizeMB > 0) ? '正常' : '待检查',
      items: storagePaths,
      totalMB: Math.round(storagePaths.reduce((sum, item) => sum + item.sizeMB, 0) * 100) / 100,
    },
    errorLogs,
  }
}

function buildSettings(settings: Map<string, string>, dashScopeKey: string) {
  return {
    dashScopeApiKey: '',
    dashScopeApiKeyMasked: maskSecret(dashScopeKey),
    hasDashScopeApiKey: Boolean(dashScopeKey),
    llmModel: settings.get('llmModel') || DEFAULT_SETTINGS.llmModel.value,
    embeddingModel: settings.get('embeddingModel') || DEFAULT_SETTINGS.embeddingModel.value,
    ragTopK: Number(settings.get('ragTopK') || DEFAULT_SETTINGS.ragTopK.value),
    ragScoreThreshold: Number(settings.get('ragScoreThreshold') || DEFAULT_SETTINGS.ragScoreThreshold.value),
    promptTemplate: settings.get('promptTemplate') || DEFAULT_SETTINGS.promptTemplate.value,
    knowledgeUpdatedAt: settings.get('knowledgeUpdatedAt') || '',
  }
}

export async function GET(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureSettingsSchema()
  const settings = await getSettingRows()
  const dashScopeKey = settings.get('dashScopeApiKey') || process.env.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY_ID || ''

  return NextResponse.json({
    settings: buildSettings(settings, dashScopeKey),
    monitoring: await buildMonitoring(settings),
  })
}

export async function PUT(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await ensureSettingsSchema()
    const body = await req.json() as {
      dashScopeApiKey?: string
      clearDashScopeApiKey?: boolean
      llmModel?: string
      embeddingModel?: string
      ragTopK?: number
      ragScoreThreshold?: number
      promptTemplate?: string
      knowledgeUpdatedAt?: string
    }

    if (body.clearDashScopeApiKey) {
      await setSetting('dashScopeApiKey', '', 'ai', 'DashScope API Key')
    } else if (body.dashScopeApiKey?.trim()) {
      await setSetting('dashScopeApiKey', body.dashScopeApiKey.trim(), 'ai', 'DashScope API Key')
    }

    if (body.llmModel !== undefined) await setSetting('llmModel', body.llmModel.trim(), 'ai', '大模型配置')
    if (body.embeddingModel !== undefined) await setSetting('embeddingModel', body.embeddingModel.trim(), 'ai', 'Embedding 模型配置')
    if (body.ragTopK !== undefined) await setSetting('ragTopK', String(Math.max(1, Math.min(30, Number(body.ragTopK) || 8))), 'ai', 'RAG 返回条数')
    if (body.ragScoreThreshold !== undefined) await setSetting('ragScoreThreshold', String(Math.max(0, Math.min(1, Number(body.ragScoreThreshold) || 0.35))), 'ai', 'RAG 相似度阈值')
    if (body.promptTemplate !== undefined) await setSetting('promptTemplate', body.promptTemplate.trim(), 'ai', '提示词模板')
    if (body.knowledgeUpdatedAt !== undefined) await setSetting('knowledgeUpdatedAt', body.knowledgeUpdatedAt, 'ai', '知识库更新时间')

    const settings = await getSettingRows()
    return NextResponse.json({
      success: true,
      settings: buildSettings(settings, settings.get('dashScopeApiKey') || ''),
      monitoring: await buildMonitoring(settings),
    })
  } catch (err) {
    console.error('save system settings failed', err)
    return NextResponse.json({ error: '保存系统配置失败' }, { status: 500 })
  }
}
