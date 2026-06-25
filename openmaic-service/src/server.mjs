import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import pptxgen from 'pptxgenjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')
const CLASSROOM_DIR = path.join(PUBLIC_DIR, 'classrooms')
const JOBS_PATH = path.join(DATA_DIR, 'jobs.json')

const DEFAULT_PORT = 3002
const MAX_BODY_SIZE = 1024 * 1024
const GENERATION_DELAY_MS = Number(process.env.OPENMAIC_STEP_DELAY_MS || 650)

const jobs = new Map()

const STEP_MESSAGES = {
  initializing: '正在初始化课件生成任务...',
  researching: '正在分析 GMP 学习目标与章节素材...',
  generating_outlines: '正在生成课件大纲...',
  generating_scenes: '正在生成课件页面...',
  generating_media: '正在准备可视化教学卡片...',
  generating_tts: '正在生成讲解备注...',
  persisting: '正在保存课件文件...',
  completed: '课件已生成完成。',
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

await ensureRuntimeDirs()
await loadJobs()

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res)
  } catch (error) {
    console.error('[openmaic] request failed:', error)
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error',
    })
  }
})

const port = readPort()
server.listen(port, () => {
  console.log(`OpenMAIC service listening on http://localhost:${port}`)
})

async function route(req, res) {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `localhost:${port}`}`)
  const pathname = decodeURIComponent(requestUrl.pathname)

  if (req.method === 'OPTIONS') {
    sendEmpty(res, 204)
    return
  }

  if (req.method === 'GET' && pathname === '/') {
    sendHtml(res, renderHomePage())
    return
  }

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'openmaic-service',
      jobs: jobs.size,
      generatedAt: new Date().toISOString(),
    })
    return
  }

  if (req.method === 'POST' && pathname === '/api/generate-classroom') {
    await handleCreateJob(req, res)
    return
  }

  if (req.method === 'GET' && pathname.startsWith('/api/generate-classroom/')) {
    const jobId = pathname.split('/').pop()
    await handleGetJob(jobId, res)
    return
  }

  if (req.method === 'GET' && pathname.startsWith('/classrooms/')) {
    await serveClassroomFile(pathname, res)
    return
  }

  sendJson(res, 404, { success: false, error: 'Not Found' })
}

async function handleCreateJob(req, res) {
  const body = await readJsonBody(req)
  const requirement = normalizeRequirement(body.requirement)
  if (!requirement) {
    sendJson(res, 400, {
      success: false,
      error: 'Field "requirement" is required.',
    })
    return
  }

  const now = new Date().toISOString()
  const jobId = `maic_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`
  const job = {
    success: true,
    jobId,
    status: 'running',
    done: false,
    step: 'initializing',
    progress: 3,
    message: STEP_MESSAGES.initializing,
    scenesGenerated: 0,
    totalScenes: null,
    classroomUrl: null,
    summaryUrl: null,
    outlineUrl: null,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    request: {
      requirement,
      trainingId: cleanText(body.trainingId, 32),
      chapterTitle: cleanText(body.chapterTitle, 200),
      projectName: cleanText(body.projectName, 500),
      eduLevel: cleanText(body.eduLevel, 32),
      teachingGoals: cleanText(body.teachingGoals, 900),
      keyPoints: cleanText(body.keyPoints, 1200),
      caseContext: cleanText(body.caseContext, 1200),
      sourceMaterials: cleanLongText(body.sourceMaterials, 18_000),
      studentLevel: cleanText(body.studentLevel, 120),
      classHours: cleanText(body.classHours, 120),
      styleHint: cleanText(body.styleHint, 500),
      slideCount: normalizeSlideCount(body.slideCount, requirement),
      enableWebSearch: Boolean(body.enableWebSearch),
      agentMode: typeof body.agentMode === 'string' ? body.agentMode : 'local',
    },
    baseUrl: getBaseUrl(req),
  }

  jobs.set(jobId, job)
  await saveJobs()

  runJob(jobId).catch(async error => {
    console.error(`[openmaic] job ${jobId} failed:`, error)
    await patchJob(jobId, {
      status: 'failed',
      done: true,
      progress: 100,
      error: error instanceof Error ? error.message : String(error),
      message: 'Classroom generation failed.',
    })
  })

  sendJson(res, 202, {
    success: true,
    jobId,
    status: job.status,
    done: false,
    step: job.step,
    progress: job.progress,
    message: job.message,
    scenesGenerated: 0,
    totalScenes: null,
  })
}

async function handleGetJob(jobId, res) {
  const job = jobs.get(jobId)
  if (!job) {
    sendJson(res, 404, {
      success: false,
      error: `Job not found: ${jobId}`,
    })
    return
  }

  sendJson(res, 200, publicJob(job))
}

async function runJob(jobId) {
  await sleep(GENERATION_DELAY_MS)
  await patchJob(jobId, {
    step: 'researching',
    progress: 16,
    message: STEP_MESSAGES.researching,
  })

  await sleep(GENERATION_DELAY_MS)
  const job = jobs.get(jobId)
  if (!job) return
  const classroom = buildClassroom(job.request)

  await patchJob(jobId, {
    step: 'generating_outlines',
    progress: 28,
    totalScenes: classroom.scenes.length,
    message: STEP_MESSAGES.generating_outlines,
  })

  for (let i = 0; i < classroom.scenes.length; i += 1) {
    await sleep(Math.max(220, Math.floor(GENERATION_DELAY_MS * 0.55)))
    await patchJob(jobId, {
      step: 'generating_scenes',
      progress: Math.min(74, 36 + Math.round(((i + 1) / classroom.scenes.length) * 38)),
      scenesGenerated: i + 1,
      totalScenes: classroom.scenes.length,
      message: `${STEP_MESSAGES.generating_scenes} (${i + 1}/${classroom.scenes.length})`,
    })
  }

  await sleep(GENERATION_DELAY_MS)
  await patchJob(jobId, {
    step: 'generating_media',
    progress: 82,
    message: STEP_MESSAGES.generating_media,
  })

  await sleep(Math.max(200, Math.floor(GENERATION_DELAY_MS * 0.6)))
  await patchJob(jobId, {
    step: 'generating_tts',
    progress: 90,
    message: STEP_MESSAGES.generating_tts,
  })

  await sleep(Math.max(200, Math.floor(GENERATION_DELAY_MS * 0.5)))
  await patchJob(jobId, {
    step: 'persisting',
    progress: 96,
    message: STEP_MESSAGES.persisting,
  })

  const current = jobs.get(jobId)
  if (!current) return
  const result = await writeClassroomPackage(current, classroom)

  await patchJob(jobId, {
    status: 'succeeded',
    done: true,
    step: 'completed',
    progress: 100,
    message: STEP_MESSAGES.completed,
    scenesGenerated: classroom.scenes.length,
    totalScenes: classroom.scenes.length,
    classroomUrl: result.url,
    summaryUrl: result.summaryUrl,
    outlineUrl: result.outlineUrl,
    result,
  })
}

function buildClassroom(input) {
  const request = typeof input === 'string' ? { requirement: input } : (input || {})
  const topic = cleanPresentationTopic(request.chapterTitle || request.requirement).slice(0, 140) || 'GMP教学课件'
  const material = parseCourseMaterials(request.sourceMaterials)
  const profile = detectTopicProfile([
    topic,
    request.teachingGoals,
    request.keyPoints,
    request.caseContext,
    request.sourceMaterials,
  ].filter(Boolean).join(' '))
  const stylePreset = resolveCourseStyle(request, profile, topic)
  const slideCount = normalizeSlideCount(request.slideCount, [
    topic,
    request.requirement,
    request.teachingGoals,
    request.keyPoints,
    request.caseContext,
    request.sourceMaterials,
  ].filter(Boolean).join(' '))
  const goals = splitPromptList(request.teachingGoals, [
    '理解本主题在 GMP 质量管理体系中的法规依据与控制逻辑。',
    '能够识别典型合规缺陷、风险信号与关键证据链。',
    '能够基于案例提出偏差调查、CAPA 与持续改进建议。',
  ])
  const promptKeyPoints = splitPromptList(request.keyPoints, [
    profile.regulationBullets[0],
    profile.workflowBullets[0],
    profile.riskBullets[0],
  ])
  const keyPoints = mergeSlideBullets(material.knowledgeBullets, promptKeyPoints, 6)
  const regulationBullets = material.regulationBullets.length
    ? material.regulationBullets.slice(0, 4)
    : [
      '第一级：法律顶层，《药品管理法》奠定监管根基。',
      '第二级：行政法规与部门规章，明确生产许可、MAH 与质量责任。',
      '第三级：GMP 规范与附录，规定机构人员、厂房设施、文件与生产控制。',
      '第四级：指南、检查要点与缺陷案例，支撑现场合规判断。',
    ]
  const materialOverview = material.knowledgeBullets.length
    ? material.knowledgeBullets.slice(0, 5)
    : keyPoints.slice(0, 5)
  const caseBullets = splitPromptList(request.caseContext, profile.caseBullets)
  const audience = request.studentLevel || '药学、制药工程与药品质量管理相关学生'
  const classHours = request.classHours || '1-2 学时'
  const styleHint = [
    `章节风格：${stylePreset.name}`,
    stylePreset.signature,
    request.styleHint || '参考 GMP 培训课件：法规体系、缺陷数据、流程卡片、案例研讨、课堂总结。',
  ].filter(Boolean).join('；')

  const scenes = [
    buildScene('cover', `药品生产质量管理规范（GMP）`, topic, [
      `${request.trainingId ? `${request.trainingId} · ` : ''}${topic}`,
      `适用对象：${audience}`,
      `建议课时：${classHours}`,
      `风格参考：${stylePreset.name} · ${stylePreset.signature}`,
    ], '封面页先建立法规严肃感，再引出本节课主题与真实生产场景。', '教师用 1 个真实检查缺陷导入课程。', 'cover'),
    buildScene('objectives', '课程学习目标与核心重难点', '知识目标 / 技能目标 / 素养目标', goals.concat([
      `重点：${keyPoints[0]}`,
      `难点：把法规要求转化为现场可检查的证据。`,
    ]), '按“知道、会做、能判断”三个层次讲清楚学习目标。', '学生用便签写下最想解决的一个 GMP 问题。', 'objectives'),
    buildScene('source', '教材原文定位', request.projectName || '章节知识点与法规范围', materialOverview, '本页用于先核对教材原文范围，后续页面不得脱离这些知识点和条文。', '学生指出本章最需要保留证据的一项教材要求。', 'cards'),
    buildScene('regulation', material.regulationBullets.length ? '教材关联法规原文' : '我国药品法规四级体系', material.regulationBullets.length ? '来自知识点关联条文' : profile.regulationTitle, regulationBullets, '把法规体系讲成一条从法律责任到现场证据的链条；已检索到原文时优先引用原文。', '让学生把一个现场问题对应到法规层级。', material.regulationBullets.length ? 'cards' : 'pyramid'),
    buildScene('system', '质量管理体系：从要求到证据', 'QMS 的运行闭环', [
      '职责清晰：质量负责人、QA、QC、生产与仓储边界明确。',
      '过程受控：文件、培训、偏差、变更、验证、供应商管理形成闭环。',
      '记录可追溯：关键操作及时记录，复核前不得进行质量决策。',
      '持续改进：趋势分析与 CAPA 结果反哺体系升级。',
    ], '强调 GMP 不是单点要求，而是体系化控制。', '学生画出“要求-操作-记录-复核-改进”的证据链。', 'loop'),
    material.knowledgeBullets.length
      ? buildScene('source-detail', '教材关键表述核对', '原文要点、关联法规与课堂转化', material.knowledgeBullets.slice(0, 6), '逐条核对教材表述，避免把其他章节的通用 GMP 内容误放进本章。', '学生把一条原文改写成现场检查问题。', 'cards')
      : buildScene('data', '缺陷数据透视：飞行检查与合规红线', '高频缺陷领域与风险信号', [
        '质量控制与质量保证、文件管理、设备管理是检查缺陷高发领域。',
        '数据完整性、偏差处理不充分、验证依据不足常被判为严重缺陷。',
        '合规红线通常表现为记录失真、责任不清、证据链断裂。',
        '教学中应把缺陷数据转化为学生可观察、可判断、可改进的任务。',
      ], '对标参考课件的数据透视页，用缺陷领域引出本主题的必要性。', '学生判断给定缺陷属于一般、主要还是严重缺陷。', 'table'),
    buildScene('workflow', `${topic}：标准操作流程`, profile.workflowTitle, profile.workflowBullets, '按照真实岗位流程讲解，突出交接点、复核点和记录点。', '学生给流程节点标出责任岗位和必备记录。', 'process'),
    buildScene('keypoint', '核心知识点拆解', '法规条款、现场动作与记录证据', keyPoints, '每个知识点都落到“要做什么、为什么做、留下什么证据”。', '学生把知识点改写为 SOP 检查项。', 'cards'),
    buildScene('records', '数据完整性与文件证据', 'ALCOA+ 与批记录复核', [
      'Attributable：记录能定位到具体人员、时间和职责。',
      'Legible / Original：原始记录清晰、完整，修改有原因和痕迹。',
      'Contemporaneous：操作发生时同步记录，禁止事后补录和倒签。',
      'Accurate / Complete：数据准确完整，异常数据不得选择性删除。',
    ], '即使主题不是数据完整性，也要让学生知道证据链如何证明合规。', '给出一段记录，让学生找出 ALCOA+ 风险点。', 'matrix'),
    buildScene('risk', '风险点与缺陷判定', '从现象到根因', profile.riskBullets, '把抽象风险翻译为现场检查信号，并说明缺陷等级判断依据。', '小组给风险排序，写出优先调查证据。', 'risk'),
    buildScene('capa', 'CAPA 闭环控制四步法流程', '纠正、原因分析、预防、效果确认', [
      '01 立即纠正：隔离影响范围，防止风险扩大。',
      '02 原因分析：使用 5-Why、鱼骨图等工具找到系统性根因。',
      '03 预防措施：更新 SOP、培训、验证或技术控制。',
      '04 效果确认：用趋势数据证明问题未重复发生。',
    ], '参考课件的 CAPA 流程页，用四步法串起偏差处理。', '学生把案例中的 CAPA 写成责任人、期限、证据三栏表。', 'process'),
    buildScene('case', '典型严重缺陷案例剖析与合规研讨', profile.caseTitle, caseBullets, '先呈现事实，不急于给答案，让学生构建证据链和质量决策。', '小组输出 QA 决策简报：缺陷级别、影响评估、CAPA、放行建议。', 'case'),
    buildScene('practice', '课堂任务：证据链复盘', '把知识点转化为岗位行动', [
      '任务一：列出本主题至少 5 个现场检查点。',
      '任务二：匹配每个检查点所需记录、数据或实物证据。',
      '任务三：识别 2 个可能被判为严重缺陷的情形。',
      '任务四：提出 1 条可验证的 CAPA 效果确认指标。',
    ], '用任务把 PPT 内容接到学生端课程学习与章节测试。', '学生完成小组任务卡，教师随机抽取讲评。', 'activity'),
    buildScene('assessment', '随堂检测与出口票', '检查理解、应用与判断', [
      '一个核心 GMP 要求是什么？',
      '必须核查的一项记录或数据源是什么？',
      '一个不可接受的现场捷径是什么？',
      '一个能降低复发风险的 CAPA 是什么？',
    ], '出口票用于判断下一步是进入练习、案例还是返讲风险点。', '学生提交四句话出口票。', 'quiz'),
    buildScene('summary', '培训总结：坚守底线 持续改进', 'PDCA 与质量文化', [
      'GMP 的底线是保证药品质量、安全、有效和全过程可追溯。',
      '质量体系要靠真实记录、及时复核和持续改进来证明。',
      '教师应把法规条款转化为场景、证据、判断与行动。',
      '学生应形成“先看风险，再找证据，最后做质量决策”的思维。',
    ], '用总结页收束课程，并提示学生进入章节学习和每日练习。', '全班用一句话总结本节课最重要的合规红线。', 'summary'),
  ]

  const extras = [
    buildScene('calculation', '验证与限度：用数据证明受控', '清洁验证、工艺验证与方法确认', [
      '验证方案应先定义接受标准、抽样位置、检测方法和偏差处理规则。',
      '限度设计要有科学依据，避免机械套用经验值。',
      '验证报告必须说明数据是否支持“持续受控”的结论。',
    ], '根据主题需要讲清验证思维，尤其适合设备、清洁、工艺、QC 主题。', '学生判断一个验证偏差是否影响验证结论。', 'calculation'),
    buildScene('mah', 'MAH 持续监管工具', '委托生产的全生命周期质量责任', [
      '年度审计：确认受托方质量体系持续符合要求。',
      '质量协议：明确放行、偏差、变更、投诉与召回职责。',
      '趋势回顾：用偏差、OOS、投诉、退货等数据识别系统性风险。',
      '现场沟通：重大质量风险需及时升级并形成书面记录。',
    ], '如果主题涉及委托生产或放行，强调 MAH 不得把质量责任外包。', '学生设计一张受托方月度质量看板。', 'cards'),
    buildScene('teacher', '教师讲评提示', '易错点、追问与板书建议', [
      '追问一：这项操作不记录，会造成哪条证据链断裂？',
      '追问二：如果结果合格但过程失控，是否可以放行？',
      '追问三：CAPA 如何证明有效，而不是只完成文件？',
      '板书建议：法规依据 → 现场动作 → 记录证据 → 缺陷判定。',
    ], '提供教师授课时可直接使用的追问与板书框架。', '教师挑选 2 个追问用于课堂互动。', 'teacher'),
  ]

  fillScenesToCount(scenes, extras, slideCount, {
    topic,
    profile,
    material,
    goals,
    keyPoints,
    caseBullets,
    request,
  })
  applyCourseStyleToScenes(scenes, stylePreset)

  const finalScenes = scenes.slice(0, slideCount)

  return {
    topic,
    trainingId: request.trainingId || '',
    generatedAt: new Date().toISOString(),
    profileName: profile.name,
    stylePreset: {
      id: stylePreset.id,
      name: stylePreset.name,
      signature: stylePreset.signature,
      trainingId: stylePreset.trainingId,
      theme: stylePreset.theme,
    },
    audience,
    classHours,
    styleHint,
    sourceMaterialCount: material.knowledgeBullets.length + material.regulationBullets.length,
    objectives: goals,
    scenes: finalScenes,
    quiz: buildQuiz(topic, profile),
  }
}

function cleanPresentationTopic(value) {
  return normalizeRequirement(value)
    .replace(/^(请|请帮我|帮我)?\s*(生成|制作|做|输出)?\s*/i, '')
    .replace(/教学\s*PPT/gi, '')
    .replace(/PPT\s*课件/gi, '')
    .replace(/教学课件/gi, '')
    .replace(/PPT/gi, '')
    .replace(/课件/g, '')
    .trim()
}

function parseCourseMaterials(value) {
  const raw = cleanLongText(value, 18_000)
  const material = {
    knowledgeBullets: [],
    regulationBullets: [],
  }
  if (!raw) return material

  let section = ''
  for (const line of raw.split(/\r?\n/).map(item => item.trim()).filter(Boolean)) {
    if (line.includes('【教材知识点原文】')) {
      section = 'knowledge'
      continue
    }
    if (line.includes('【关联法规条文】')) {
      section = 'regulation'
      continue
    }
    if (!/^\d+\./.test(line)) continue

    if (section === 'knowledge') {
      const bullet = cleanMaterialBullet(line, 150)
      if (bullet) material.knowledgeBullets.push(bullet)
    }
    if (section === 'regulation') {
      const bullet = cleanMaterialBullet(line, 170)
      if (bullet) material.regulationBullets.push(bullet)
    }
  }

  material.knowledgeBullets = dedupeBullets(material.knowledgeBullets).slice(0, 18)
  material.regulationBullets = dedupeBullets(material.regulationBullets).slice(0, 14)
  return material
}

function cleanMaterialBullet(value, maxLength) {
  let text = String(value || '')
    .replace(/^\d+\.\s*/, '')
    .replace(/^【[^】]+】/, '')
    .replace(/；关联法规：.*$/, '')
    .replace(/；原文要点：/g, '：')
    .replace(/^原文要点：/, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(12, maxLength - 3))}...`
}

