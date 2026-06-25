'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const PENDING_STUDENT_REGISTRATION_KEY = 'pending_student_registration'

interface LoginResult {
  token: string
  userId: string
  displayName: string
  role: 'student' | 'teacher' | 'admin'
  onboardingCompleted: boolean
}

export default function WechatLoginCompletePage() {
  const router = useRouter()
  const consumedRef = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (consumedRef.current) return
    consumedRef.current = true

    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('sessionId') || ''

    async function completeLogin() {
      if (!sessionId) {
        setError('缺少微信登录会话，请重新扫码')
        return
      }

      try {
        const response = await fetch('/api/auth/wechat/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        const data = await response.json() as LoginResult & { error?: string }
        if (!response.ok) {
          setError(data.error || '微信登录失败')
          return
        }

        sessionStorage.removeItem(PENDING_STUDENT_REGISTRATION_KEY)
        localStorage.setItem('token', data.token)
        localStorage.setItem('userId', data.userId)
        localStorage.setItem('displayName', data.displayName)
        localStorage.setItem('role', data.role)
        localStorage.setItem('onboarding_done', data.onboardingCompleted ? '1' : '')

        if (data.role === 'teacher') {
          router.replace('/teacher')
          return
        }
        if (data.role === 'admin') {
          router.replace('/admin')
          return
        }
        router.replace(data.onboardingCompleted ? '/dashboard' : '/onboarding')
      } catch (err) {
        setError(err instanceof Error ? err.message : '微信登录失败')
      }
    }

    completeLogin()
  }, [router])

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <section className="w-full max-w-sm rounded-xl bg-white border border-slate-200 shadow-sm p-7 text-center">
        <div className="w-12 h-12 rounded-xl bg-[#07c160] text-white font-bold flex items-center justify-center mx-auto mb-4">
          微
        </div>
        <h1 className="text-lg font-bold text-slate-900">微信扫码登录</h1>
        {error ? (
          <>
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-4">
              {error}
            </p>
            <button
              type="button"
              onClick={() => router.replace('/login')}
              className="mt-5 w-full rounded-lg bg-blue-700 text-white text-sm font-semibold py-2.5"
            >
              返回登录
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-500 mt-3">正在完成登录，请稍候...</p>
        )}
      </section>
    </main>
  )
}
