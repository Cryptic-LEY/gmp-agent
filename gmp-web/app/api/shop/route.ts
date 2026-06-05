import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { questionHistory, userGameState } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { getRankByXp } from '@/lib/gamification'

// ── 商品定义 ─────────────────────────────────────────────────────────────────

export interface ShopItem {
  id: string
  name: string
  desc: string
  detail: string
  price: number        // 积分价格
  icon: string
  category: 'boost' | 'utility' | 'cosmetic'
  effect: string       // 效果说明
}

const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'xp_boost_sm',
    name: '经验加速卡·小',
    desc: '立即获得 +50 XP',
    detail: '使用后直接写入当前角色经验值，可能触发升级。',
    price: 40,
    icon: '⚡',
    category: 'boost',
    effect: '+50 XP',
  },
  {
    id: 'xp_boost_lg',
    name: '经验加速卡·大',
    desc: '立即获得 +150 XP',
    detail: '大量经验一次到位，快速冲击下一等级。',
    price: 100,
    icon: '🚀',
    category: 'boost',
    effect: '+150 XP',
  },
  {
    id: 'wrong_clear',
    name: '错题赦免券',
    desc: '清除最旧的 3 条错题',
    detail: '将最早的 3 条未复习错题标记为已复习，轻装上阵。',
    price: 60,
    icon: '🧹',
    category: 'utility',
    effect: '清除 3 条错题',
  },
  {
    id: 'streak_shield',
    name: '连续护盾',
    desc: '忘记打卡也不断签',
    detail: '购买后连续打卡天数 +1，相当于补签一天，保住连续记录。',
    price: 80,
    icon: '🛡️',
    category: 'utility',
    effect: '连续天数 +1',
  },
  {
    id: 'title_expert',
    name: '称号：GMP达人',
    desc: '专属限定称号',
    detail: '解锁「GMP达人」限定称号，显示在个人资料和排行榜中（不影响等级进度）。',
    price: 150,
    icon: '🏅',
    category: 'cosmetic',
    effect: '称号变更',
  },
  {
    id: 'title_guardian',
    name: '称号：质量卫士',
    desc: '专属限定称号',
    detail: '解锁「质量卫士」限定称号，展现你对药品质量管理的热情。',
    price: 200,
    icon: '⚔️',
    category: 'cosmetic',
    effect: '称号变更',
  },
]

// GET /api/shop — 返回商品列表 + 当前积分
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const [state] = await db.select({ points: userGameState.points })
    .from(userGameState)
    .where(eq(userGameState.userId, payload.userId))
    .limit(1)

  return NextResponse.json({
    points: state?.points ?? 0,
    items: SHOP_ITEMS,
  })
}

// POST /api/shop — 购买商品 { itemId }
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload
  let body: { itemId?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const item = SHOP_ITEMS.find(i => i.id === body.itemId)
  if (!item) return NextResponse.json({ error: '商品不存在' }, { status: 404 })

  // 读取当前状态
  const [state] = await db.select().from(userGameState)
    .where(eq(userGameState.userId, userId)).limit(1)
  if (!state) return NextResponse.json({ error: '用户数据不存在' }, { status: 404 })

  if ((state.points ?? 0) < item.price) {
    return NextResponse.json({ error: `积分不足，需要 ${item.price} 积分` }, { status: 400 })
  }

  // ── 执行商品效果 ─────────────────────────────────────────────────────────

  const updates: Partial<typeof userGameState.$inferInsert> = {
    points: (state.points ?? 0) - item.price,
  }
  let effectDesc = ''

  switch (item.id) {
    case 'xp_boost_sm': {
      const newXp = state.xp + 50
      const rank = getRankByXp(newXp)
      updates.xp = newXp
      updates.rankLevel = rank.level
      updates.rankTitle = rank.title
      effectDesc = `+50 XP，当前 ${newXp} XP`
      break
    }
    case 'xp_boost_lg': {
      const newXp = state.xp + 150
      const rank = getRankByXp(newXp)
      updates.xp = newXp
      updates.rankLevel = rank.level
      updates.rankTitle = rank.title
      effectDesc = `+150 XP，当前 ${newXp} XP`
      break
    }
    case 'wrong_clear': {
      // 把最旧的 3 条未复习错题标为已复习
      const wrongs = await db.select({ id: questionHistory.id })
        .from(questionHistory)
        .where(and(
          eq(questionHistory.userId, userId),
          eq(questionHistory.isCorrect, false),
          eq(questionHistory.reviewed, false),
        ))
        .limit(3)
      for (const w of wrongs) {
        await db.update(questionHistory)
          .set({ reviewed: true })
          .where(eq(questionHistory.id, w.id))
      }
      effectDesc = `已清除 ${wrongs.length} 条错题`
      break
    }
    case 'streak_shield': {
      const newStreak = (state.streakDays ?? 0) + 1
      const newMax = Math.max(state.maxStreak ?? 0, newStreak)
      updates.streakDays = newStreak
      updates.maxStreak = newMax
      effectDesc = `连续天数 ${state.streakDays} → ${newStreak} 天`
      break
    }
    case 'title_expert': {
      updates.rankTitle = 'GMP达人'
      effectDesc = '称号已更新为「GMP达人」'
      break
    }
    case 'title_guardian': {
      updates.rankTitle = '质量卫士'
      effectDesc = '称号已更新为「质量卫士」'
      break
    }
  }

  await db.update(userGameState).set(updates).where(eq(userGameState.userId, userId))

  return NextResponse.json({
    ok: true,
    itemName: item.name,
    effectDesc,
    pointsLeft: updates.points,
  })
}