function dedupeBullets(items) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const key = item.slice(0, 48)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function mergeSlideBullets(primary, fallback, limit = 6) {
  const merged = dedupeBullets([
    ...(Array.isArray(primary) ? primary : []),
    ...(Array.isArray(fallback) ? fallback : []),
  ].map(item => cleanMaterialBullet(item, 150)).filter(Boolean))
  return merged.length ? merged.slice(0, limit) : fallback.slice(0, limit)
}

const DEFAULT_COURSE_STYLE = {
  id: 'gmp-core',
  name: 'GMP 核心合规型',
  signature: '法规依据 + 风险判断 + 证据链复盘',
  theme: {
    navy: '26364A',
    blue: '4472C4',
    orange: 'ED7D31',
    green: '70AD47',
    gray: '44546A',
    light: 'F6F8FB',
    line: 'DDE4EE',
  },
  visualOverrides: {},
  visualSequence: ['cards', 'process', 'risk', 'case', 'activity'],
}

const COURSE_STYLE_PRESETS = {
  T01: {
    id: 'regulatory-map',
    name: '法规地图型',
    signature: '层级地图 + 时间线 + 法规证据链',
    theme: { navy: '1F2D3D', blue: '315C9C', orange: 'D97706', green: '2F855A', gray: '334155', light: 'F5F8FC', line: 'CBD5E1' },
    visualOverrides: { source: 'cards', regulation: 'pyramid', system: 'process', data: 'table', workflow: 'process', records: 'matrix', risk: 'risk', capa: 'process', case: 'case', practice: 'activity' },
    visualSequence: ['pyramid', 'cards', 'process', 'matrix', 'case'],
  },
  T02: {
    id: 'quality-system',
    name: '质量体系看板型',
    signature: 'QMS 看板 + 责任矩阵 + PDCA 闭环',
    theme: { navy: '173B3F', blue: '2F7F8F', orange: 'C06C36', green: '4E8C57', gray: '2F4A54', light: 'F3FAF9', line: 'CFE3E1' },
    visualOverrides: { source: 'cards', regulation: 'cards', system: 'process', data: 'matrix', workflow: 'process', keypoint: 'cards', records: 'matrix', risk: 'risk', capa: 'process', case: 'case' },
    visualSequence: ['cards', 'process', 'matrix', 'risk', 'case'],
  },
  T03: {
    id: 'organization-training',
    name: '组织能力建设型',
    signature: '岗位职责 + 培训路径 + 能力验证',
    theme: { navy: '2F365F', blue: '5A6ACF', orange: 'C17817', green: '3E8B7A', gray: '3E4C59', light: 'F7F7FC', line: 'DCDFF1' },
    visualOverrides: { source: 'cards', regulation: 'cards', system: 'cards', data: 'matrix', workflow: 'process', keypoint: 'cards', records: 'matrix', risk: 'risk', capa: 'process', case: 'case' },
    visualSequence: ['cards', 'process', 'cards', 'matrix', 'activity'],
  },
  T04: {
    id: 'document-data',
    name: '文件与数据审计型',
    signature: '文件层级 + 审计追踪 + ALCOA+ 证据链',
    theme: { navy: '19324A', blue: '2B6CB0', orange: 'B7791F', green: '2C7A7B', gray: '334155', light: 'F4F8FB', line: 'D6E3EF' },
    visualOverrides: { source: 'cards', 'source-detail': 'cards', regulation: 'cards', system: 'matrix', data: 'table', workflow: 'process', keypoint: 'cards', records: 'matrix', risk: 'risk', capa: 'process', case: 'case' },
    visualSequence: ['cards', 'table', 'matrix', 'process', 'case'],
  },
  T05: {
    id: 'facility-equipment',
    name: '设施设备工程型',
    signature: '设备状态 + 清洁维护 + 确认验证',
    theme: { navy: '243447', blue: '376B8C', orange: 'C7782A', green: '6A8A35', gray: '3F4E5D', light: 'F6F8F5', line: 'DDE4D5' },
    visualOverrides: { source: 'cards', regulation: 'cards', system: 'process', data: 'table', workflow: 'process', keypoint: 'cards', records: 'matrix', risk: 'risk', capa: 'process', case: 'case' },
    visualSequence: ['process', 'cards', 'table', 'risk', 'case'],
  },
  T06: {
    id: 'material-warehouse',
    name: '物料仓储流转型',
    signature: '状态标识 + 仓储流向 + 防混淆控制',
    theme: { navy: '253B2F', blue: '3D7C8A', orange: 'B66A2C', green: '5D8B3D', gray: '3E4A3F', light: 'F5FAF3', line: 'D7E7D0' },
    visualOverrides: { source: 'cards', regulation: 'cards', system: 'process', data: 'table', workflow: 'process', keypoint: 'cards', records: 'matrix', risk: 'risk', capa: 'process', case: 'case' },
    visualSequence: ['process', 'cards', 'matrix', 'table', 'case'],
  },
  T07: {
    id: 'production-line',
    name: '生产现场流程型',
    signature: '工序流 + 批记录 + 清场放行',
    theme: { navy: '2E3344', blue: '3F6F9F', orange: 'B85C38', green: '4B8B5F', gray: '3D4652', light: 'F7F8FA', line: 'DADFE8' },
    visualOverrides: { source: 'cards', regulation: 'cards', system: 'process', data: 'table', workflow: 'process', keypoint: 'process', records: 'matrix', risk: 'risk', capa: 'process', case: 'case' },
    visualSequence: ['process', 'process', 'table', 'risk', 'case'],
  },
  T08: {
    id: 'qc-lab',
    name: '实验室数据型',
    signature: '检验流程 + OOS 调查 + 原始数据复核',
    theme: { navy: '233047', blue: '5269B0', orange: 'B26F2A', green: '3A9278', gray: '384759', light: 'F5F7FC', line: 'D7DFF0' },
    visualOverrides: { source: 'cards', regulation: 'cards', system: 'matrix', data: 'table', workflow: 'process', keypoint: 'cards', records: 'matrix', risk: 'risk', capa: 'process', case: 'case' },
    visualSequence: ['table', 'matrix', 'process', 'risk', 'case'],
  },
  T09: {
    id: 'release-recall',
    name: '放行召回决策型',
    signature: '放行门禁 + 投诉调查 + 召回决策树',
    theme: { navy: '382F4D', blue: '5B6FB2', orange: 'C66B3D', green: '4C8B62', gray: '443E50', light: 'F8F6FB', line: 'E1D9EA' },
    visualOverrides: { source: 'cards', regulation: 'cards', system: 'matrix', data: 'table', workflow: 'process', keypoint: 'cards', records: 'matrix', risk: 'risk', capa: 'process', case: 'case' },
    visualSequence: ['matrix', 'process', 'case', 'risk', 'activity'],
  },
  T10: {
    id: 'contract-quality',
    name: '委托质量边界型',
    signature: '质量协议 + 责任边界 + 受托方监督',
    theme: { navy: '2D3748', blue: '4267A8', orange: 'A7652F', green: '557C55', gray: '3F4856', light: 'F6F7F9', line: 'DADFE6' },
    visualOverrides: { source: 'cards', regulation: 'cards', system: 'matrix', data: 'table', workflow: 'process', keypoint: 'cards', records: 'matrix', risk: 'risk', capa: 'process', case: 'case' },
    visualSequence: ['cards', 'matrix', 'process', 'case', 'risk'],
  },
  T11: {
    id: 'inspection-capa',
    name: '检查整改闭环型',
    signature: '缺陷分级 + 根因分析 + CAPA 验证',
    theme: { navy: '2F3240', blue: '4A6FA5', orange: 'C05F3C', green: '52836B', gray: '404855', light: 'F7F7F8', line: 'DFE2E8' },
    visualOverrides: { source: 'cards', regulation: 'cards', system: 'matrix', data: 'table', workflow: 'process', keypoint: 'cards', records: 'matrix', risk: 'risk', capa: 'process', case: 'case' },
    visualSequence: ['risk', 'case', 'process', 'matrix', 'activity'],
  },
}

