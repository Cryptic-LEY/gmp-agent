import { createHash } from 'crypto'
import { mkdir, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { verifyToken } from '@/lib/auth'

export const runtime = 'nodejs'

const MAX_TEXT_LENGTH = 1800
const DEFAULT_TTS_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts'
const DEFAULT_TTS_VOICE = 'alloy'
const DEFAULT_EDGE_VOICE = 'zh-CN-XiaoxiaoNeural'
const DEFAULT_DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1'
const DEFAULT_DASHSCOPE_TTS_MODEL = 'cosyvoice-v3-flash'
const DEFAULT_DASHSCOPE_TTS_VOICE = 'longanhuan'
const TTS_CACHE_VERSION = 'v2-normal-volume'

type TtsProvider = 'dashscope' | 'edge' | 'openai'

interface TtsAudio {
  audio: Buffer
  provider: TtsProvider
  model: string
  voice: string
}

function readToken(req: NextRequest) {
  return req.headers.get('authorization')?.replace('Bearer ', '') ?? ''
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, MAX_TEXT_LENGTH)
}

function normalizeVoice(value: unknown) {
  if (typeof value !== 'string') return process.env.OPENAI_TTS_VOICE || DEFAULT_TTS_VOICE
  const voice = value.trim().toLowerCase()
  return /^[a-z0-9_-]{2,32}$/.test(voice) ? voice : process.env.OPENAI_TTS_VOICE || DEFAULT_TTS_VOICE
}

function normalizeEdgeVoice(value: unknown) {
  const fallback = process.env.EDGE_TTS_VOICE || DEFAULT_EDGE_VOICE
  if (typeof value !== 'string') return fallback
  const voice = value.trim()
  return /^[a-zA-Z0-9_-]{2,80}$/.test(voice) ? voice : fallback
}

function normalizeDashScopeVoice(value: unknown) {
  const fallback = process.env.DASHSCOPE_TTS_VOICE || DEFAULT_DASHSCOPE_TTS_VOICE
  if (typeof value !== 'string') return fallback
  const voice = value.trim()
  return /^[a-zA-Z0-9_-]{2,80}$/.test(voice) ? voice : fallback
}

function getProviderOrder(requestedProvider?: unknown): TtsProvider[] {
  if (requestedProvider === 'dashscope' || requestedProvider === 'edge' || requestedProvider === 'openai') {
    return [requestedProvider]
  }
  const provider = (process.env.TTS_PROVIDER || '').toLowerCase()
  if (provider === 'dashscope') return ['dashscope']
  if (provider === 'openai') return ['openai']
  if (provider === 'edge') return ['edge']
  return ['dashscope', 'edge', 'openai']
}

function voiceForProvider(body: TtsRequestBody, provider: TtsProvider) {
  if (provider === 'dashscope') return body.dashScopeVoice ?? body.voice
  if (provider === 'edge') return body.edgeVoice ?? body.voice
  return body.openAiVoice ?? body.voice
}

async function exists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function streamToBuffer(stream: NodeJS.ReadableStream) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    }
    stream.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    stream.on('error', err => {
      if (settled) return
      settled = true
      reject(err)
    })
    stream.on('end', finish)
    stream.on('close', finish)
  })
}

async function getDashScopeApiKey() {
  const envKey = process.env.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY_ID || ''
  try {
    const row = await db.raw.get<{ value: string | null }>(
      "select `value` from system_settings where `key` = 'dashScopeApiKey' limit 1",
    )
    return row?.value?.trim() || envKey
  } catch {
    return envKey
  }
}

function extractAudioUrl(data: unknown) {
  const root = data as {
    output?: {
      audio?: { url?: string }
      url?: string
      audio_url?: string
    }
    audio?: { url?: string }
  }
  return root?.output?.audio?.url
    || root?.output?.url
    || root?.output?.audio_url
    || root?.audio?.url
    || ''
}

async function synthesizeWithDashScope(text: string, bodyVoice: unknown): Promise<TtsAudio> {
  const apiKey = await getDashScopeApiKey()
  if (!apiKey) throw new Error('DashScope TTS 未配置密钥，请在后台 AI 配置中填写 DashScope API Key')

  const model = process.env.DASHSCOPE_TTS_MODEL || DEFAULT_DASHSCOPE_TTS_MODEL
  const voice = normalizeDashScopeVoice(bodyVoice)
  const baseUrl = (process.env.DASHSCOPE_TTS_BASE_URL || DEFAULT_DASHSCOPE_BASE_URL).replace(/\/+$/, '')
  const upstream = await fetch(`${baseUrl}/services/audio/tts/SpeechSynthesizer`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: {
        text,
        voice,
        format: 'mp3',
        sample_rate: 24000,
      },
    }),
    signal: AbortSignal.timeout(90_000),
  })

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '')
    const message = detail ? detail.slice(0, 240) : `HTTP ${upstream.status}`
    throw new Error(message)
  }

  const data = await upstream.json()
  const audioUrl = extractAudioUrl(data)
  if (!audioUrl) throw new Error('DashScope 未返回音频地址')

  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(90_000) })
  if (!audioRes.ok) {
    throw new Error(`下载 DashScope 音频失败：HTTP ${audioRes.status}`)
  }

  const audio = Buffer.from(await audioRes.arrayBuffer())
  return { audio, provider: 'dashscope', model, voice }
}

