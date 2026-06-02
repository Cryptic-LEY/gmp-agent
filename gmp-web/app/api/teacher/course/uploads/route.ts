import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { extname, join } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

export const runtime = 'nodejs'

type UploadKind = 'ppt' | 'video'

const UPLOAD_RULES: Record<UploadKind, { dir: string; maxSize: number; extensions: Set<string>; mimeTypes: Set<string> }> = {
  ppt: {
    dir: 'ppt',
    maxSize: 120 * 1024 * 1024,
    extensions: new Set(['.pdf', '.ppt', '.pptx']),
    mimeTypes: new Set([
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]),
  },
  video: {
    dir: 'video',
    maxSize: 800 * 1024 * 1024,
    extensions: new Set(['.mp4', '.webm', '.ogg', '.ogv']),
    mimeTypes: new Set(['video/mp4', 'video/webm', 'video/ogg']),
  },
}

const FALLBACK_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/ogg': '.ogg',
}

function requireTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload || (payload.role !== 'teacher' && payload.role !== 'admin')) return null
  return payload
}

function isUploadKind(value: FormDataEntryValue | null): value is UploadKind {
  return value === 'ppt' || value === 'video'
}

function isValidFile(file: FormDataEntryValue | null): file is File {
  return file instanceof File && file.size > 0
}

export async function POST(req: NextRequest) {
  if (!requireTeacher(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const kind = formData.get('kind')
  const file = formData.get('file')

  if (!isUploadKind(kind)) return NextResponse.json({ error: '上传类型不正确' }, { status: 400 })
  if (!isValidFile(file)) return NextResponse.json({ error: '请选择要上传的文件' }, { status: 400 })

  const rule = UPLOAD_RULES[kind]
  const originalName = file.name || 'course-resource'
  const lowerName = originalName.toLowerCase()
  const originalExt = extname(lowerName)
  const mimeType = file.type || ''
  const extension = rule.extensions.has(originalExt) ? originalExt : FALLBACK_EXTENSIONS[mimeType]

  if (!extension || (!rule.extensions.has(originalExt) && !rule.mimeTypes.has(mimeType))) {
    return NextResponse.json({ error: kind === 'ppt' ? '请上传 PDF、PPT 或 PPTX 文件' : '请上传 MP4、WebM 或 OGG 视频' }, { status: 400 })
  }

  if (file.size > rule.maxSize) {
    const maxSizeMb = Math.floor(rule.maxSize / 1024 / 1024)
    return NextResponse.json({ error: `文件不能超过 ${maxSizeMb}MB` }, { status: 400 })
  }

  const fileName = `${Date.now()}-${randomUUID()}${extension}`
  const relativeDir = `/course/uploads/${rule.dir}`
  const publicDir = join(process.cwd(), 'public', 'course', 'uploads', rule.dir)
  const filePath = join(publicDir, fileName)

  await mkdir(publicDir, { recursive: true })
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()))

  return NextResponse.json({
    url: `${relativeDir}/${fileName}`,
    originalName,
    size: file.size,
  })
}