const PROFILE_STYLE_KEYS = {
  'data-integrity': 'T04',
  validation: 'T05',
  environment: 'T05',
  'material-product': 'T06',
  'production-process': 'T07',
  'qc-lab': 'T08',
  'release-recall': 'T09',
  'contract-manufacturing': 'T10',
  'facility-equipment': 'T05',
}

function normalizeTrainingId(value) {
  const match = String(value || '').toUpperCase().match(/\bT\d{2}\b/)
  return match ? match[0] : ''
}

function resolveCourseStyle(request, profile, topic) {
  const trainingId = normalizeTrainingId(request.trainingId) || normalizeTrainingId(topic) || normalizeTrainingId(request.requirement)
  const profileKey = PROFILE_STYLE_KEYS[profile?.name] || ''
  const preset = COURSE_STYLE_PRESETS[trainingId] || COURSE_STYLE_PRESETS[profileKey] || DEFAULT_COURSE_STYLE
  return {
    ...preset,
    trainingId,
    theme: { ...DEFAULT_COURSE_STYLE.theme, ...(preset.theme || {}) },
    visualOverrides: { ...(preset.visualOverrides || {}) },
    visualSequence: [...(preset.visualSequence || DEFAULT_COURSE_STYLE.visualSequence)],
  }
}

function applyCourseStyleToScenes(scenes, stylePreset) {
  let expansionIndex = 0
  scenes.forEach(scene => {
    const mappedVisual = stylePreset.visualOverrides[scene.type]
    if (mappedVisual) {
      scene.visual = mappedVisual
    } else if (String(scene.type || '').startsWith('expansion-') && stylePreset.visualSequence.length) {
      scene.visual = stylePreset.visualSequence[expansionIndex % stylePreset.visualSequence.length]
      expansionIndex += 1
    }
    scene.styleId = stylePreset.id
  })
}

function buildScene(type, title, subtitle, bullets, speakerNotes, activity, visual = 'cards') {
  return {
    type,
    title,
    subtitle,
    bullets: bullets.filter(Boolean).slice(0, 6),
    speakerNotes,
    activity,
    visual,
  }
}

function fillScenesToCount(scenes, extras, slideCount, context) {
  const insertBeforeSummary = scene => {
    scenes.splice(Math.max(2, scenes.length - 1), 0, scene)
  }

  for (const extra of extras) {
    if (scenes.length >= slideCount) return
    insertBeforeSummary(extra)
  }

  const topics = deriveExpansionTopics(context)
  let index = 0
  while (scenes.length < slideCount) {
    insertBeforeSummary(buildExpansionScene(index, topics[index % topics.length], context))
    index += 1
  }
}

function deriveExpansionTopics({ topic, keyPoints, caseBullets, goals, request, material }) {
  const promptItems = [
    ...(material?.knowledgeBullets || []),
    ...(material?.regulationBullets || []),
    ...splitPromptList(request.keyPoints, []),
    ...splitPromptList(request.teachingGoals, []),
    ...splitPromptList(request.caseContext, []),
    ...keyPoints,
    ...caseBullets,
    ...goals,
  ]
  const cleaned = promptItems
    .map(item => item.replace(/^任务[一二三四五六七八九十\d]+[:：]?/, '').trim())
    .filter(item => item.length > 4)
    .filter((item, index, arr) => arr.findIndex(other => other.slice(0, 28) === item.slice(0, 28)) === index)

  return cleaned.length ? cleaned : [
    `${topic}的法规依据`,
    `${topic}的现场检查要点`,
    `${topic}的记录证据`,
    `${topic}的常见缺陷`,
    `${topic}的案例研讨`,
  ]
}

