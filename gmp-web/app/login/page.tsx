'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { isStrongPassword, PASSWORD_POLICY_MESSAGE, PASSWORD_REQUIREMENTS } from '@/lib/password-policy'

type LoginRole = 'student' | 'teacher' | 'admin'
type PageMode = 'login' | 'register' | 'reset'
type LoginProfile = {
  userId: string
  displayName: string
  role: LoginRole
  avatarUrl?: string | null
}
type ApiResponse<T extends object = Record<string, unknown>> = T & { error?: string }
type PublicCodeResult = {
  devCode?: string
}
type LoginResult = {
  requiresCode?: boolean
  token?: string
  userId?: string
  displayName?: string
  role?: LoginRole
  onboardingCompleted?: boolean
  email?: string
  delivered?: boolean
  devCode?: string
  deliveryError?: string
}
type WechatStartResult = {
  authUrl?: string
}

const ROLE_OPTIONS: Array<{ key: LoginRole; label: string }> = [
  { key: 'student', label: '学生' },
  { key: 'teacher', label: '教师' },
  { key: 'admin', label: '管理员' },
]

const REGISTER_ROLE_OPTIONS = ROLE_OPTIONS.filter(option => option.key !== 'admin')
const PENDING_STUDENT_REGISTRATION_KEY = 'pending_student_registration'
const AUTH_STORAGE_KEYS = ['token', 'userId', 'displayName', 'role', 'onboarding_done', 'avatarUrl'] as const

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function clearStoredAuthSession() {
  AUTH_STORAGE_KEYS.forEach(key => localStorage.removeItem(key))
  sessionStorage.removeItem(PENDING_STUDENT_REGISTRATION_KEY)
}

function getLandingPath(role: string | null, onboardingCompleted: boolean) {
  if (role === 'teacher') return '/teacher'
  if (role === 'admin') return '/admin'
  return onboardingCompleted ? '/dashboard' : '/onboarding'
}

function extractNextErrorMessage(html: string) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!match) return ''

  try {
    const payload = JSON.parse(match[1]) as { err?: { message?: string } }
    return payload.err?.message || ''
  } catch {
    return ''
  }
}

