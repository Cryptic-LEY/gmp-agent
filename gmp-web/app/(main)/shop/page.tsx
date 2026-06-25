'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Coins, Loader2, ShoppingBag, Sparkles, X } from 'lucide-react'

interface ShopItem {
  id: string
  name: string
  desc: string
  detail: string
  price: number
  icon: string
  category: 'boost' | 'utility' | 'cosmetic'
  effect: string
}

interface PurchaseResult {
  ok: boolean
  itemName: string
  effectDesc: string
  pointsLeft: number
}

const CATEGORY_LABELS: Record<string, string> = {
  boost: '经验加速',
  utility: '实用道具',
  cosmetic: '限定称号',
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  boost:    { bg: 'rgba(29,111,120,0.07)',  text: '#1d6f78', border: 'rgba(29,111,120,0.18)' },
  utility:  { bg: 'rgba(200,129,43,0.07)', text: '#a15c07', border: 'rgba(200,129,43,0.2)'  },
  cosmetic: { bg: 'rgba(124,58,237,0.06)', text: '#6d28d9', border: 'rgba(124,58,237,0.18)' },
}

const POINT_RULES = [
  { title: '每日登录', value: '+5 积分', desc: '首次进入系统时自动打卡，和 +5 XP 同步发放。' },
  { title: '每日练习答对', value: '+2 积分', desc: '答错不扣分；不同题型另按规则获得 XP。' },
  { title: '积分消费', value: '仅商店扣减', desc: '兑换经验卡、错题券、补签护盾或称号，不影响课时分。' },
]