function buildExpansionScene(index, focus, { topic, profile }) {
  const visuals = ['cards', 'process', 'risk', 'case', 'activity']
  const visual = visuals[index % visuals.length]
  const prefix = ['专题深化', '岗位任务', '案例研讨', '课堂互动', '复盘巩固'][index % 5]
  const cleanFocus = cleanText(focus, 80) || topic
  const bullets = [
    `围绕“${cleanFocus}”明确对应的 GMP 条款、岗位职责和质量风险。`,
    `把要求拆成可执行动作：谁负责、何时做、如何复核、留下什么记录。`,
    `列出至少 2 个现场检查证据，并判断证据是否足以支持质量决策。`,
    `结合缺陷案例说明可能后果，形成偏差调查或 CAPA 的初步思路。`,
    profile.riskBullets[index % profile.riskBullets.length],
  ]

  return buildScene(
    `expansion-${index + 1}`,
    `${prefix}：${cleanFocus}`,
    `${topic} · 生成式拓展内容`,
    bullets,
    `本页根据教师提示词自动补充，用于展开“${cleanFocus}”的法规依据、现场动作和证据链。`,
    `学生围绕“${cleanFocus}”写出 1 条检查问题和 1 条改进建议。`,
    visual,
  )
}

function splitPromptList(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const items = value
    .split(/\r?\n|[；;。]/)
    .map(item => item.replace(/^[-•\d.\s]+/, '').trim())
    .filter(Boolean)
  return (items.length ? items : fallback).slice(0, 6)
}

function detectTopicProfile(topic) {
  const source = topic.toLowerCase()
  const profiles = [
    {
      name: 'data-integrity',
      keywords: ['data', 'alcoa', '完整性', '记录', '电子', '审计追踪'],
      regulationTitle: '数据完整性与 ALCOA+ 原则',
      regulationBullets: [
        '数据必须可归属、清晰、同步、原始、准确，并保持完整一致。',
        '记录修改应说明原因、时间、人员和可追溯痕迹。',
        '电子记录应具备权限控制、审计追踪复核与备份恢复机制。',
      ],
      workflowTitle: '生成、复核、保护、归档',
      workflowBullets: [
        '明确记录人员、记录时点和原始数据保存要求。',
        '批放行前复核原始记录、审计追踪与异常数据处理。',
        '防止数据删除、覆盖、未授权导出和选择性报告。',
      ],
      riskBullets: [
        '事后补录、倒签记录或操作后集中填写记录。',
        '共用账号、审计追踪未复核或审计追踪被关闭。',
        '原始数据未保留、元数据不一致或重复处理无书面理由。',
      ],
      caseTitle: '审计追踪显示同一样品多次重处理',
      caseBullets: [
        'QC 分析员对同一序列重处理 5 次，未记录书面原因。',
        '最终报告只纳入合格结果，未解释弃用数据。',
        'QA 需判断批记录是否完整，是否支持放行结论。',
      ],
    },
    {
      name: 'validation',
      keywords: ['验证', '确认', 'validation', 'qualification', '清洁验证', '工艺验证'],
      regulationTitle: '生命周期验证控制',
      regulationBullets: [
        '验证用于证明设施、设备、工艺、方法在预定范围内持续受控。',
        '验证方案、接受标准、偏差处理和报告结论均应经批准。',
        '变更控制、周期性回顾和再验证用于维持验证状态。',
      ],
      workflowTitle: '计划、执行、评价、维持',
      workflowBullets: [
        '执行前批准验证方案和接受标准，避免结果导向。',
        '验证偏差应即时记录并评估对验证结论的影响。',
        '通过监测、变更控制和再验证维持已验证状态。',
      ],
      riskBullets: [
        '接受标准在看到结果后才补写，验证结论缺乏独立性。',
        '验证偏差未做根因和影响评估即关闭。',
        '设备或工艺变更未进行验证影响评估。',
      ],
      caseTitle: '清洁验证残留结果超过警戒限',
      caseBullets: [
        '擦拭样结果高于警戒限但低于行动限。',
        '生产部门希望继续使用该设备。',
        'QA 需判断是否需要追加清洁、偏差调查或再验证。',
      ],
    },
    {
      name: 'environment',
      keywords: ['洁净', '环境', '微生物', 'monitoring', 'cleanroom', '偏差'],
      regulationTitle: '洁净区环境监测与污染控制',
      regulationBullets: [
        '洁净区应按照风险和生产活动设置监测点、频次与限度。',
        '超限或趋势异常需进行调查、影响评估和趋势回顾。',
        '人员行为、清洁状态和物流动线均属于污染控制证据。',
      ],
      workflowTitle: '监测、趋势、调查、改进',
      workflowBullets: [
        '按既定点位和时机采集悬浮粒子、沉降菌、表面和人员样。',
        '将结果与警戒限、行动限和历史趋势进行比较。',
        '结合工艺、人员、物料、清洁和维护证据调查异常。',
      ],
      riskBullets: [
        '监测点位随意移动，未说明风险依据。',
        '重复警戒限结果被当作孤立事件处理。',
        '暴露产品附近的人员干预未纳入污染调查。',
      ],
      caseTitle: 'B 级区连续出现微生物警戒限结果',
      caseBullets: [
        '两周内灌装线附近出现 3 次警戒限结果。',
        '单次结果均未超过行动限。',
        '课堂需判断是否应基于趋势启动 CAPA。',
      ],
    },
    {
      name: 'material-product',
      keywords: ['物料', '仓储', '供应商', '发放', '退货', '标签', '状态标识', '产品管理'],
      regulationTitle: '物料与产品的全流程受控',
      regulationBullets: [
        '物料到货、验收、待验、放行、储存、发放和退货均应有明确状态和记录。',
        '仓储应按规定条件和效期原则管理，防止混淆、污染、差错和过期使用。',
        '供应商、质量标准、合格证明和质量部门放行结论共同构成使用依据。',
      ],
      workflowTitle: '验收、标识、储存、发放、退货',
      workflowBullets: [
        '到货后核对供应商、品名、批号、数量、包装完整性和质量证明。',
        '按待验、合格、不合格、退货等状态隔离或标识，未经放行不得使用。',
        '发放时复核名称、代码、批号、数量和状态，执行先进先出或近效期先出。',
        '退货和召回产品应隔离保存，经质量评估后决定处置。',
      ],
      riskBullets: [
        '待验物料被误发或未经质量部门放行直接投入生产。',
        '标签、批号或状态标识不清导致物料混淆。',
        '仓储温湿度、效期或退货隔离记录不足，无法证明质量状态。',
      ],
      caseTitle: '待验原辅料被误发至生产现场',
      caseBullets: [
        '仓库将待验状态物料与合格物料混放，生产领料时未复核状态。',
        '批记录显示物料已投入，但质量部门尚未完成放行。',
        'QA 需评估批产品影响、库存隔离和防混淆 CAPA。',
      ],
    },
    {
      name: 'production-process',
      keywords: ['生产过程', '批生产', '清场', '包装', '工艺规程', '中间产品'],
      regulationTitle: '生产过程与现场执行控制',
      regulationBullets: [
        '生产应按批准的工艺规程和操作规程执行，不得擅自变更关键参数。',
        '批生产记录、清场记录、物料平衡和偏差记录用于证明过程受控。',
        '人员、设备、物料、环境和文件状态应在生产前完成确认。',
      ],
      workflowTitle: '准备确认、投料生产、过程监控、清场放行',
      workflowBullets: [
        '生产前确认指令、物料、设备状态、清洁状态和人员资质。',
        '关键工艺参数和中间控制结果应及时记录并复核。',
        '发生偏差时立即报告、隔离影响范围并开展影响评估。',
        '批次结束后完成清场、物料平衡和批记录审核。',
      ],
      riskBullets: [
        '未按批准工艺参数执行或事后补记关键操作。',
        '清场不彻底造成批次或品种混淆。',
        '偏差未调查即继续生产或进入下一工序。',
      ],
      caseTitle: '关键工艺参数偏离后未及时启动偏差',
      caseBullets: [
        '生产记录显示保温时间低于工艺规程要求。',
        '操作人员口头说明设备报警后已恢复，但无偏差记录。',
        'QA 需判断是否影响产品质量和后续放行。',
      ],
    },
    {
      name: 'qc-lab',
      keywords: ['质量控制', '实验室', '检验', 'OOS', '留样', '稳定性', '方法确认'],
      regulationTitle: 'QC 实验室检验与数据可靠性',
      regulationBullets: [
        '检验应按批准方法执行，样品、标准品、试剂、仪器和记录均应受控。',
        'OOS/OOT、异常图谱和重复检验必须调查并形成书面结论。',
        '留样、稳定性考察和检验记录用于支持质量评价与放行。',
      ],
      workflowTitle: '取样、检验、复核、异常调查、报告',
      workflowBullets: [
        '按取样方案取得代表性样品，保持样品状态和链路可追溯。',
        '检验前确认方法、仪器校准、系统适用性和标准品状态。',
        '原始数据、图谱和计算过程应完整保存并独立复核。',
        'OOS/OOT 按程序调查，未经批准不得选择性舍弃结果。',
      ],
      riskBullets: [
        '重复进样或重处理数据无书面理由。',
        '仪器校准、系统适用性或标准品记录缺失。',
        'OOS 调查只关注实验室错误，未评估生产过程影响。',
      ],
      caseTitle: '含量 OOS 结果被重复检验覆盖',
      caseBullets: [
        '首检结果 OOS，复测合格后直接出具报告。',
        '原始图谱保留不完整，调查未覆盖生产偏差。',
        'QA/QC 需判断数据是否支持放行。',
      ],
    },
    {
      name: 'release-recall',
      keywords: ['放行', '投诉', '召回', '发运', '退货', '产品放行'],
      regulationTitle: '放行、投诉与召回的质量决策',
      regulationBullets: [
        '产品放行前应完成批记录审核、检验结果复核和偏差影响评估。',
        '投诉应按风险分级调查，必要时关联留样、批记录和同批产品。',
        '召回应有预案、分级、追踪、效果评估和监管报告机制。',
      ],
      workflowTitle: '审核放行、投诉调查、风险评估、召回处置',
      workflowBullets: [
        '质量受权人基于完整证据作出放行或拒绝放行决定。',
        '投诉信息应及时登记、分类、调查并评估同批及相关批次影响。',
        '召回时确认分销去向、库存状态、通知范围和回收效果。',
        '调查结论应转化为 CAPA 和趋势回顾输入。',
      ],
      riskBullets: [
        '偏差未关闭或检验异常未解释即放行。',
        '投诉调查未覆盖同批产品和留样复核。',
        '召回记录无法证明通知到位和回收有效。',
      ],
      caseTitle: '批放行前发现未关闭偏差和市场投诉',
      caseBullets: [
        '批记录中存在关键偏差，投诉指向同一工序风险。',
        '销售部门希望按期发运。',
        '质量受权人需判断是否暂停放行并扩大调查。',
      ],
    },
    {
      name: 'contract-manufacturing',
      keywords: ['委托', '受托', '质量协议', 'MAH', '委托生产', '委托检验'],
      regulationTitle: '委托生产/检验的质量责任边界',
      regulationBullets: [
        '委托方对产品质量承担最终责任，不得将质量责任外包。',
        '质量协议应明确生产、检验、放行、偏差、变更、投诉和召回职责。',
        '委托方应对受托方开展准入评估、持续监督、审计和质量回顾。',
      ],
      workflowTitle: '准入评估、协议签订、过程监督、质量回顾',
      workflowBullets: [
        '委托前评估受托方资质、产能、质量体系和历史合规表现。',
        '质量协议细化职责、沟通时限、记录交付和重大风险升级机制。',
        '生产/检验过程中监控偏差、变更、OOS、投诉和审计发现。',
        '通过年度审计和质量回顾确认受托方持续符合要求。',
      ],
      riskBullets: [
        '质量协议职责模糊，偏差和变更未及时通知委托方。',
        '委托方只看放行报告，未审查关键原始记录。',
        '受托方重大缺陷未纳入供应商质量回顾。',
      ],
      caseTitle: '受托方未及时报告重大生产偏差',
      caseBullets: [
        '受托方在生产中发生关键参数偏离，数日后才通知委托方。',
        '质量协议未规定重大偏差通知时限。',
        'MAH 需判断是否暂停委托生产并启动现场审计。',
      ],
    },
    {
      name: 'facility-equipment',
      keywords: ['厂房', '设施', '设备', '维护', '校准', '公用系统'],
      regulationTitle: '厂房设施与设备的确认维护',
      regulationBullets: [
        '厂房设施和设备应与生产用途、洁净级别和污染控制要求相适应。',
        '设备确认、维护、清洁、校准和使用记录用于证明持续适用状态。',
        '关键公用系统异常应评估对产品、环境和工艺的影响。',
      ],
      workflowTitle: '设计确认、使用维护、清洁校准、异常评估',
      workflowBullets: [
        '投用前完成确认和风险评估，明确关键控制参数。',
        '使用中按计划维护、校准、清洁和状态标识。',
        '设备故障、公用系统异常和维修活动应记录并评估影响。',
        '变更后确认是否需要再确认或补充验证。',
      ],
      riskBullets: [
        '设备状态标识不清或维护超期仍继续使用。',
        '清洁记录、校准证书或维修记录不完整。',
        '公用系统异常未评估对在制品和环境监测的影响。',
      ],
      caseTitle: '关键设备维护超期后继续生产',
      caseBullets: [
        '设备预防性维护超期一周，期间完成多个批次生产。',
        '现场只有口头确认设备运行正常。',
        'QA 需评估批次影响并制定维护管理 CAPA。',
      ],
    },
  ]

  return profiles.find(profile => profile.keywords.some(keyword => source.includes(keyword.toLowerCase()))) || {
    name: 'general-gmp',
    regulationTitle: '质量体系与 GMP 证据链',
    regulationBullets: [
      'GMP 将质量要求转化为受控职责、流程和记录。',
      '每个关键操作都应留下及时、真实、可复核的证据。',
      '偏差、变更、CAPA 和培训记录用于证明体系持续受控。',
    ],
    workflowTitle: '要求、操作、记录、复核',
    workflowBullets: [
      '将法规要求转化为可执行的受控程序。',
      '按照人员、物料、设备、环境和文件要求执行操作。',
      '质量决策前复核记录、异常和影响评估。',
    ],
    riskBullets: [
      '文件规定与现场实际操作不一致。',
      '关键记录不完整、延迟记录或难以追溯。',
      'CAPA 只处理表象，未确认根因和有效性。',
    ],
    caseTitle: '批放行记录中存在未关闭偏差',
    caseBullets: [
      '生产过程中记录了一项关键工艺偏差。',
      '偏差报告缺少影响评估和 CAPA 责任人。',
      'QA 需判断该批是否可放行以及还缺哪些证据。',
    ],
  }
}