async function readApiResponse<T extends object = Record<string, unknown>>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return await response.json().catch(() => ({})) as ApiResponse<T>
  }

  const text = await response.text().catch(() => '')
  const serverMessage = extractNextErrorMessage(text)
  const fallback = response.ok ? '服务器返回了非 JSON 响应' : `服务器返回异常响应（HTTP ${response.status}）`
  return { error: serverMessage || fallback } as ApiResponse<T>
}

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<PageMode>('login')
  const [loginStep, setLoginStep] = useState<'password' | 'code'>('password')
  const [selectedRole, setSelectedRole] = useState<LoginRole>('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [realName, setRealName] = useState('')
  const [school, setSchool] = useState('')
  const [major, setMajor] = useState('')
  const [className, setClassName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [wechatLoading, setWechatLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function restoreActiveLogin() {
      const token = localStorage.getItem('token')
      if (!token) return

      try {
        const response = await fetch('/api/user/profile', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('Invalid token')

        const profile = await response.json() as LoginProfile
        if (cancelled) return

        localStorage.setItem('userId', profile.userId)
        localStorage.setItem('displayName', profile.displayName)
        localStorage.setItem('role', profile.role)
        if (profile.avatarUrl) localStorage.setItem('avatarUrl', profile.avatarUrl)
        else localStorage.removeItem('avatarUrl')

        router.replace(getLandingPath(profile.role, Boolean(localStorage.getItem('onboarding_done'))))
      } catch {
        if (!cancelled) clearStoredAuthSession()
      }
    }

    void restoreActiveLogin()
    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => {
      setCooldown(value => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wechatStatus = params.get('wechat')
    if (!wechatStatus) return

    const message = params.get('message')
    const fallback: Record<string, string> = {
      cancelled: '已取消微信授权，请重新扫码',
      expired: '微信登录二维码已失效，请重新扫码',
      failed: '微信登录失败，请重新扫码',
      not_bound: '该微信尚未绑定平台账号，请先用账号密码登录后到个人中心绑定',
      role_mismatch: '所选登录角色与该微信绑定账号的角色不一致',
    }

    setMode('login')
    setLoginStep('password')
    setError(message || fallback[wechatStatus] || '微信登录失败，请重新扫码')

    const url = new URL(window.location.href)
    url.searchParams.delete('wechat')
    url.searchParams.delete('message')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  function resetMessages() {
    setError('')
    setNotice('')
  }

  function switchMode(nextMode: PageMode) {
    setMode(nextMode)
    setLoginStep('password')
    setSelectedRole('student')
    setError('')
    setNotice('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
    setCode('')
    setCooldown(0)
    setDisplayName('')
    setRealName('')
    setSchool('')
    setMajor('')
    setClassName('')
    setStudentId('')
    setPhone('')
  }

  async function requestPublicCode() {
    resetMessages()

    if (!isEmail(email)) {
      setError('请输入有效邮箱')
      return
    }
    if (mode === 'register' && !displayName.trim()) {
      setError('请先填写账号')
      return
    }

    setSendingCode(true)
    try {
      const res = await fetch('/api/auth/email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          purpose: mode === 'reset' ? 'reset-password' : 'register',
          role: selectedRole,
        }),
      })
      const data = await readApiResponse<PublicCodeResult>(res)
      if (!res.ok) {
        setError(data.error || '验证码发送失败')
        return
      }
      setCooldown(60)
      setNotice(data.devCode ? `开发环境验证码：${data.devCode}` : '验证码已发送，请查看邮箱')
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码发送失败')
    } finally {
      setSendingCode(false)
    }
  }

  async function startLoginVerification() {
    resetMessages()
    const identifier = email.trim()
    if (!identifier) {
      setError('请输入邮箱或账号')
      return false
    }
    if (!password) {
      setError('请填写密码')
      return false
    }

    setSendingCode(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, password, role: selectedRole, step: 'password' }),
      })
      const data = await readApiResponse<LoginResult>(res)
      if (!res.ok) {
        setError(data.error || `请求失败：${res.status}`)
        return false
      }
      if (data.token) {
        finishLogin(data)
        return true
      }
      setEmail(data.email || identifier)
      setCode('')
      setLoginStep('code')
      setCooldown(60)
      if (data.devCode) {
        setNotice(`开发环境验证码：${data.devCode}`)
      } else if (data.deliveryError) {
        setNotice(`验证码已生成，但邮件发送失败：${data.deliveryError}`)
      } else if (data.delivered === false) {
        setNotice('验证码已生成，请查看服务端控制台输出')
      } else {
        setNotice('验证码已发送，请查看邮箱')
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码发送失败')
      return false
    } finally {
      setSendingCode(false)
    }
  }

  async function startWechatLogin() {
    resetMessages()
    setWechatLoading(true)
    try {
      const res = await fetch('/api/auth/wechat/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'wechat', role: selectedRole }),
      })
      const data = await readApiResponse<WechatStartResult>(res)
      if (!res.ok) {
        setError(data.error || '微信登录发起失败')
        return
      }
      if (!data.authUrl) {
        setError('微信登录发起失败')
        return
      }
      setNotice('正在打开微信扫码登录...')
      window.location.href = data.authUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : '微信登录发起失败')
    } finally {
      setWechatLoading(false)
    }
  }

  function finishLogin(data: any) {
    clearStoredAuthSession()
    localStorage.setItem('token', data.token)
    localStorage.setItem('userId', data.userId)
    localStorage.setItem('displayName', data.displayName)
    localStorage.setItem('role', data.role)
    localStorage.setItem('onboarding_done', data.onboardingCompleted ? '1' : '')

    router.push(getLandingPath(data.role, Boolean(data.onboardingCompleted)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    resetMessages()
    setLoading(true)

    try {
      if (mode === 'login') {
        if (loginStep === 'password') {
          await startLoginVerification()
          return
        }

        if (!code.trim()) {
          setError('请填写验证码')
          return
        }

        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password, code, role: selectedRole, step: 'verify-code' }),
        })
        const data = await readApiResponse<LoginResult>(res)
        if (!res.ok) {
          setError(data.error || `请求失败：${res.status}`)
          return
        }
        finishLogin(data)
        return
      }

      if (!isEmail(email)) {
        setError('请输入有效邮箱')
        return
      }
      if (!password) {
        setError(mode === 'reset' ? '请填写新密码' : '请填写密码')
        return
      }
      if (!isStrongPassword(password)) {
        setError(PASSWORD_POLICY_MESSAGE)
        return
      }
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致')
        return
      }
      if (!code.trim()) {
        setError('请填写验证码')
        return
      }

      if (mode === 'reset') {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code, newPassword: password }),
        })
        const data = await readApiResponse(res)
        if (!res.ok) {
          setError(data.error || '密码重置失败')
          return
        }
        setNotice('密码已重置，请使用新密码登录')
        setPassword('')
        setConfirmPassword('')
        setCode('')
        setLoginStep('password')
        setMode('login')
        return
      }

      if (!displayName.trim()) {
        setError('请填写账号')
        return
      }
      if (selectedRole === 'teacher' && !school.trim()) {
        setError('请填写学校/机构')
        return
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          code,
          displayName,
          role: selectedRole === 'teacher' ? 'teacher' : 'student',
          ...(selectedRole === 'teacher'
            ? {
                realName: realName || displayName,
                school,
                major,
                className,
                studentId,
                phone,
              }
            : {}),
        }),
      })

      const data = await readApiResponse<LoginResult>(res)
      if (!res.ok) {
        setError(data.error || `请求失败：${res.status}`)
        return
      }
      finishLogin(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }

  const isLoginVerificationStep = mode === 'login' && loginStep === 'code'
  const title = isLoginVerificationStep ? '' : mode === 'login' ? '登录你的账号' : mode === 'register' ? '创建新账号' : '找回密码'
  const shouldCheckPasswordPolicy = mode === 'register' || mode === 'reset'
  const passwordPolicyInvalid = shouldCheckPasswordPolicy && password.length > 0 && !isStrongPassword(password)
  const passwordRequirementStatus = PASSWORD_REQUIREMENTS.map(requirement => ({
    ...requirement,
    passed: requirement.test(password),
  }))
  const confirmPasswordMismatch = shouldCheckPasswordPolicy && confirmPassword.length > 0 && password !== confirmPassword
  const confirmPasswordMatched = shouldCheckPasswordPolicy && confirmPassword.length > 0 && password === confirmPassword

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-lg">
        <h1 className="text-2xl font-bold text-center text-blue-900 mb-2">
          GMP 助学平台
        </h1>
        {title && <p className="text-center text-gray-500 text-sm mb-6">{title}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">账号</label>
              <input
                type="text"
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入账号"
              />
            </div>
          )}

          {!isLoginVerificationStep && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {mode === 'login' ? '邮箱/账号' : '邮箱'}
              </label>
              <input
                type={mode === 'login' ? 'text' : 'email'}
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={mode === 'login' ? '请输入邮箱或账号' : '请输入邮箱'}
              />
            </div>
          )}

          {!isLoginVerificationStep && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {mode === 'reset' ? '新密码' : '密码'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    passwordPolicyInvalid ? 'border-red-400' : 'border-gray-300'
                  }`}
                  placeholder={mode === 'login' ? '请输入密码' : '至少 8 位，含大小写、数字和特殊字符'}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(value => !value)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  title={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {shouldCheckPasswordPolicy && password.length > 0 && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                  {passwordRequirementStatus.map(item => (
                    <span
                      key={item.key}
                      className={`inline-flex items-center gap-1.5 ${item.passed ? 'text-emerald-600' : 'text-gray-400'}`}
                    >
                      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                        item.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {item.passed ? '√' : '·'}
                      </span>
                      {item.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {(mode === 'register' || mode === 'reset') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    confirmPasswordMismatch ? 'border-red-400' : 'border-gray-300'
                  }`}
                  placeholder="请再次输入密码"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(value => !value)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 hover:text-gray-600"
                  aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                  title={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPasswordMismatch && (
                <p className="mt-1 text-xs text-red-500">两次输入的密码不一致</p>
              )}
              {confirmPasswordMatched && (
                <p className="mt-1 text-xs text-emerald-600">√ 两次密码一致</p>
              )}
            </div>
          )}

          {(mode === 'register' || mode === 'reset' || (mode === 'login' && loginStep === 'code')) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">验证码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入 6 位验证码"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <button
                  type="button"
                  onClick={mode === 'login' ? startLoginVerification : requestPublicCode}
                  disabled={sendingCode || cooldown > 0 || loading}
                  className="px-3 rounded-lg border border-blue-700 text-blue-700 text-sm font-medium hover:bg-blue-50 transition disabled:opacity-50"
                >
                  {sendingCode ? '发送中' : cooldown > 0 ? `${cooldown}s` : '接收验证码'}
                </button>
              </div>
            </div>
          )}

          {mode !== 'reset' && !isLoginVerificationStep && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {mode === 'login' ? '登录角色' : '注册身份'}
              </label>
              <select
                value={selectedRole}
                onChange={event => setSelectedRole(event.target.value as LoginRole)}
                disabled={mode === 'login' && loginStep === 'code'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                {(mode === 'login' ? ROLE_OPTIONS : REGISTER_ROLE_OPTIONS).map(option => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'register' && selectedRole === 'teacher' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">真实姓名</label>
                <input type="text" value={realName} onChange={event => setRealName(event.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="默认使用账号" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">学校/机构</label>
                <input type="text" value={school} onChange={event => setSchool(event.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入学校或机构" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">专业/部门</label>
                <input type="text" value={major} onChange={event => setMajor(event.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="如药学系" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任教班级/岗位</label>
                <input type="text" value={className} onChange={event => setClassName(event.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="如 2024 级 GMP 班" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">工号</label>
                <input type="text" value={studentId} onChange={event => setStudentId(event.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入工号" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
                <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="请输入手机号" />
              </div>
            </div>
          )}

          {mode === 'login' && loginStep === 'password' && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => switchMode('reset')}
                className="text-blue-600 hover:underline text-sm"
              >
                忘记密码？
              </button>
            </div>
          )}

          {notice && <p className="text-green-600 text-sm">{notice}</p>}
          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-medium py-2 rounded-lg text-sm transition disabled:opacity-50"
          >
            {loading
              ? '处理中...'
              : mode === 'login'
                ? loginStep === 'password' ? '下一步' : '验证并登录'
                : mode === 'register' ? '注册' : '重置密码'}
          </button>

          {mode === 'login' && loginStep === 'password' && (
            <>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="h-px flex-1 bg-gray-200" />
                <span>或</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>
              <button
                type="button"
                onClick={startWechatLogin}
                disabled={wechatLoading || loading}
                className="w-full border border-[#07c160] text-[#087f43] hover:bg-[#f0fbf5] font-medium py-2 rounded-lg text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[#07c160] text-white text-xs font-bold">微</span>
                {wechatLoading ? '正在打开微信...' : '微信扫码登录'}
              </button>
            </>
          )}
        </form>

        {!isLoginVerificationStep && (
          <p className="text-center text-sm text-gray-500 mt-4">
            {mode === 'login' ? '还没有账号？' : mode === 'register' ? '已有账号？' : '想起密码了？'}
            <button
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              className="text-blue-600 hover:underline ml-1"
            >
              {mode === 'login' ? '立即注册' : '去登录'}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
