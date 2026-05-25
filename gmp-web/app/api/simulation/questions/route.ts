import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'

// 剂型 → 优先取题的项目列表
const CATEGORY_PROJECTS: Record<string, string[]> = {
  '化学药制剂': [
    '专-项目3·厂房设施与设备管理',
    '专-项目6·生产全过程管理',
    '专-项目7·质量保证',
    '专-项目4·质量控制实验室管理',
  ],
  '化学原料药': [
    '专-项目3·厂房设施与设备管理',
    '专-项目6·生产全过程管理',
    '专-项目5·确认与验证管理',
  ],
  '生物制品': [
    '专-项目3·厂房设施与设备管理',
    '专-项目5·确认与验证管理',
    '专-项目6·生产全过程管理',
    '专-项目7·质量保证',
  ],
  '中成药': [
    '专-项目6·生产全过程管理',
    '专-项目7·质量保证',
    '专-项目3·厂房设施与设备管理',
  ],
  '中药饮片': [
    '专-项目6·生产全过程管理',
    '专-项目7·质量保证',
  ],
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// GET /api/simulation/questions?product_name=X&dosage_category=Y
// 返回案例材料 + 6 道客观题（不含 correct_answer）
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const productName    = searchParams.get('product_name') ?? ''
  const dosageCategory = searchParams.get('dosage_category') ?? ''

  if (!productName) return NextResponse.json({ error: 'product_name required' }, { status: 400 })

  // 1. 取案例材料（按优先级排序显示章节）
  const ORDER = ['产品概述', '工艺流程', '工艺操作', '质量监控', '质量标准', '主要设备', '工艺卫生', '处方依据', '其他', '附录']
  const sections = db.$client.prepare(`
    SELECT section_type, section_name, content
    FROM case_library
    WHERE product_name = ? AND content IS NOT NULL AND length(content) > 10
    ORDER BY product_name
  `).all(productName) as { section_type: string; section_name: string; content: string }[]

  const sortedSections = sections.sort((a, b) => {
    const ia = ORDER.indexOf(a.section_type)
    const ib = ORDER.indexOf(b.section_type)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  // 2. 取题目（不含 correct_answer）
  const projects = CATEGORY_PROJECTS[dosageCategory] ?? Object.values(CATEGORY_PROJECTS).flat()
  const placeholders = projects.map(() => '?').join(',')

  // 先取优先项目题（过滤掉选项缺失的脏数据）
  let questions = db.$client.prepare(`
    SELECT question_id, question_type, stem, difficulty, project_name,
           option_count, option_a, option_b, option_c, option_d, option_e, option_f, option_g
    FROM questions
    WHERE question_type IN ('单选题','多选题','判断题')
      AND status = 'active'
      AND project_name IN (${placeholders})
      AND (question_type = '判断题' OR (option_a IS NOT NULL AND option_a != '' AND option_b IS NOT NULL AND option_b != ''))
    ORDER BY RANDOM()
    LIMIT 8
  `).all(...projects) as Array<Record<string, unknown>>

  // 不够则补全（同样过滤选项缺失题）
  if (questions.length < 6) {
    const extra = db.$client.prepare(`
      SELECT question_id, question_type, stem, difficulty, project_name,
             option_count, option_a, option_b, option_c, option_d, option_e, option_f, option_g
      FROM questions
      WHERE question_type IN ('单选题','多选题','判断题')
        AND status = 'active'
        AND question_id NOT IN (${questions.map(() => '?').join(',') || "''"})
        AND (question_type = '判断题' OR (option_a IS NOT NULL AND option_a != '' AND option_b IS NOT NULL AND option_b != ''))
      ORDER BY RANDOM()
      LIMIT ?
    `).all(...questions.map(q => q.question_id), 6 - questions.length) as Array<Record<string, unknown>>
    questions = [...questions, ...extra]
  }

  questions = shuffle(questions).slice(0, 6)

  const formatted = questions.map(q => {
    const options: { key: string; text: string }[] = []
    const keys = ['A','B','C','D','E','F','G']
    for (const k of keys) {
      const v = q[`option_${k.toLowerCase()}`] as string | null
      if (v) options.push({ key: k, text: v })
    }
    return {
      question_id:   q.question_id,
      question_type: q.question_type,
      stem:          q.stem,
      difficulty:    q.difficulty,
      project_name:  q.project_name,
      options,
    }
  })

  return NextResponse.json({
    product_name:    productName,
    dosage_category: dosageCategory,
    sections:        sortedSections,
    questions:       formatted,
    total:           formatted.length,
  })
}
