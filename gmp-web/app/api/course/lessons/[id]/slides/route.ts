import { readFile } from 'fs/promises'
import { join, normalize, posix as pathPosix } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { courseLessons } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { canUseTeacherResource } from '@/lib/course-teacher-scope'

export const runtime = 'nodejs'

const SLIDE_WIDTH = 12_192_000
const SLIDE_HEIGHT = 6_858_000
const SVG_WIDTH = 1280
const SVG_HEIGHT = 720
const PX_PER_PT = 1.333

interface SlidePreview {
  page: number
  title: string
  lines: string[]
  svg: string | null
  notes: string | null
}

interface SlideShape {
  x: number
  y: number
  cx: number
  cy: number
  textLines: string[]
  fill: string
  stroke: string
  fontColor: string
  fontSizePt: number
  bold: boolean
  align: 'left' | 'center' | 'right'
  geometry: string
}

interface SlidePicture {
  x: number
  y: number
  cx: number
  cy: number
  dataUrl: string
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

function escapeSvg(value: string) {
  return decodeXml(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeLine(value: string) {
  return decodeXml(value).replace(/\s+/g, ' ').trim()
}

function toNumber(value: string | undefined, fallback = 0) {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function firstSection(xml: string, pattern: RegExp) {
  return xml.match(pattern)?.[0] ?? ''
}

function firstAttr(xml: string, attr: string) {
  return xml.match(new RegExp(`${attr}="([^"]+)"`))?.[1]
}

function getTransform(block: string) {
  const xfrm = firstSection(block, /<a:xfrm\b[\s\S]*?<\/a:xfrm>/)
  const off = xfrm.match(/<a:off\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/)
  const ext = xfrm.match(/<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/)
  return {
    x: toNumber(off?.[1]),
    y: toNumber(off?.[2]),
    cx: toNumber(ext?.[1], SLIDE_WIDTH),
    cy: toNumber(ext?.[2], SLIDE_HEIGHT),
  }
}

function themeColor(value: string | undefined) {
  const palette: Record<string, string> = {
    tx1: '#1F1F1F',
    tx2: '#44546A',
    bg1: '#FFFFFF',
    bg2: '#E7E6E6',
    accent1: '#4472C4',
    accent2: '#ED7D31',
    accent3: '#A5A5A5',
    accent4: '#FFC000',
    accent5: '#5B9BD5',
    accent6: '#70AD47',
    hlink: '#0563C1',
    folHlink: '#954F72',
  }
  return value ? palette[value] ?? '#44546A' : '#44546A'
}

function solidColor(xml: string, fallback: string) {
  if (!xml) return fallback
  const srgb = xml.match(/<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/)?.[1]
  if (srgb) return `#${srgb.toUpperCase()}`
  const scheme = xml.match(/<a:schemeClr\b[^>]*val="([^"]+)"/)?.[1]
  if (scheme) return themeColor(scheme)
  if (/<a:noFill\s*\/>/.test(xml) || /<a:noFill>/.test(xml)) return 'none'
  return fallback
}

function collectText(block: string) {
  return [...block.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
    .map(match => normalizeLine(match[1]))
    .filter(Boolean)
}

function collectNotesText(notesXml: string) {
  const shapeBlocks = [...notesXml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)].map(match => match[0])
  const bodyShape = shapeBlocks.find(block => /<p:ph\b[^>]*type="body"/.test(block))
  const source = bodyShape || notesXml
  const lines = collectText(source)
    .map(line => line.replace(/^讲解提示[:：]\s*/, '讲解提示：').replace(/^课堂活动[:：]\s*/, '课堂活动：'))
    .filter(line => line.length > 1 && !/^\d+$/.test(line))
    .filter((line, index, arr) => arr.indexOf(line) === index)

  return lines.join('\n').trim() || null
}

function parseShape(block: string): SlideShape | null {
  const txBody = firstSection(block, /<p:txBody\b[\s\S]*?<\/p:txBody>/)
  const textLines = collectText(txBody)
  const spPr = firstSection(block, /<p:spPr\b[\s\S]*?<\/p:spPr>/)
  const lineXml = firstSection(spPr, /<a:ln\b[\s\S]*?<\/a:ln>/)
  const { x, y, cx, cy } = getTransform(block)
  if (cx <= 0 || cy <= 0) return null

  const fill = solidColor(spPr, textLines.length ? 'none' : '#FFFFFF')
  const stroke = solidColor(lineXml, 'none')
  if (!textLines.length && fill === 'none' && stroke === 'none') return null

  const fontSizePt = Math.max(8, Math.min(54, toNumber(txBody.match(/\bsz="(\d+)"/)?.[1], 1800) / 100))
  const fontColor = solidColor(txBody, '#26364A')
  const bold = /\bb="(?:1|true)"/.test(txBody)
  const alignment = txBody.match(/\balgn="([^"]+)"/)?.[1]
  const geometry = spPr.match(/<a:prstGeom\b[^>]*prst="([^"]+)"/)?.[1] ?? 'rect'

  return {
    x,
    y,
    cx,
    cy,
    textLines,
    fill,
    stroke,
    fontColor,
    fontSizePt,
    bold,
    align: alignment === 'ctr' ? 'center' : alignment === 'r' ? 'right' : 'left',
    geometry,
  }
}

function isPageMarker(text: string) {
  return /^(\d{1,2}|0\d|第\s*\d+\s*页|\d+\s*\/\s*\d+)$/.test(text.trim())
}

function pickSlideTitle(shapes: SlideShape[], lines: string[], page: number) {
  const candidates = shapes
    .flatMap(shape => shape.textLines.map((text, lineIndex) => ({
      text,
      score: shape.fontSizePt * 10 + (shape.bold ? 30 : 0) - lineIndex * 4 - shape.y / 400_000,
    })))
    .filter(item => item.text.length > 1 && !isPageMarker(item.text))
    .sort((left, right) => right.score - left.score)

  return candidates[0]?.text
    ?? lines.find(line => line.length > 1 && !isPageMarker(line))
    ?? lines[0]
    ?? `第 ${page} 页`
}

function parseRelationships(xml: string, slidePath: string) {
  const baseDir = pathPosix.dirname(slidePath)
  const rels = new Map<string, string>()
  for (const match of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = match[0]
    const id = firstAttr(tag, 'Id')
    const target = firstAttr(tag, 'Target')
    if (!id || !target) continue
    const zipPath = target.startsWith('/')
      ? target.replace(/^\/+/, '')
      : pathPosix.normalize(pathPosix.join(baseDir, target))
    rels.set(id, zipPath)
  }
  return rels
}

function imageMime(path: string) {
  const ext = getExt(path)
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  return 'image/png'
}

async function parsePicture(block: string, zip: JSZip, rels: Map<string, string>): Promise<SlidePicture | null> {
  const rid = block.match(/\br:embed="([^"]+)"/)?.[1] ?? block.match(/\br:link="([^"]+)"/)?.[1]
  const target = rid ? rels.get(rid) : null
  if (!target || !zip.files[target]) return null
  const { x, y, cx, cy } = getTransform(block)
  if (cx <= 0 || cy <= 0) return null
  const media = await zip.files[target].async('nodebuffer')
  return {
    x,
    y,
    cx,
    cy,
    dataUrl: `data:${imageMime(target)};base64,${media.toString('base64')}`,
  }
}

async function parseNotes(zip: JSZip, rels: Map<string, string>) {
  const notesPath = [...rels.values()].find(target => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(target))
  if (!notesPath || !zip.files[notesPath]) return null
  const notesXml = await zip.files[notesPath].async('string')
  return collectNotesText(notesXml)
}

function wrapLine(line: string, maxChars: number) {
  if (line.length <= maxChars) return [line]
  const chunks: string[] = []
  for (let index = 0; index < line.length; index += maxChars) {
    chunks.push(line.slice(index, index + maxChars))
  }
  return chunks
}

function sx(value: number) {
  return Number((value / SLIDE_WIDTH * SVG_WIDTH).toFixed(2))
}

function sy(value: number) {
  return Number((value / SLIDE_HEIGHT * SVG_HEIGHT).toFixed(2))
}

function renderText(shape: SlideShape) {
  if (!shape.textLines.length) return ''
  const x = sx(shape.x)
  const y = sy(shape.y)
  const w = sx(shape.cx)
  const h = sy(shape.cy)
  const padding = Math.max(8, Math.min(24, w * 0.06))
  const fontSize = Math.max(10, Number((shape.fontSizePt * PX_PER_PT).toFixed(2)))
  const lineHeight = fontSize * 1.25
  const maxChars = Math.max(4, Math.floor((w - padding * 2) / (fontSize * 0.58)))
  const lines = shape.textLines.flatMap(line => wrapLine(line, maxChars)).slice(0, Math.max(1, Math.floor((h - padding) / lineHeight)))
  const textX = shape.align === 'center'
    ? x + w / 2
    : shape.align === 'right'
      ? x + w - padding
      : x + padding
  const anchor = shape.align === 'center' ? 'middle' : shape.align === 'right' ? 'end' : 'start'
  const firstY = y + padding + fontSize

  return [
    `<text x="${textX}" y="${firstY}" fill="${shape.fontColor}" font-size="${fontSize}" font-weight="${shape.bold ? 700 : 400}" text-anchor="${anchor}">`,
    ...lines.map((line, index) => (
      `<tspan x="${textX}" y="${firstY + index * lineHeight}">${escapeSvg(line)}</tspan>`
    )),
    '</text>',
  ].join('')
}

function renderShape(shape: SlideShape) {
  const x = sx(shape.x)
  const y = sy(shape.y)
  const w = sx(shape.cx)
  const h = sy(shape.cy)
  const fill = shape.fill === 'none' ? 'none' : shape.fill
  const stroke = shape.stroke === 'none' ? 'none' : shape.stroke
  const strokeAttrs = `stroke="${stroke}" stroke-width="${stroke === 'none' ? 0 : 1.2}"`
  const shapeMarkup = shape.geometry === 'ellipse'
    ? `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" ${strokeAttrs}/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${shape.geometry === 'roundRect' ? 8 : 0}" fill="${fill}" ${strokeAttrs}/>`

  return `${shapeMarkup}${renderText(shape)}`
}

function renderPicture(pic: SlidePicture) {
  return `<image href="${pic.dataUrl}" x="${sx(pic.x)}" y="${sy(pic.y)}" width="${sx(pic.cx)}" height="${sy(pic.cy)}" preserveAspectRatio="xMidYMid meet"/>`
}

function slideBackground(xml: string) {
  const bg = firstSection(xml, /<p:bg\b[\s\S]*?<\/p:bg>/)
  return solidColor(bg, '#FFFFFF')
}

function buildSlideSvg(xml: string, shapes: SlideShape[], pictures: SlidePicture[]) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img">`,
    '<style>text{font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif;dominant-baseline:auto} tspan{white-space:pre}</style>',
    `<rect x="0" y="0" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="${slideBackground(xml)}"/>`,
    ...pictures.map(renderPicture),
    ...shapes.map(renderShape),
    '</svg>',
  ].join('')
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

  const slides: SlidePreview[] = []
  for (const [index, name] of slideFiles.entries()) {
    const xml = await zip.files[name].async('string')
    const relsXml = await zip.files[`ppt/slides/_rels/slide${index + 1}.xml.rels`]?.async('string')
    const rels = relsXml ? parseRelationships(relsXml, name) : new Map<string, string>()
    const shapeBlocks = [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)].map(match => match[0])
    const shapes = shapeBlocks.map(parseShape).filter((shape): shape is SlideShape => Boolean(shape))
    const pictureBlocks = [...xml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)].map(match => match[0])
    const pictures = (await Promise.all(pictureBlocks.map(block => parsePicture(block, zip, rels))))
      .filter((pic): pic is SlidePicture => Boolean(pic))
    const notes = await parseNotes(zip, rels)

    const lines = shapeBlocks
      .flatMap(collectText)
      .map(normalizeLine)
      .filter(Boolean)
      .filter((line, lineIndex, arr) => arr.indexOf(line) === lineIndex)

    slides.push({
      page: index + 1,
      title: pickSlideTitle(shapes, lines, index + 1),
      lines: lines.slice(1, 9),
      svg: buildSlideSvg(xml, shapes, pictures),
      notes,
    })
  }

  return slides
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [lesson] = await db.select().from(courseLessons).where(eq(courseLessons.lessonId, id)).limit(1)
  if (!lesson || lesson.status !== 'published' || !(await canUseTeacherResource(payload, lesson.teacherId))) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  const pptUrl = lesson.pptUrl || ''
  if (!pptUrl) {
    return NextResponse.json({ previewType: 'empty', slides: [] })
  }

  const ext = getExt(pptUrl)
  if (ext === '.pdf') {
    return NextResponse.json({ previewType: 'pdf', url: pptUrl, slides: [] })
  }
  if (ext !== '.pptx') {
    return NextResponse.json({ previewType: 'unsupported', url: pptUrl, slides: [] })
  }

  try {
    const buffer = await loadPptBuffer(req, pptUrl)
    const slides = await parsePptx(buffer)
    return NextResponse.json({ previewType: 'pptx', url: pptUrl, slides })
  } catch (error) {
    console.error('[course/lesson/slides] failed', error)
    return NextResponse.json(
      { previewType: 'unsupported', url: pptUrl, slides: [], error: '课件预览生成失败，可直接打开原文件查看。' },
      { status: 200 },
    )
  }
}
