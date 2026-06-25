import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join, normalize } from 'path'
import JSZip from 'jszip'
import { verifyToken } from '@/lib/auth'

export const runtime = 'nodejs'

interface SlidePreview {
  page: number
  title: string
  lines: string[]
  image?: string | null
  svg: string | null
  notes: string | null
}

function requireTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload || (payload.role !== 'teacher' && payload.role !== 'admin')) return null
  return payload
}

function isAllowedPreviewUrl(req: NextRequest, pptUrl: string) {
  if (pptUrl.startsWith('/course/uploads/ppt/')) return true

  try {
    const requestUrl = new URL(req.url)
    const absolute = new URL(pptUrl, `${requestUrl.protocol}//${requestUrl.host}`)
    if (absolute.origin === `${requestUrl.protocol}//${requestUrl.host}` && absolute.pathname.startsWith('/course/uploads/ppt/')) return true

    const openmaicUrl = new URL(process.env.OPENMAIC_URL ?? 'http://localhost:3002')
    const isOpenmaicOrigin = absolute.origin === openmaicUrl.origin
      || ['localhost', '127.0.0.1', '::1'].includes(absolute.hostname)
    return isOpenmaicOrigin && absolute.pathname.startsWith('/classrooms/')
  } catch {
    return false
  }
}

function noStoreJson(payload: unknown, init?: ResponseInit) {
  const response = NextResponse.json(payload, init)
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  return response
}

function getExt(url: string) {
  const clean = url.split('?')[0].split('#')[0].toLowerCase()
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot) : ''
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function normalizeLine(value: string) {
  return decodeXml(value).replace(/\s+/g, ' ').trim()
}

function collectText(xml: string) {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
    .map(match => normalizeLine(match[1]))
    .filter(Boolean)
}

async function loadPptBuffer(req: NextRequest, url: string) {
  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`PPT file read failed: ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  }

  if (url.startsWith('/')) {
    const publicRoot = join(process.cwd(), 'public')
    const filePath = normalize(join(publicRoot, url))
    if (!filePath.startsWith(publicRoot)) throw new Error('Invalid courseware path')
    return readFile(filePath)
  }

  const requestUrl = new URL(req.url)
  const absoluteUrl = new URL(url, `${requestUrl.protocol}//${requestUrl.host}`).toString()
  const response = await fetch(absoluteUrl, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`PPT file read failed: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function parsePptx(buffer: Buffer): Promise<SlidePreview[]> {
  const zip = await JSZip.loadAsync(buffer)
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => {
      const leftNo = Number(left.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      const rightNo = Number(right.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return leftNo - rightNo
    })

  return Promise.all(slideFiles.map(async (name, index) => {
    const xml = await zip.files[name].async('string')
    const lines = collectText(xml)
      .filter((line, lineIndex, arr) => arr.indexOf(line) === lineIndex)
    return {
      page: index + 1,
      title: lines.find(line => line.length > 1) ?? `第 ${index + 1} 页`,
      lines: lines.slice(1, 9),
      image: null,
      svg: null,
      notes: null,
    }
  }))
}

export async function POST(req: NextRequest) {
  if (!requireTeacher(req)) return noStoreJson({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { pptUrl?: string }
  const pptUrl = String(body.pptUrl ?? '').trim()
  if (!pptUrl) return noStoreJson({ error: '缺少课件文件地址' }, { status: 400 })
  if (!isAllowedPreviewUrl(req, pptUrl)) return noStoreJson({ error: '课件文件地址不在允许预览范围内' }, { status: 400 })

  const ext = getExt(pptUrl)
  if (ext === '.pdf') return noStoreJson({ previewType: 'pdf', url: pptUrl, slides: [] })
  if (ext !== '.pptx') return noStoreJson({ previewType: 'unsupported', url: pptUrl, slides: [], error: '当前仅支持 PDF 与 PPTX 预览，PPT 文件请下载后查看。' })

  try {
    const buffer = await loadPptBuffer(req, pptUrl)
    const slides = await parsePptx(buffer)
    return noStoreJson({ previewType: 'pptx', url: pptUrl, slides })
  } catch (error) {
    console.error('[teacher/course/ppt-preview] failed', error)
    return noStoreJson(
      { previewType: 'unsupported', url: pptUrl, slides: [], error: '课件预览生成失败，请下载原文件查看。' },
      { status: 200 },
    )
  }
}