export default function ShopPage() {
  const router = useRouter()
  const [points, setPoints] = useState(0)
  const [items, setItems] = useState<ShopItem[]>([])
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ShopItem | null>(null)
  const [result, setResult] = useState<PurchaseResult | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }

    fetch('/api/shop', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setPoints(data.points ?? 0)
        setItems(data.items ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [router])

  async function handleBuy(item: ShopItem) {
    const token = localStorage.getItem('token')
    if (!token) return
    setBuying(item.id)
    setConfirm(null)

    try {
      const res = await fetch('/api/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemId: item.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || '购买失败')
        return
      }
      setPoints(data.pointsLeft)
      setResult(data as PurchaseResult)
    } catch {
      alert('网络错误，请稍后重试')
    } finally {
      setBuying(null)
    }
  }

  const grouped = Object.entries(CATEGORY_LABELS).map(([cat, label]) => ({
    cat, label,
    items: items.filter(i => i.category === cat),
  }))

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10, color: '#6b8a98' }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
      <span>加载中…</span>
    </div>
  )

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>

      {/* ── 页头 ── */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ color: '#1d6f78', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>游戏中心</p>
        <h1 style={{ color: '#183b4b', fontSize: 26, fontWeight: 700, margin: '4px 0 6px', fontFamily: "'Trebuchet MS','Microsoft YaHei',sans-serif" }}>积分商店</h1>
        <p style={{ color: '#6b8a98', fontSize: 13, margin: 0 }}>用答题和打卡积累的积分，兑换各种道具和称号。</p>
      </div>

      {/* ── 积分余额卡 ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1d6f78 0%, #0f4c54 100%)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 8px 24px rgba(29,111,120,0.25)',
      }}>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: '0 0 4px', fontWeight: 600, letterSpacing: '0.1em' }}>当前积分余额</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ color: '#fff', fontSize: 42, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{points.toLocaleString()}</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>积分</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, margin: '6px 0 0' }}>每日登录 +5 · 每道练习答对 +2 · 积分只作为商店货币使用</p>
        </div>
        <div style={{ fontSize: 48, opacity: 0.25 }}>🪙</div>
      </div>

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
        marginBottom: 30,
      }}>
        {POINT_RULES.map(rule => (
          <article key={rule.title} style={{
            background: '#fff',
            border: '1px solid rgba(31,71,92,0.08)',
            borderRadius: 14,
            padding: '14px 16px',
            boxShadow: '0 2px 12px rgba(29,53,74,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <strong style={{ color: '#183b4b', fontSize: 13 }}>{rule.title}</strong>
              <span style={{ color: '#1d6f78', fontSize: 13, fontWeight: 800 }}>{rule.value}</span>
            </div>
            <p style={{ color: '#6b8a98', fontSize: 12, lineHeight: 1.6, margin: '8px 0 0' }}>{rule.desc}</p>
          </article>
        ))}
      </section>

      {/* ── 分类商品 ── */}
      {grouped.map(({ cat, label, items: catItems }) => {
        const colors = CATEGORY_COLORS[cat]
        return (
          <section key={cat} style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{
                padding: '3px 10px', borderRadius: 20,
                background: colors.bg, color: colors.text,
                fontSize: 12, fontWeight: 700, border: `1px solid ${colors.border}`,
              }}>{label}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {catItems.map(item => {
                const canAfford = points >= item.price
                const isBuying = buying === item.id
                return (
                  <div key={item.id} style={{
                    background: '#fff', borderRadius: 14,
                    border: `1.5px solid ${canAfford ? colors.border : 'rgba(31,71,92,0.08)'}`,
                    padding: '18px 18px 16px',
                    boxShadow: '0 2px 12px rgba(29,53,74,0.05)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    opacity: canAfford ? 1 : 0.65,
                    transition: 'all 0.15s',
                  }}>
                    {/* 商品头 */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                        background: colors.bg, border: `1px solid ${colors.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22,
                      }}>{item.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ color: '#183b4b', fontSize: 14, display: 'block' }}>{item.name}</strong>
                        <p style={{ color: '#6b8a98', fontSize: 12, margin: '3px 0 0', lineHeight: 1.5 }}>{item.desc}</p>
                      </div>
                    </div>

                    {/* 效果说明 */}
                    <p style={{ color: '#46606f', fontSize: 11, lineHeight: 1.6, margin: 0, padding: '8px 10px', background: 'rgba(248,252,252,0.9)', borderRadius: 8 }}>
                      {item.detail}
                    </p>

                    {/* 价格 + 购买 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Coins size={14} color="#c8812b" />
                        <span style={{ color: '#c8812b', fontWeight: 800, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{item.price}</span>
                        <span style={{ color: '#9ba8b0', fontSize: 11 }}>积分</span>
                      </div>
                      <button
                        onClick={() => setConfirm(item)}
                        disabled={!canAfford || isBuying}
                        style={{
                          padding: '7px 16px', borderRadius: 8, border: 'none',
                          background: canAfford ? colors.text : '#d1d5db',
                          color: '#fff', fontSize: 13, fontWeight: 700,
                          cursor: canAfford ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', gap: 5,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        {isBuying ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ShoppingBag size={13} />}
                        {canAfford ? '兑换' : '积分不足'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {/* ── 确认弹窗 ── */}
      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,30,40,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          backdropFilter: 'blur(4px)',
        }} onClick={() => setConfirm(null)}>
          <div style={{
            background: '#fff', borderRadius: 20, padding: '28px 32px',
            width: 'min(420px, 90vw)', boxShadow: '0 20px 60px rgba(15,30,40,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <strong style={{ color: '#183b4b', fontSize: 17 }}>确认兑换</strong>
              <button onClick={() => setConfirm(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ba8b0', padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 16px', background: 'rgba(248,252,252,0.9)', borderRadius: 12, marginBottom: 18 }}>
              <span style={{ fontSize: 32 }}>{confirm.icon}</span>
              <div>
                <strong style={{ color: '#183b4b', display: 'block', fontSize: 15 }}>{confirm.name}</strong>
                <p style={{ color: '#6b8a98', fontSize: 12, margin: '3px 0 0' }}>{confirm.desc}</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ color: '#6b8a98', fontSize: 13 }}>消耗积分</span>
              <span style={{ color: '#c8812b', fontWeight: 800, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
                {confirm.price} 积分
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirm(null)} style={{
                flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid rgba(31,71,92,0.12)',
                background: '#fff', color: '#46606f', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>取消</button>
              <button onClick={() => handleBuy(confirm)} style={{
                flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #1d6f78, #0f4c54)',
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Sparkles size={14} />
                确认兑换
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 成功弹窗 ── */}
      {result && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,30,40,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          backdropFilter: 'blur(4px)',
        }} onClick={() => setResult(null)}>
          <div style={{
            background: '#fff', borderRadius: 20, padding: '36px 32px',
            width: 'min(380px, 90vw)', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(15,30,40,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(47,126,88,0.1)', margin: '0 auto 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircle2 size={32} color="#2f7e58" />
            </div>
            <strong style={{ color: '#183b4b', fontSize: 18, display: 'block', marginBottom: 6 }}>兑换成功！</strong>
            <p style={{ color: '#2f7e58', fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>{result.itemName}</p>
            <p style={{ color: '#6b8a98', fontSize: 13, margin: '0 0 20px', lineHeight: 1.6 }}>{result.effectDesc}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 22,
              padding: '10px', background: 'rgba(248,252,252,0.9)', borderRadius: 10 }}>
              <Coins size={15} color="#c8812b" />
              <span style={{ color: '#183b4b', fontSize: 13 }}>剩余积分：</span>
              <strong style={{ color: '#c8812b', fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{result.pointsLeft}</strong>
            </div>
            <button onClick={() => setResult(null)} style={{
              width: '100%', padding: '11px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #1d6f78, #0f4c54)',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>继续逛商店</button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
