import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import {
  getSimulationWalletSnapshot,
  normalizeSimulationWalletSnapshot,
  saveSimulationWalletSnapshot,
} from '@/lib/simulation/wallet-store'

function getUserId(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const payload = verifyToken(token)
  return payload?.userId ?? null
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const wallet = await getSimulationWalletSnapshot(userId)
    return NextResponse.json({ wallet })
  } catch (error) {
    console.error('load simulation wallet failed', error)
    return NextResponse.json({ error: '读取实训钱包失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const wallet = normalizeSimulationWalletSnapshot(body)

  try {
    const saved = await saveSimulationWalletSnapshot(userId, wallet)
    return NextResponse.json({ wallet: saved })
  } catch (error) {
    console.error('save simulation wallet failed', error)
    return NextResponse.json({ error: '同步实训钱包失败' }, { status: 500 })
  }
}