function buildQuiz(topic, profile) {
  return [
    {
      type: 'single',
      stem: `围绕“${topic}”作出质量决策前，最应优先核查什么？`,
      options: ['只看最终结果', '完整证据链', '只听操作人员口头说明', '只关注生产效率'],
      answer: '完整证据链',
    },
    {
      type: 'short',
      stem: `写出“${topic}”相关的一个典型 GMP 风险。`,
      reference: profile.riskBullets[0],
    },
    {
      type: 'case',
      stem: 'QA 在关闭该案例前至少应要求补充哪些证据？',
      reference: '根因分析、影响评估、CAPA 责任人、完成期限和效果确认记录。',
    },
  ]
}

async function writeClassroomPackage(job, classroom) {
  const targetDir = path.join(CLASSROOM_DIR, job.jobId)
  await fsp.mkdir(targetDir, { recursive: true })

  const html = renderClassroomHtml(classroom)
  const json = JSON.stringify(classroom, null, 2)
  const markdown = renderOutlineMarkdown(classroom)
  const pptx = await buildPptx(classroom)
  const pptFileName = buildPptFileName(classroom)

  await Promise.all([
    fsp.writeFile(path.join(targetDir, 'index.html'), html, 'utf8'),
    fsp.writeFile(path.join(targetDir, 'classroom.json'), json, 'utf8'),
    fsp.writeFile(path.join(targetDir, 'outline.md'), markdown, 'utf8'),
    fsp.writeFile(path.join(targetDir, pptFileName), pptx),
  ])

  const base = job.baseUrl || `http://localhost:${port}`
  const url = `${base}/classrooms/${job.jobId}/`
  const pptPath = encodeURIComponent(pptFileName)
  return {
    url,
    classroomUrl: url,
    summaryUrl: `${base}/classrooms/${job.jobId}/classroom.json`,
    outlineUrl: `${base}/classrooms/${job.jobId}/outline.md`,
    pptUrl: `${base}/classrooms/${job.jobId}/${pptPath}`,
    pptFileName,
    title: classroom.topic,
    sceneCount: classroom.scenes.length,
    generatedAt: classroom.generatedAt,
  }
}

async function buildPptx(classroom) {
  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'OpenMAIC Service'
  pptx.company = 'GMP助学平台'
  pptx.subject = classroom.styleHint
  pptx.title = `${classroom.topic} 教学课件`
  pptx.lang = 'zh-CN'
  pptx.theme = {
    headFontFace: 'Microsoft YaHei',
    bodyFontFace: 'Microsoft YaHei',
    lang: 'zh-CN',
  }

  const previousTheme = applyPptTheme(classroom.stylePreset?.theme)
  try {
    classroom.scenes.forEach((scene, index) => {
      if (index === 0 || scene.visual === 'cover') {
        addCoverSlide(pptx, classroom, scene)
      } else {
        addTeachingSlide(pptx, classroom, scene, index)
      }
    })
  } finally {
    restorePptTheme(previousTheme)
  }

  return await pptx.write({ outputType: 'nodebuffer' })
}

const PPT = {
  w: 13.333,
  h: 7.5,
  navy: '26364A',
  blue: '4472C4',
  orange: 'ED7D31',
  green: '70AD47',
  gray: '44546A',
  light: 'F6F8FB',
  line: 'DDE4EE',
  white: 'FFFFFF',
}

