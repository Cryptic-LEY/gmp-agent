import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'

const CATEGORY_ICON: Record<string, string> = {
  '化学药制剂': '💊',
  '化学原料药': '🧪',
  '生物制品':   '🔬',
  '中成药':     '🌿',
  '中药饮片':   '🍃',
}

const CATEGORY_DESC: Record<string, string> = {
  '化学药制剂': '片剂、胶囊、注射剂等化学药品制剂的 GMP 生产管理',
  '化学原料药': '原料药合成、精制、干燥全流程质量控制',
  '生物制品':   '疫苗、血液制品等生物制品的洁净生产与质量保证',
  '中成药':     '中药复方制剂从投料到成品的 GMP 规范管理',
  '中药饮片':   '中药材炮制、饮片加工与质量标准执行',
}

// GET /api/simulation/cases
// 返回可用仿真案例列表，按剂型分类
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const rows = db.$client.prepare(`
    SELECT DISTINCT product_name, dosage_form, dosage_category,
      COUNT(*) OVER (PARTITION BY product_name) as section_count
    FROM case_library
    ORDER BY dosage_category, product_name
  `).all() as { product_name: string; dosage_form: string; dosage_category: string; section_count: number }[]

  // Group by category
  const grouped: Record<string, { product_name: string; dosage_form: string; section_count: number }[]> = {}
  for (const r of rows) {
    if (!grouped[r.dosage_category]) grouped[r.dosage_category] = []
    // Deduplicate
    if (!grouped[r.dosage_category].find(p => p.product_name === r.product_name)) {
      grouped[r.dosage_category].push({
        product_name: r.product_name,
        dosage_form:  r.dosage_form,
        section_count: r.section_count,
      })
    }
  }

  const categories = Object.entries(grouped).map(([name, products]) => ({
    name,
    icon: CATEGORY_ICON[name] ?? '🏭',
    desc: CATEGORY_DESC[name] ?? '',
    products,
  }))

  return NextResponse.json({ categories })
}
