'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface BindSession {
  sessionId: string
  provider: 'wechat'
  returnTo: string
  displayName: string | null
  avatarUrl: string | null
  error: string | null
  expired: boolean
  confirmed: boolean
}

function appendWechatStatus(path: string, status: string, message?: string) {
  const url = new URL(path || '/profile?tab=apps', window.location.origin)
  url.searchParams.set('tab', url.searchParams.get('tab') || 'apps')
  url.searchParams.set('wechat', status)
  if (message) url.searchParams.set('message', message)
  return `${url.pathname}${url.search}${url.hash}`
}

export default function WechatBindConfirmPage() {
  const router = useRouter()
  const loadedRef = useRef(false)
  const [sessionId, setSessionId] = useState('')
  const [session, setSession] = useState<BindSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const returnTo = useMemo(() => session?.returnTo || '/profile?tab=apps', [session])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    const params = new URLSearchParams(window.location.search)
    const nextSessionId = params.get('sessionId') || ''
    setSessionId(nextSessionId)

    async function loadSession() {
      if (!nextSessionId) {
        setError('缺少微信绑定会话，请重新发起绑定')
        setLoading(false)
        return
      }

      const token = localStorage.getItem('token')
      if (!token) {
        setError('请先登录平台账号，再确认微信绑定')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`/api/user/third-party-bindings?sessionId=${encodeURIComponent(nextSessionId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await response.json()
        if (!response.ok) {
          setError(data.error || '微信绑定会话读取失败')
          return
        }
        setSession(data.session)
        if (data.session?.error) setError(data.session.error)
        if (data.session?.expired) setError('绑定二维码已过期，请重新发起绑定')
      } catch (err) {
        setError(err instanceof Error ? err.message : '微信绑定会话读取失败')
      } finally {
        setLoading(false)
      }
    }

    loadSession()
  }, [])

  async function confirmBind() {
    const token = localStorage.getItem('token')
    if (!token || !sessionId) return

    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/user/third-party-bindings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'wechat', action: 'confirm', sessionId }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || '微信绑定失败')
        return
      }
      router.replace(appendWechatStatus(data.returnTo || returnTo, 'bound', '微信绑定成功'))
    } catch (err) {
      setError(err instanceof Error ? err.message : '微信绑定失败')
    } finally {
      setSaving(false)
    }
  }

  function goBack(status = 'cancelled', message = '已取消微信绑定') {
    router.replace(appendWechatStatus(returnTo, status, message))
  }

  const canConfirm = Boolean(session && !session.error && !session.expired && !session.confirmed)

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <section className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-sm p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-lg bg-[#07c160] flex items-center justify-center text-white font-bold">
            微
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">确认微信绑定</h1>
            <p className="text-sm text-slate-500 mt-1">请确认授权的微信账号无误。</p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">正在读取微信授权结果...</p>
        ) : (
          <>
            {session?.avatarUrl && (
              <img
                src={session.avatarUrl}
                alt="微信头像"
                className="w-16 h-16 rounded-full object-cover mb-3 border border-slate-200"
              />
            )}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mb-4">
              <p className="text-xs text-slate-500">微信昵称</p>
              <p className="text-base font-semibold text-slate-900 mt-1">{session?.displayName || '微信用户'}</p>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm px-3 py-2 mb-4">
                {error}
              </p>
            )}

            {session?.confirmed && (
              <p className="rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm px-3 py-2 mb-4">
                该微信绑定已经确认完成。
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={confirmBind}
                disabled={!canConfirm || saving}
                className="flex-1 rounded-lg bg-[#07c160] text-white text-sm font-semibold py-2.5 disabled:opacity-50"
              >
                {saving ? '确认中...' : '确认绑定'}
              </button>
              <button
                type="button"
                onClick={() => goBack()}
                className="flex-1 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold py-2.5"
              >
                返回
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