function normalizePptColor(value) {
  return String(value || '').replace(/^#/, '').trim().toUpperCase()
}

function applyPptTheme(theme = {}) {
  const previous = {}
  Object.keys(PPT).forEach(key => {
    previous[key] = PPT[key]
  })
  Object.entries(theme || {}).forEach(([key, value]) => {
    if (key in PPT && typeof PPT[key] === 'string' && typeof value === 'string') {
      const color = normalizePptColor(value)
      if (/^[0-9A-F]{6}$/.test(color)) PPT[key] = color
    }
  })
  return previous
}

function restorePptTheme(previous) {
  Object.entries(previous || {}).forEach(([key, value]) => {
    PPT[key] = value
  })
}

function slideSnippet(value, maxLength = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(12, maxLength - 3))}...`
}

function fitFont(value, base, options = {}) {
  const length = String(value || '').length
  const min = options.min ?? 9
  const medium = options.medium ?? 44
  const long = options.long ?? 76
  const extraLong = options.extraLong ?? 112
  if (length > extraLong) return Math.max(min, base - 5.2)
  if (length > long) return Math.max(min, base - 3.8)
  if (length > medium) return Math.max(min, base - 2.2)
  return base
}

function addCoverSlide(pptx, classroom, scene) {
  const slide = pptx.addSlide()
  slide.background = { color: PPT.navy }
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: PPT.w, h: PPT.h, fill: { color: PPT.navy }, line: { color: PPT.navy } })
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: PPT.w, h: 0.22, fill: { color: PPT.orange }, line: { color: PPT.orange } })
  slide.addShape(pptx.ShapeType.rect, { x: 0.74, y: 0.82, w: 0.14, h: 5.78, fill: { color: PPT.orange }, line: { color: PPT.orange } })
  slide.addShape(pptx.ShapeType.roundRect, { x: 8.6, y: 0.82, w: 3.45, h: 4.95, rectRadius: 0.1, fill: { color: '31455F', transparency: 8 }, line: { color: '3F5674', transparency: 22 } })
  slide.addText('GMP 助学平台 · 智能课件', {
    x: 9.02, y: 1.08, w: 2.7, h: 0.28,
    fontFace: 'Microsoft YaHei', fontSize: 11.5, bold: true, color: 'CFE3F7',
    fit: 'shrink',
  })
  slide.addText('质量体系 / 证据链 / 案例研讨', {
    x: 9.02, y: 1.48, w: 2.75, h: 0.35,
    fontFace: 'Microsoft YaHei', fontSize: 16, bold: true, color: PPT.white,
    fit: 'shrink',
  })
  slide.addShape(pptx.ShapeType.line, { x: 9.02, y: 2.06, w: 2.55, h: 0, line: { color: PPT.orange, width: 1.5 } })
  slide.addText(slideSnippet(scene.title, 48), {
    x: 1.08, y: 1.05, w: 7.15, h: 0.78,
    fontFace: 'Microsoft YaHei', fontSize: fitFont(scene.title, 30, { medium: 18, long: 28, min: 21 }), bold: true, color: PPT.white,
    breakLine: false, margin: 0,
  })
  slide.addText(slideSnippet(scene.subtitle, 64), {
    x: 1.08, y: 2.02, w: 7.25, h: 1.62,
    fontFace: 'Microsoft YaHei', fontSize: fitFont(scene.subtitle, 40, { medium: 14, long: 26, extraLong: 44, min: 25 }), bold: true, color: PPT.white,
    fit: 'shrink', valign: 'mid', margin: 0,
  })
  slide.addText('实施与合规管理培训', {
    x: 1.1, y: 3.86, w: 4.9, h: 0.46,
    fontFace: 'Microsoft YaHei', fontSize: 19, bold: true, color: 'E7E6E6',
  })
  slide.addText('基于 GMP 规范、飞行检查缺陷数据与课堂案例研讨生成', {
    x: 1.1, y: 4.4, w: 6.95, h: 0.42,
    fontFace: 'Microsoft YaHei', fontSize: 13.5, color: 'D9E2F3',
    fit: 'shrink',
  })
  addChip(slide, pptx, classroom.trainingId || 'GMP', 1.1, 5.22, 1.25, PPT.orange)
  addChip(slide, pptx, `${classroom.scenes.length} 页课件`, 2.55, 5.22, 1.72, PPT.blue)
  addChip(slide, pptx, classroom.classHours || '1-2 学时', 4.5, 5.22, 1.65, PPT.green)
  addNotes(slide, scene)
}

function addTeachingSlide(pptx, classroom, scene, index) {
  const slide = pptx.addSlide()
  slide.background = { color: PPT.light }
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: PPT.w, h: 0.42, fill: { color: PPT.navy }, line: { color: PPT.navy } })
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.42, w: PPT.w, h: 0.06, fill: { color: PPT.orange }, line: { color: PPT.orange } })
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.42, y: 0.68, w: 0.92, h: 0.52, rectRadius: 0.06, fill: { color: 'FFF4E8' }, line: { color: 'F6D2B6', width: 0.8 } })
  slide.addText(`${String(index + 1).padStart(2, '0')}`, {
    x: 0.44, y: 0.79, w: 0.88, h: 0.28,
    fontFace: 'Microsoft YaHei', fontSize: 16, bold: true, color: PPT.orange,
    align: 'center',
  })
  slide.addText(slideSnippet(scene.title, 62), {
    x: 1.52, y: 0.62, w: 9.7, h: 0.6,
    fontFace: 'Microsoft YaHei', fontSize: fitFont(scene.title, 26, { medium: 20, long: 34, extraLong: 52, min: 17 }), bold: true, color: PPT.navy,
    fit: 'shrink', margin: 0,
  })
  slide.addText(slideSnippet(scene.subtitle || classroom.topic, 92), {
    x: 1.54, y: 1.22, w: 10.15, h: 0.34,
    fontFace: 'Microsoft YaHei', fontSize: fitFont(scene.subtitle || classroom.topic, 13, { medium: 42, long: 74, min: 9.8 }), color: PPT.gray,
    fit: 'shrink',
  })

  switch (scene.visual) {
    case 'pyramid':
      addPyramid(slide, pptx, scene)
      break
    case 'process':
    case 'loop':
      addProcess(slide, pptx, scene)
      break
    case 'table':
      addDefectTable(slide, pptx, scene)
      break
    case 'matrix':
    case 'risk':
      addRiskMatrix(slide, pptx, scene)
      break
    case 'case':
      addCaseBoard(slide, pptx, scene)
      break
    default:
      addBulletCards(slide, pptx, scene)
      break
  }

  slide.addShape(pptx.ShapeType.line, { x: 0.62, y: 6.82, w: 12.05, h: 0, line: { color: PPT.line, width: 1 } })
  slide.addText(slideSnippet(classroom.topic, 72), { x: 0.65, y: 6.94, w: 8.8, h: 0.24, fontSize: 8.5, color: '7B8794', fontFace: 'Microsoft YaHei' })
  slide.addText(`${index + 1} / ${classroom.scenes.length}`, { x: 11.45, y: 6.94, w: 1.2, h: 0.24, fontSize: 8.5, color: '7B8794', fontFace: 'Microsoft YaHei', align: 'right' })
  addNotes(slide, scene)
}

function addBulletCards(slide, pptx, scene) {
  const bullets = scene.bullets.length ? scene.bullets : ['围绕法规依据、岗位动作和记录证据展开。']
  bullets.slice(0, 6).forEach((text, index) => {
    const cardText = slideSnippet(text, 92)
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = 0.78 + col * 6.12
    const y = 1.78 + row * 1.34
    const color = [PPT.blue, PPT.orange, PPT.green, 'A5A5A5', '5B9BD5', '954F72'][index] || PPT.blue
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w: 5.72, h: 1.08, rectRadius: 0.08, fill: { color: PPT.white }, line: { color: 'D9E2EF', width: 1.1 } })
    slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.15, h: 1.08, fill: { color }, line: { color } })
    slide.addText(String(index + 1).padStart(2, '0'), { x: x + 0.27, y: y + 0.18, w: 0.58, h: 0.3, fontSize: 12, bold: true, color, fontFace: 'Microsoft YaHei' })
    slide.addText(cardText, { x: x + 0.9, y: y + 0.12, w: 4.46, h: 0.84, fontSize: fitFont(cardText, 13.4, { medium: 34, long: 58, extraLong: 82, min: 9.2 }), color: PPT.gray, fontFace: 'Microsoft YaHei', fit: 'shrink', valign: 'mid', breakLine: false, margin: 0.03 })
  })
  addActivityBox(slide, pptx, scene.activity)
}

function addPyramid(slide, pptx, scene) {
  const levels = ['法律顶层', '行政法规/部门规章', 'GMP 规范与附录', '指南/检查要点/缺陷案例']
  levels.forEach((label, index) => {
    const w = [3.35, 4.1, 4.85, 5.6][index]
    const x = 6.35
    const y = 1.65 + index * 0.78
    const color = [PPT.navy, PPT.blue, PPT.orange, PPT.green][index]
    slide.addShape(pptx.ShapeType.chevron, { x, y, w, h: 0.58, fill: { color }, line: { color: PPT.white, width: 1 } })
    slide.addText(label, { x, y: y + 0.11, w, h: 0.28, fontSize: 12.5, bold: true, color: PPT.white, align: 'center', fontFace: 'Microsoft YaHei', fit: 'shrink' })
  })
  addBulletList(slide, scene.bullets, 0.75, 1.9, 4.9, 2.45, { maxItems: 4, maxLength: 74, fontSize: 11.2 })
  addActivityBox(slide, pptx, scene.activity)
}

function addProcess(slide, pptx, scene) {
  const bullets = scene.bullets.slice(0, 4)
  bullets.forEach((text, index) => {
    const stepText = slideSnippet(text, 64)
    const x = 0.78 + index * 3.05
    const color = [PPT.blue, PPT.orange, PPT.green, '954F72'][index]
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 2.08, w: 2.5, h: 1.48, rectRadius: 0.1, fill: { color }, line: { color } })
    slide.addText(`0${index + 1}`, { x: x + 0.18, y: 2.28, w: 0.58, h: 0.26, fontSize: 12, bold: true, color: PPT.white, fontFace: 'Microsoft YaHei' })
    slide.addText(stepText, { x: x + 0.22, y: 2.58, w: 2.06, h: 0.78, fontSize: fitFont(stepText, 12.4, { medium: 24, long: 40, extraLong: 58, min: 8.6 }), bold: true, color: PPT.white, fit: 'shrink', align: 'center', valign: 'mid', fontFace: 'Microsoft YaHei', margin: 0.02 })
    if (index < bullets.length - 1) {
      slide.addShape(pptx.ShapeType.rightArrow, { x: x + 2.55, y: 2.56, w: 0.38, h: 0.28, fill: { color: 'AEB8C7' }, line: { color: 'AEB8C7' } })
    }
  })
  addBulletList(slide, scene.bullets.slice(4), 0.92, 4.08, 11.4, 0.8)
  addActivityBox(slide, pptx, scene.activity)
}

function addDefectTable(slide, pptx, scene) {
  const rows = [
    ['缺陷领域', '占比', '课堂关注点'],
    ['质量控制与保证', '21.6%', '复核、偏差、放行证据'],
    ['文件管理', '21.1%', '记录真实、版本受控'],
    ['设备管理', '13.4%', '清洁、维护、验证状态'],
    ['生产管理', '12.7%', '工艺执行与现场控制'],
  ]
  rows.forEach((row, r) => {
    row.forEach((text, c) => {
      const widths = [3.1, 1.45, 6.25]
      const x = 1.05 + widths.slice(0, c).reduce((sum, item) => sum + item, 0)
      const y = 1.6 + r * 0.46
      const fill = r === 0 ? PPT.navy : (r % 2 ? PPT.white : 'EEF3F9')
      slide.addShape(pptx.ShapeType.rect, { x, y, w: widths[c], h: 0.46, fill: { color: fill }, line: { color: 'D7DFEA', width: 0.6 } })
      slide.addText(text, { x: x + 0.1, y: y + 0.09, w: widths[c] - 0.2, h: 0.2, fontSize: 10.7, bold: r === 0, color: r === 0 ? PPT.white : PPT.gray, fontFace: 'Microsoft YaHei', fit: 'shrink' })
    })
  })
  addBulletList(slide, scene.bullets.slice(0, 3), 1.05, 4.18, 10.7, 1.05, { maxItems: 3, maxLength: 88, lineHeight: 0.3, step: 0.35, fontSize: 11 })
  addActivityBox(slide, pptx, scene.activity)
}

function addRiskMatrix(slide, pptx, scene) {
  const labels = ['记录风险', '过程风险', '人员风险', '体系风险']
  labels.forEach((label, index) => {
    const riskText = slideSnippet(scene.bullets[index] || '证据不足会导致质量判断失真。', 78)
    const x = 1.02 + (index % 2) * 5.7
    const y = 1.78 + Math.floor(index / 2) * 1.42
    const color = [PPT.orange, PPT.blue, PPT.green, '954F72'][index]
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w: 5.12, h: 1.08, rectRadius: 0.08, fill: { color: PPT.white }, line: { color: 'D7DFEA', width: 1 } })
    slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.22, y: y + 0.27, w: 0.5, h: 0.5, fill: { color }, line: { color } })
    slide.addText(label, { x: x + 0.86, y: y + 0.15, w: 1.62, h: 0.28, fontSize: 13, bold: true, color, fontFace: 'Microsoft YaHei' })
    slide.addText(riskText, { x: x + 0.86, y: y + 0.47, w: 3.82, h: 0.48, fontSize: fitFont(riskText, 11.2, { medium: 30, long: 52, min: 8.5 }), color: PPT.gray, fit: 'shrink', fontFace: 'Microsoft YaHei', margin: 0.02 })
  })
  addActivityBox(slide, pptx, scene.activity)
}

function addCaseBoard(slide, pptx, scene) {
  const columns = [
    ['事实', scene.bullets[0] || '现场出现质量异常。'],
    ['风险', scene.bullets[1] || '证据链不完整，质量决策依据不足。'],
    ['决策', scene.bullets[2] || 'QA 需补充影响评估和 CAPA。'],
  ]
  columns.forEach(([label, text], index) => {
    const caseText = slideSnippet(text, 92)
    const x = 0.92 + index * 4.06
    const color = [PPT.blue, PPT.orange, PPT.green][index]
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 1.92, w: 3.45, h: 2.65, rectRadius: 0.06, fill: { color: PPT.white }, line: { color: 'D7DFEA', width: 1 } })
    slide.addText(label, { x: x + 0.22, y: 2.12, w: 3, h: 0.32, fontSize: 15, bold: true, color, fontFace: 'Microsoft YaHei' })
    slide.addShape(pptx.ShapeType.line, { x: x + 0.22, y: 2.55, w: 2.98, h: 0, line: { color, width: 1.2 } })
    slide.addText(caseText, { x: x + 0.26, y: 2.72, w: 2.9, h: 1.46, fontSize: fitFont(caseText, 13, { medium: 32, long: 58, extraLong: 82, min: 8.8 }), color: PPT.gray, fit: 'shrink', valign: 'mid', fontFace: 'Microsoft YaHei', margin: 0.02 })
  })
  addActivityBox(slide, pptx, scene.activity)
}

function addBulletList(slide, bullets, x, y, w, h, options = {}) {
  const items = bullets.slice(0, options.maxItems ?? 5)
  const count = Math.max(items.length, 1)
  const lineHeight = options.lineHeight ?? Math.max(0.27, Math.min(0.4, h / count))
  const step = options.step ?? Math.max(0.31, Math.min(0.38, lineHeight + 0.06))
  const maxLength = options.maxLength ?? 86
  const baseFont = options.fontSize ?? 11.4
  items.forEach((text, index) => {
    const bulletText = `\u2022 ${slideSnippet(text, maxLength)}`
    slide.addText(bulletText, {
      x,
      y: y + index * step,
      w,
      h: lineHeight,
      fontSize: fitFont(bulletText, baseFont, { medium: 40, long: 68, extraLong: 92, min: 8.2 }),
      color: PPT.gray,
      fontFace: 'Microsoft YaHei',
      fit: 'shrink',
      breakLine: false,
      valign: 'mid',
      margin: 0.01,
    })
  })
}

function addActivityBox(slide, pptx, activity) {
  if (!activity) return
  const text = `课堂活动：${slideSnippet(activity, 96)}`
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.78, y: 6.02, w: 11.85, h: 0.52, rectRadius: 0.08, fill: { color: 'FFF4E8' }, line: { color: 'F4C7A1', width: 1 } })
  slide.addText(text, { x: 1.02, y: 6.13, w: 11.35, h: 0.24, fontSize: fitFont(text, 10.8, { medium: 50, long: 78, min: 8.4 }), bold: true, color: PPT.orange, fontFace: 'Microsoft YaHei', fit: 'shrink', breakLine: false, valign: 'mid', margin: 0.01 })
}

function addChip(slide, pptx, text, x, y, w, color) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 0.36, rectRadius: 0.05, fill: { color }, line: { color } })
  slide.addText(text, { x: x + 0.08, y: y + 0.08, w: w - 0.16, h: 0.2, fontFace: 'Microsoft YaHei', fontSize: 10, bold: true, color: PPT.white, align: 'center', fit: 'shrink' })
}

function addNotes(slide, scene) {
  if (typeof slide.addNotes === 'function') {
    slide.addNotes(`讲解提示：${scene.speakerNotes || ''}\n课堂活动：${scene.activity || ''}`)
  }
}

function buildPptFileName(classroom) {
  let rawTitle = classroom.topic || 'GMP教学课件'
  if (classroom.trainingId && rawTitle.toLowerCase().startsWith(classroom.trainingId.toLowerCase())) {
    rawTitle = rawTitle.slice(classroom.trainingId.length).replace(/^[\s·.、:：-]+/, '')
  }
  rawTitle = rawTitle
    .replace(/^(请|请帮我|帮我)?\s*(生成|制作|做|输出)?\s*\d{1,2}\s*(页|张|p|P|slides?)?\s*/i, '')
    .replace(/(字体|字号).{0,8}(大|清晰)/g, '')
    .replace(/(样式|风格).{0,12}(好看|现代|清晰|正式)/g, '')
    .replace(/教学\s*PPT/gi, '')
    .replace(/PPT\s*课件/gi, '')
    .replace(/教学课件/gi, '')
    .replace(/PPT/gi, '')
    .replace(/课件/g, '')
    .trim()
  const title = safeFileBase(rawTitle || classroom.topic || 'GMP教学课件')
  const prefix = classroom.trainingId ? `${safeFileBase(classroom.trainingId)}-` : ''
  return `${prefix}${title}-教学课件.pptx`
}

function safeFileBase(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '')
    .slice(0, 48) || 'GMP教学课件'
}

function renderPptContentTypes(slideCount) {
  const slides = Array.from({ length: slideCount }, (_, index) =>
    `  <Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('\n')

  return xmlHeader(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${slides}
</Types>`)
}

function renderCoreProps(title, generatedAt) {
  return xmlHeader(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>OpenMAIC Service</dc:creator>
  <cp:lastModifiedBy>OpenMAIC Service</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(generatedAt)}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(new Date().toISOString())}</dcterms:modified>
</cp:coreProperties>`)
}

