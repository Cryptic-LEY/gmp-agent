'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type LoginRole = 'student' | 'teacher' | 'admin'

const ROLE_OPTIONS: Array<{ key: LoginRole; label: string }> = [
  { key: 'student', label: '学生' },
  { key: 'teacher', label: '教师' },
  { key: 'admin', label: '管理员' },
]

const REGISTER_ROLE_OPTIONS = ROLE_OPTIONS.filter(option => option.key !== 'admin')

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [selectedRole, setSelectedRole] = useState<LoginRole>('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [realName, setRealName] = useState('')
  const [school, setSchool] = useState('')
  const [major, setMajor] = useState('')
  const [className, setClassName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [phone, setPhone] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (mode === 'register' && password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    if (mode === 'register' && selectedRole === 'teacher' && !school.trim()) {
      setError('请填写学校/机构')
      return
    }

    setLoading(true)

    const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
    const body = mode === 'login'
      ? { email, password, role: selectedRole }
      : {
          email,
          password,
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
        }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const text = await res.text()
      let data: any = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        data = { error: text || '服务器返回了非 JSON 响应' }
      }

      if (!res.ok) {
        setError(data.error || `请求失败：${res.status}`)
        return
      }

      localStorage.setItem('token', data.token)
      localStorage.setItem('userId', data.userId)
      localStorage.setItem('displayName', data.displayName)
      localStorage.setItem('role', data.role)
      localStorage.setItem('onboarding_done', data.onboardingCompleted ? '1' : '')

      if (data.role === 'teacher') {
        router.push('/teacher')
        return
      }

      if (data.role === 'admin') {
        router.push('/admin')
        return
      }

      router.push(data.onboardingCompleted ? '/dashboard' : '/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-lg">
        <h1 className="text-2xl font-bold text-center text-blue-900 mb-2">
          GMP 助学平台
        </h1>
        <p className="text-center text-gray-500 text-sm mb-6">
          {mode === 'login' ? '登录你的账号' : '创建新账号'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入你的姓名"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入邮箱"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入密码"
                autoComplete="off"
              />
              {password && (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
                  style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer' }}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请再次输入密码"
                  autoComplete="off"
                />
                {confirmPassword && (
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
                    style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer' }}
                  >
                    {showConfirmPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {mode === 'login' ? '登录角色' : '注册身份'}
            </label>
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value as LoginRole)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(mode === 'login' ? ROLE_OPTIONS : REGISTER_ROLE_OPTIONS).map(option => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {mode === 'register' && selectedRole === 'teacher' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">真实姓名</label>
                <input
                  type="text"
                  value={realName}
                  onChange={e => setRealName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="默认使用姓名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">学校/机构</label>
                <input
                  type="text"
                  value={school}
                  onChange={e => setSchool(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入学校或机构"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">专业/部门</label>
                <input
                  type="text"
                  value={major}
                  onChange={e => setMajor(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="如药学系"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任教班级/岗位</label>
                <input
                  type="text"
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="如 2024 级 GMP 班"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">工号</label>
                <input
                  type="text"
                  value={studentId}
                  onChange={e => setStudentId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入工号"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入手机号"
                />
              </div>
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-medium py-2 rounded-lg text-sm transition disabled:opacity-50"
          >
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          {mode === 'login' ? '还没有账号？' : '已有账号？'}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setSelectedRole('student')
              setError('')
              setPassword('')
              setConfirmPassword('')
              setRealName('')
              setSchool('')
              setMajor('')
              setClassName('')
              setStudentId('')
              setPhone('')
            }}
            className="text-blue-600 hover:underline ml-1"
          >
            {mode === 'login' ? '立即注册' : '去登录'}
          </button>
        </p>
      </div>
    </div>
  )
}