async function synthesizeWithEdge(text: string, bodyVoice: unknown): Promise<TtsAudio> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
  const voice = normalizeEdgeVoice(bodyVoice)
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audioStream } = await tts.toStream(text, { rate: 1.0, pitch: '+0Hz', volume: 100 })
  const audio = await streamToBuffer(audioStream)
  return { audio, provider: 'edge', model: 'msedge-tts', voice }
}

async function synthesizeWithOpenAi(text: string, bodyVoice: unknown): Promise<TtsAudio> {
  const apiKey = process.env.OPENAI_TTS_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI TTS 未配置密钥')

  const model = process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL
  const voice = normalizeVoice(bodyVoice)
  const baseUrl = (process.env.OPENAI_TTS_BASE_URL || DEFAULT_TTS_BASE_URL).replace(/\/+$/, '')
  const upstream = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(45_000),
  })

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '')
    const message = detail ? detail.slice(0, 240) : `HTTP ${upstream.status}`
    throw new Error(message)
  }

  const audio = Buffer.from(await upstream.arrayBuffer())
  return { audio, provider: 'openai', model, voice }
}

function cacheTarget(provider: TtsProvider, model: string, voice: string, text: string) {
  const hash = createHash('sha256').update(`${TTS_CACHE_VERSION}|${provider}|${model}|${voice}|${text}`).digest('hex').slice(0, 40)
  const fileName = `${hash}.mp3`
  return {
    fileName,
    audioUrl: `/generated/tts/${fileName}`,
    filePath: join(process.cwd(), 'public', 'generated', 'tts', fileName),
  }
}

type TtsRequestBody = {
  text?: unknown
  voice?: unknown
  provider?: unknown
  dashScopeVoice?: unknown
  edgeVoice?: unknown
  openAiVoice?: unknown
}

export async function POST(req: NextRequest) {
  const payload = verifyToken(readToken(req))
  if (!payload) return NextResponse.json({ success: false, error: '未登录或登录已过期' }, { status: 401 })

  let body: TtsRequestBody = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: '请求内容不是有效 JSON' }, { status: 400 })
  }

  const text = normalizeText(body.text)
  if (!text) return NextResponse.json({ success: false, error: '没有可生成语音的讲解文本' }, { status: 400 })

  const publicDir = join(process.cwd(), 'public', 'generated', 'tts')
  await mkdir(publicDir, { recursive: true })

  const errors: string[] = []
  const providers = getProviderOrder(body.provider)

  for (const provider of providers) {
    const bodyVoice = voiceForProvider(body, provider)
    const model = provider === 'dashscope'
      ? process.env.DASHSCOPE_TTS_MODEL || DEFAULT_DASHSCOPE_TTS_MODEL
      : provider === 'edge'
        ? 'msedge-tts'
        : process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL
    const voice = provider === 'dashscope'
      ? normalizeDashScopeVoice(bodyVoice)
      : provider === 'edge'
        ? normalizeEdgeVoice(bodyVoice)
        : normalizeVoice(bodyVoice)
    const target = cacheTarget(provider, model, voice, text)

    if (await exists(target.filePath)) {
      return NextResponse.json({
        success: true,
        audioUrl: target.audioUrl,
        cached: true,
        provider,
        model,
        voice,
      })
    }

    try {
      const result = provider === 'dashscope'
        ? await synthesizeWithDashScope(text, bodyVoice)
        : provider === 'edge'
          ? await synthesizeWithEdge(text, bodyVoice)
          : await synthesizeWithOpenAi(text, bodyVoice)

      if (result.audio.length < 256) {
        throw new Error('语音服务返回的音频为空')
      }

      const output = cacheTarget(result.provider, result.model, result.voice, text)
      await writeFile(output.filePath, result.audio)
      return NextResponse.json({
        success: true,
        audioUrl: output.audioUrl,
        cached: false,
        provider: result.provider,
        model: result.model,
        voice: result.voice,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${provider}: ${message}`)
    }
  }

  return NextResponse.json(
    { success: false, error: `AI 语音服务暂不可用：${errors.join('；')}`, fallback: 'browser' },
    { status: 502 },
  )
}