function renderPresentationXml(slideCount) {
  const slideIds = Array.from({ length: slideCount }, (_, index) =>
    `    <p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`
  ).join('\n')

  return xmlHeader(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
${slideIds}
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`)
}

function renderPresentationRels(slideCount) {
  const slideRels = Array.from({ length: slideCount }, (_, index) =>
    `  <Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`
  ).join('\n')

  return xmlHeader(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slideRels}
</Relationships>`)
}

function renderThemeXml() {
  return xmlHeader(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="OpenMAIC">
  <a:themeElements>
    <a:clrScheme name="OpenMAIC">
      <a:dk1><a:srgbClr val="183B4B"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1D6F78"/></a:dk2>
      <a:lt2><a:srgbClr val="F4F8F8"/></a:lt2>
      <a:accent1><a:srgbClr val="1D6F78"/></a:accent1>
      <a:accent2><a:srgbClr val="D97706"/></a:accent2>
      <a:accent3><a:srgbClr val="16A34A"/></a:accent3>
      <a:accent4><a:srgbClr val="2563EB"/></a:accent4>
      <a:accent5><a:srgbClr val="7C3AED"/></a:accent5>
      <a:accent6><a:srgbClr val="DC2626"/></a:accent6>
      <a:hlink><a:srgbClr val="1D6F78"/></a:hlink>
      <a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="OpenMAIC">
      <a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface="Microsoft YaHei"/></a:majorFont>
      <a:minorFont><a:latin typeface="Aptos"/><a:ea typeface="Microsoft YaHei"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="OpenMAIC"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme>
  </a:themeElements>
</a:theme>`)
}

function renderSlideMasterXml() {
  return xmlHeader(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>
</p:sldMaster>`)
}

function renderSlideLayoutXml() {
  return xmlHeader(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`)
}

function renderSlideXml(scene, slideNumber, deckTitle) {
  const bullets = scene.bullets.slice(0, 6).map(item => `• ${item}`)
  const shapes = [
    textShape(2, 'Section', 520000, 260000, 2400000, 300000, [scene.type.toUpperCase()], { size: 1100, color: '1D6F78', bold: true }),
    textShape(3, 'Title', 520000, 620000, 10800000, 980000, [scene.title], { size: 3600, color: '183B4B', bold: true }),
    textShape(4, 'Subtitle', 540000, 1560000, 10600000, 520000, [scene.subtitle], { size: 1550, color: '6B8A98' }),
    textShape(5, 'Bullets', 720000, 2240000, 10500000, 2700000, bullets, { size: 1750, color: '183B4B' }),
    textShape(6, 'Activity', 780000, 5260000, 10100000, 620000, [`Activity: ${scene.activity}`], { size: 1200, color: '1D6F78', bold: true, fill: 'EAF5F4' }),
    textShape(7, 'Footer', 720000, 6200000, 6800000, 280000, [`${deckTitle} · ${slideNumber}`], { size: 850, color: '6B8A98' }),
  ].join('\n')

  return xmlHeader(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="F8FBFB"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapes}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`)
}

function textShape(id, name, x, y, cx, cy, paragraphs, options = {}) {
  const fill = options.fill
    ? `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:solidFill><a:srgbClr val="${options.fill}"/></a:solidFill><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom></p:spPr>`
    : `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></p:spPr>`

  const runs = paragraphs.map((paragraph, index) => `
        <a:p>
          <a:pPr marL="${paragraph.startsWith('•') ? 220000 : 0}" indent="0"/>
          <a:r>
            <a:rPr lang="zh-CN" sz="${options.size || 1400}"${options.bold ? ' b="1"' : ''}>
              <a:solidFill><a:srgbClr val="${options.color || '183B4B'}"/></a:solidFill>
            </a:rPr>
            <a:t>${escapeXml(paragraph)}</a:t>
          </a:r>
          ${index === paragraphs.length - 1 ? '<a:endParaRPr lang="zh-CN"/>' : ''}
        </a:p>`).join('')

  return `<p:sp>
      <p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      ${fill}
      <p:txBody><a:bodyPr wrap="square" lIns="100000" tIns="70000" rIns="100000" bIns="70000"/><a:lstStyle/>${runs}</p:txBody>
    </p:sp>`
}

function createZip(entries) {
  const chunks = []
  const central = []
  let offset = 0
  const dosTime = 0
  const dosDate = 0x0021

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8')
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)
    const crc = crc32(data)
    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    name.copy(local, 30)
    chunks.push(local, data)

    const record = Buffer.alloc(46 + name.length)
    record.writeUInt32LE(0x02014b50, 0)
    record.writeUInt16LE(20, 4)
    record.writeUInt16LE(20, 6)
    record.writeUInt16LE(0x0800, 8)
    record.writeUInt16LE(0, 10)
    record.writeUInt16LE(dosTime, 12)
    record.writeUInt16LE(dosDate, 14)
    record.writeUInt32LE(crc, 16)
    record.writeUInt32LE(data.length, 20)
    record.writeUInt32LE(data.length, 24)
    record.writeUInt16LE(name.length, 28)
    record.writeUInt16LE(0, 30)
    record.writeUInt16LE(0, 32)
    record.writeUInt16LE(0, 34)
    record.writeUInt16LE(0, 36)
    record.writeUInt32LE(0, 38)
    record.writeUInt32LE(offset, 42)
    name.copy(record, 46)
    central.push(record)

    offset += local.length + data.length
  }

  const centralSize = central.reduce((sum, record) => sum + record.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...chunks, ...central, end])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let i = 0; i < 8; i += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function xmlHeader(value) {
  return value.trim()
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function renderClassroomHtml(classroom) {
  const sceneButtons = classroom.scenes
    .map((scene, index) => `<button data-slide="${index}"${index === 0 ? ' class="active"' : ''}>${index + 1}</button>`)
    .join('')

  const slides = classroom.scenes.map((scene, index) => `
    <section class="slide${index === 0 ? ' active' : ''}" data-slide="${index}">
      <p class="eyebrow">${escapeHtml(scene.type)}</p>
      <h2>${escapeHtml(scene.title)}</h2>
      <h3>${escapeHtml(scene.subtitle)}</h3>
      <ul>
        ${scene.bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
      <aside>
        <strong>Activity</strong>
        <span>${escapeHtml(scene.activity)}</span>
      </aside>
      <footer>${escapeHtml(scene.speakerNotes)}</footer>
    </section>
  `).join('')

  const quizItems = classroom.quiz.map((item, index) => `
    <article>
      <strong>${index + 1}. ${escapeHtml(item.stem)}</strong>
      ${item.options ? `<ol>${item.options.map(option => `<li>${escapeHtml(option)}</li>`).join('')}</ol>` : ''}
      <p>${escapeHtml(item.answer || item.reference)}</p>
    </article>
  `).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(classroom.topic)} - OpenMAIC Classroom</title>
  <style>
    :root { color-scheme: light; --ink:#183b4b; --muted:#6b8a98; --brand:#1d6f78; --paper:#ffffff; --wash:#eef5f4; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, "Microsoft YaHei", Arial, sans-serif; color: var(--ink); background: linear-gradient(135deg,#e8f1ef,#f7fafc); }
    .shell { min-height: 100vh; display: grid; grid-template-columns: 290px minmax(0,1fr); }
    nav { padding: 28px 22px; background: #153744; color: #fff; display: flex; flex-direction: column; gap: 18px; }
    nav h1 { margin: 0; font-size: 24px; line-height: 1.18; }
    nav p { margin: 0; color: rgba(255,255,255,.72); line-height: 1.7; font-size: 13px; }
    .controls { display: flex; gap: 8px; flex-wrap: wrap; }
    .controls button { width: 38px; height: 34px; border-radius: 8px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.08); color: #fff; cursor: pointer; font-weight: 800; }
    .controls button.active { background: #fff; color: #153744; }
    .links { margin-top: auto; display: grid; gap: 8px; }
    .links a { color: #fff; text-decoration: none; font-size: 13px; padding: 9px 11px; border-radius: 8px; background: rgba(255,255,255,.1); }
    main { padding: 28px; display: grid; gap: 18px; align-content: start; }
    .deck { min-height: 540px; position: relative; }
    .slide { display: none; min-height: 540px; padding: 42px; background: var(--paper); border: 1px solid rgba(31,71,92,.12); border-radius: 10px; box-shadow: 0 18px 52px rgba(24,59,75,.12); }
    .slide.active { display: grid; align-content: start; gap: 18px; }
    .eyebrow { margin: 0; color: var(--brand); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; font-weight: 900; }
    h2 { margin: 0; font-size: clamp(30px, 5vw, 56px); line-height: 1.02; letter-spacing: 0; }
    h3 { margin: 0; color: var(--muted); font-size: 18px; font-weight: 600; line-height: 1.55; }
    ul { margin: 8px 0 0; padding-left: 22px; display: grid; gap: 12px; font-size: 18px; line-height: 1.65; }
    aside { margin-top: 10px; padding: 16px; border-left: 4px solid var(--brand); background: #f2f8f7; display: grid; gap: 5px; border-radius: 6px; }
    aside strong { color: var(--brand); }
    footer { margin-top: auto; color: var(--muted); font-size: 13px; border-top: 1px solid #e5edf0; padding-top: 14px; line-height: 1.7; }
    .quiz { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; }
    .quiz article { background: #fff; border: 1px solid rgba(31,71,92,.12); border-radius: 8px; padding: 16px; display: grid; gap: 10px; }
    .quiz strong { line-height: 1.5; }
    .quiz p { margin: 0; color: var(--brand); font-weight: 700; line-height: 1.55; }
    .quiz ol { margin: 0; padding-left: 20px; color: var(--muted); line-height: 1.6; }
    @media (max-width: 780px) {
      .shell { grid-template-columns: 1fr; }
      nav { position: static; }
      main { padding: 16px; }
      .slide { min-height: 470px; padding: 26px; }
      ul { font-size: 16px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <nav>
      <p class="eyebrow">OpenMAIC Classroom</p>
      <h1>${escapeHtml(classroom.topic)}</h1>
      <p>Generated at ${escapeHtml(new Date(classroom.generatedAt).toLocaleString('zh-CN'))}</p>
      <div class="controls">${sceneButtons}</div>
      <div class="links">
        <a href="./outline.md" target="_blank">Open outline</a>
        <a href="./classroom.json" target="_blank">Open JSON</a>
      </div>
    </nav>
    <main>
      <div class="deck">${slides}</div>
      <section class="quiz">${quizItems}</section>
    </main>
  </div>
  <script>
    const buttons = [...document.querySelectorAll('[data-slide]')].filter(el => el.tagName === 'BUTTON')
    const slides = [...document.querySelectorAll('.slide')]
    function show(index) {
      buttons.forEach(button => button.classList.toggle('active', Number(button.dataset.slide) === index))
      slides.forEach(slide => slide.classList.toggle('active', Number(slide.dataset.slide) === index))
    }
    buttons.forEach(button => button.addEventListener('click', () => show(Number(button.dataset.slide))))
    window.addEventListener('keydown', event => {
      const active = buttons.findIndex(button => button.classList.contains('active'))
      if (event.key === 'ArrowRight') show(Math.min(buttons.length - 1, active + 1))
      if (event.key === 'ArrowLeft') show(Math.max(0, active - 1))
    })
  </script>
</body>
</html>`
}

function renderOutlineMarkdown(classroom) {
  const sceneText = classroom.scenes.map((scene, index) => [
    `## ${index + 1}. ${scene.title}`,
    '',
    `**Subtitle:** ${scene.subtitle}`,
    '',
    ...scene.bullets.map(item => `- ${item}`),
    '',
    `**Activity:** ${scene.activity}`,
    '',
    `**Speaker notes:** ${scene.speakerNotes}`,
    '',
  ].join('\n')).join('\n')

  const quizText = classroom.quiz.map((item, index) => {
    const options = item.options ? item.options.map(option => `  - ${option}`).join('\n') : ''
    return `${index + 1}. ${item.stem}\n${options}\n   Reference: ${item.answer || item.reference}`
  }).join('\n\n')

  return `# ${classroom.topic}

Generated by local OpenMAIC service at ${classroom.generatedAt}

## Objectives

${classroom.objectives.map(item => `- ${item}`).join('\n')}

${sceneText}

## Quiz

${quizText}
`
}

function publicJob(job) {
  return {
    success: true,
    jobId: job.jobId,
    status: job.status,
    done: job.done,
    step: job.step,
    progress: job.progress,
    message: job.message,
    scenesGenerated: job.scenesGenerated,
    totalScenes: job.totalScenes,
    classroomUrl: job.classroomUrl,
    summaryUrl: job.summaryUrl,
    outlineUrl: job.outlineUrl,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

async function patchJob(jobId, patch) {
  const current = jobs.get(jobId)
  if (!current) return null
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  jobs.set(jobId, next)
  await saveJobs()
  return next
}

async function serveClassroomFile(pathname, res) {
  let relative = pathname.replace(/^\/classrooms\/?/, '')
  if (!relative || relative.endsWith('/')) {
    relative = path.join(relative, 'index.html')
  }

  const target = path.resolve(CLASSROOM_DIR, relative)
  const classroomRoot = path.resolve(CLASSROOM_DIR)
  if (target !== classroomRoot && !target.startsWith(`${classroomRoot}${path.sep}`)) {
    sendJson(res, 403, { success: false, error: 'Forbidden' })
    return
  }

  const stat = await statSafe(target)
  if (!stat) {
    sendJson(res, 404, { success: false, error: 'File not found' })
    return
  }

  const filePath = stat.isDirectory() ? path.join(target, 'index.html') : target
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, {
    ...corsHeaders(),
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
  })
  fs.createReadStream(filePath).pipe(res)
}

async function readJsonBody(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > MAX_BODY_SIZE) {
      throw new Error('Request body is too large.')
    }
  }
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('Invalid JSON body.')
  }
}

async function ensureRuntimeDirs() {
  await Promise.all([
    fsp.mkdir(DATA_DIR, { recursive: true }),
    fsp.mkdir(CLASSROOM_DIR, { recursive: true }),
  ])
}

async function loadJobs() {
  try {
    const raw = await fsp.readFile(JOBS_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    for (const job of parsed.jobs || []) {
      jobs.set(job.jobId, job)
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('[openmaic] could not load jobs:', error.message)
    }
  }
}

async function saveJobs() {
  const payload = JSON.stringify({ jobs: [...jobs.values()] }, null, 2)
  const tmp = `${JOBS_PATH}.tmp`
  await fsp.writeFile(tmp, payload, 'utf8')
  await fsp.rename(tmp, JOBS_PATH)
}

async function statSafe(filePath) {
  try {
    return await fsp.stat(filePath)
  } catch {
    return null
  }
}

function readPort() {
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if ((arg === '-p' || arg === '--port') && args[i + 1]) {
      return Number(args[i + 1]) || DEFAULT_PORT
    }
    if (arg.startsWith('--port=')) {
      return Number(arg.slice('--port='.length)) || DEFAULT_PORT
    }
  }
  return Number(process.env.PORT) || DEFAULT_PORT
}

function getBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers.host || `localhost:${port}`
  return `${proto}://${host}`
}

function normalizeRequirement(value) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, 500)
}

function cleanText(value, maxLength = 500) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function cleanLongText(value, maxLength = 5000) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, maxLength)
}

function normalizeSlideCount(value, prompt = '') {
  const count = Number(value)
  if (Number.isFinite(count) && count > 0) return Math.max(6, Math.min(60, Math.round(count)))
  const inferred = inferSlideCount(prompt)
  return inferred ?? 18
}

function inferSlideCount(prompt) {
  if (typeof prompt !== 'string') return null
  const match = prompt.match(/(?:生成|制作|做|需要|约|大约)?\s*(\d{1,2})\s*(?:页|張|张|p|P|slides?)/i)
  if (!match) return null
  const count = Number(match[1])
  if (!Number.isFinite(count) || count <= 0) return null
  return Math.max(6, Math.min(60, Math.round(count)))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2)
  res.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function sendHtml(res, body) {
  res.writeHead(200, {
    ...corsHeaders(),
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function sendEmpty(res, status) {
  res.writeHead(status, corsHeaders())
  res.end()
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Cache-Control': 'no-store',
  }
}

function renderHomePage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenMAIC Service</title>
  <style>
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: #eef5f4; color: #183b4b; display: grid; place-items: center; min-height: 100vh; }
    main { width: min(760px, calc(100vw - 32px)); background: #fff; border: 1px solid rgba(31,71,92,.12); border-radius: 10px; padding: 28px; box-shadow: 0 18px 50px rgba(24,59,75,.12); }
    h1 { margin: 0 0 8px; }
    code { background: #f3f7f8; padding: 2px 6px; border-radius: 5px; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <main>
    <h1>OpenMAIC Service</h1>
    <p>Service is running on port ${port}.</p>
    <ul>
      <li><code>GET /health</code></li>
      <li><code>POST /api/generate-classroom</code></li>
      <li><code>GET /api/generate-classroom/:jobId</code></li>
    </ul>
  </main>
</body>
</html>`
}
