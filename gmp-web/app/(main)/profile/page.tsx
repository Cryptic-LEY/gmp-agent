'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '@/lib/password-policy'
import {
  User, Phone, Mail, Building2, Shield, Calendar,
  Camera, GraduationCap, BookOpen, Hash, IdCard,
} from 'lucide-react'

type Tab = 'basic' | 'password' | 'apps' | 'devices'

const PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  borderRadius: 12,
  border: '1px solid rgba(34,73,84,0.14)',
  boxShadow: '0 1px 4px rgba(31,71,92,0.06)',
}

interface UserProfile {
  userId:      string
  displayName: string
  email:       string
  role:        string
  orgId:       string
  createdAt:   string
  // 学生信息
  realName:    string | null
  school:      string | null
  major:       string | null
  className:   string | null
  studentId:   string | null
  idCard:      string | null
  phone:       string | null
  avatarUrl:   string | null
}

interface BasicForm {
  displayName: string
  email:       string
  realName:    string
  school:      string
  major:       string
  className:   string
  studentId:   string
  idCard:      string
  phone:       string
}

function resizeAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
    const source = URL.createObjectURL(file)
    const picture = new window.Image()
    picture.onload = () => {
      const size = 256
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(source)
        reject(new Error('Canvas unavailable'))
        return
      }
      canvas.width = size
      canvas.height = size
      const sourceSize = Math.min(picture.width, picture.height)
      const sourceX = (picture.width - sourceSize) / 2
      const sourceY = (picture.height - sourceSize) / 2
      context.drawImage(picture, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size)
      URL.revokeObjectURL(source)
      resolve(canvas.toDataURL('image/webp', 0.84))
    }
    picture.onerror = () => {
      URL.revokeObjectURL(source)
      reject(new Error('Invalid image'))
    }
    picture.src = source
  })
}

export default function ProfilePage() {
  const router = useRouter()
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile]     = useState<UserProfile | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('basic')

  // 基本资料 form
  const [form, setForm]     = useState<BasicForm>({
    displayName: '', email: '', realName: '', school: '',
    major: '', className: '', studentId: '', idCard: '', phone: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarMsg, setAvatarMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 修改密码 form
  const [pwForm, setPwForm]   = useState({ old: '', newPw: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  // ── Fetch profile ────────────────────────────────────────────────────────

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }

    fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((data: UserProfile) => {
        setProfile(data)
        setForm({
          displayName: data.displayName ?? '',
          email:       data.email       ?? '',
          realName:    data.realName    ?? '',
          school:      data.school      ?? '',
          major:       data.major       ?? '',
          className:   data.className   ?? '',
          studentId:   data.studentId   ?? '',
          idCard:      data.idCard      ?? '',
          phone:       data.phone       ?? '',
        })
        if (data.avatarUrl) localStorage.setItem('avatarUrl', data.avatarUrl)
      })
      .catch(() => {})
  }, [router])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('tab') === 'apps') {
      setActiveTab('apps')
    }
  }, [])

  // ── Save basic info ────────────────────────────────────────────────────

  async function handleSave() {
    const token = localStorage.getItem('token')
    if (!token) return
    setSaving(true)
    setSaveErr('')
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json()
        setSaveErr(d.error ?? '保存失败')
        return
      }
      localStorage.setItem('displayName', form.displayName)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      // 更新左侧面板
      setProfile(p => p ? { ...p, ...form } : p)
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      setAvatarMsg({ ok: false, text: '请选择 PNG、JPG 或 WEBP 图片' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarMsg({ ok: false, text: '图片文件不能超过 5MB' })
      return
    }
    const token = localStorage.getItem('token')
    if (!token) return
    setAvatarSaving(true)
    setAvatarMsg(null)
    try {
      const avatarUrl = await resizeAvatar(file)
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl }),
      })
      const data = await response.json()
      if (!response.ok) {
        setAvatarMsg({ ok: false, text: data.error ?? '头像保存失败' })
        return
      }
      localStorage.setItem('avatarUrl', avatarUrl)
      window.dispatchEvent(new Event('profile-avatar-updated'))
      setProfile(current => current ? { ...current, avatarUrl } : current)
      setAvatarMsg({ ok: true, text: '头像已更新，实训档案同步展示' })
    } catch {
      setAvatarMsg({ ok: false, text: '图片处理失败，请更换图片后重试' })
    } finally {
      setAvatarSaving(false)
    }
  }

  // ── Change password ────────────────────────────────────────────────────

  async function handlePasswordChange() {
    const token = localStorage.getItem('token')
    if (!token) return
    setPwMsg(null)
    if (!pwForm.old || !pwForm.newPw || !pwForm.confirm) {
      setPwMsg({ ok: false, text: '请填写所有密码字段' }); return
    }
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMsg({ ok: false, text: '两次输入的新密码不一致' }); return
    }
    if (!isStrongPassword(pwForm.newPw)) {
      setPwMsg({ ok: false, text: PASSWORD_POLICY_MESSAGE }); return
    }
    setPwSaving(true)
    try {
      const res = await fetch('/api/user/password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: pwForm.old, newPassword: pwForm.newPw }),
      })
      const d = await res.json()
      if (res.ok) {
        setPwMsg({ ok: true, text: '密码已修改成功' })
        setPwForm({ old: '', newPw: '', confirm: '' })
      } else {
        setPwMsg({ ok: false, text: d.error ?? '修改失败' })
      }
    } finally {
      setPwSaving(false)
    }
  }

  // ── Left panel info rows ───────────────────────────────────────────────

  const roleLabel: Record<string, string> = { student: '学生', teacher: '教师', admin: '管理员' }

  const infoRows = profile ? [
    { icon: User,          label: '真实姓名', value: profile.realName    || profile.displayName },
    { icon: GraduationCap, label: '学校',     value: profile.school      || '—' },
    { icon: BookOpen,      label: '专业',     value: profile.major       || '—' },
    { icon: Hash,          label: '班级/学号', value: [profile.className, profile.studentId].filter(Boolean).join(' / ') || '—' },
    { icon: Phone,         label: '手机号',   value: profile.phone       || '—' },
    { icon: Mail,          label: '邮箱',     value: profile.email },
    { icon: Shield,        label: '角色',     value: roleLabel[profile.role] || profile.role },
    { icon: Building2,     label: '所属机构', value: profile.orgId       || '—' },
    { icon: Calendar,      label: '注册时间', value: profile.createdAt.slice(0, 10) },
  ] : []

  // ── Tabs config ──────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: 'basic',    label: '基本资料'   },
    { key: 'password', label: '修改密码'   },
    { key: 'apps',     label: '第三方应用' },
    { key: 'devices',  label: '在线设备'   },
  ]

  const inputStyle: React.CSSProperties = {
    flex: 1, border: '1px solid #dde3e8', borderRadius: 6,
    padding: '8px 12px', fontSize: 13, outline: 'none', color: '#183b4b',
  }

  const fieldRow = (label: string, key: keyof BasicForm, type = 'text', required = false) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
      <label style={{ width: 90, fontSize: 13, color: '#183b4b', flexShrink: 0 }}>
        {required && <span style={{ color: '#ef4444', marginRight: 3 }}>*</span>}{label}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        style={inputStyle}
      />
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 32px 48px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, maxWidth: 1100 }}>

        {/* ── Left: user info panel ── */}
        <div style={{ ...PANEL, padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Avatar */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <div style={{ position: 'relative', overflow: 'hidden', width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#215566,#35818a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {profile?.avatarUrl ? (
                <Image src={profile.avatarUrl} alt="个人头像" fill unoptimized style={{ objectFit: 'cover' }} />
              ) : (
                <span style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>
                  {(profile?.realName || profile?.displayName)?.[0] ?? '?'}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarSaving}
              title="更换头像"
              style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: '#fff', border: '2px solid #e8eff2', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: avatarSaving ? 'wait' : 'pointer', padding: 0 }}
            >
              <Camera size={12} color="#6b8a98" />
            </button>
            <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleAvatarChange} />
          </div>

          <p style={{ fontWeight: 700, fontSize: 15, color: '#183b4b', margin: '0 0 2px' }}>
            {profile?.realName || profile?.displayName || '—'}
          </p>
          <p style={{ fontSize: 12, color: '#9ba8b0', margin: '0 0 20px' }}>
            {roleLabel[profile?.role ?? ''] ?? profile?.role ?? ''}
          </p>
          {avatarMsg && (
            <p style={{ width: '100%', margin: '0 0 14px', padding: '8px 10px', borderRadius: 6, color: avatarMsg.ok ? '#14765d' : '#c63f44', background: avatarMsg.ok ? '#e8f7f1' : '#fdeaea', fontSize: 11, lineHeight: 1.5 }}>
              {avatarMsg.text}
            </p>
          )}

          {/* Info rows */}
          <div style={{ width: '100%', borderTop: '1px solid rgba(31,71,92,0.08)' }}>
            {infoRows.map(({ icon: Icon, label, value }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(31,71,92,0.06)' }}>
                <Icon size={14} color="#6b8a98" strokeWidth={1.7} style={{ marginTop: 1, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#6b8a98', width: 68, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 12, color: '#183b4b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: tabbed panel ── */}
        <div style={{ ...PANEL, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(31,71,92,0.1)' }}>
            {tabs.map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)} style={{
                padding: '14px 22px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: activeTab === key ? 700 : 400,
                color: activeTab === key ? '#1d6f78' : '#6b8a98',
                borderBottom: activeTab === key ? '2px solid #1d6f78' : '2px solid transparent',
                marginBottom: -1,
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto' }}>

            {/* ── 基本资料 ── */}
            {activeTab === 'basic' && (
              <div style={{ maxWidth: 520 }}>
                {/* 账号信息 */}
                <p style={{ fontWeight: 700, fontSize: 13, color: '#9ba8b0', margin: '0 0 16px', letterSpacing: 1 }}>账号信息</p>
                {fieldRow('账号', 'displayName', 'text', true)}
                {fieldRow('邮箱', 'email', 'email', true)}

                <div style={{ height: 1, background: 'rgba(31,71,92,0.08)', margin: '8px 0 20px' }} />

                {/* 学籍信息 */}
                <p style={{ fontWeight: 700, fontSize: 13, color: '#9ba8b0', margin: '0 0 16px', letterSpacing: 1 }}>学籍信息</p>
                {fieldRow('真实姓名', 'realName')}
                {fieldRow('学校', 'school')}
                {fieldRow('专业', 'major')}
                {fieldRow('班级', 'className')}
                {fieldRow('学号', 'studentId')}
                {fieldRow('身份证号', 'idCard')}
                {fieldRow('手机号', 'phone', 'tel')}

                {saveErr && (
                  <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, marginTop: -4 }}>{saveErr}</p>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button onClick={handleSave} disabled={saving} style={{
                    padding: '9px 28px', borderRadius: 6, background: '#1d6f78', color: '#fff',
                    border: 'none', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600,
                  }}>
                    {saved ? '✓ 已保存' : saving ? '保存中…' : '保 存'}
                  </button>
                  <button onClick={() => router.push('/dashboard')} style={{
                    padding: '9px 28px', borderRadius: 6, background: '#ef4444', color: '#fff',
                    border: 'none', cursor: 'pointer', fontSize: 13,
                  }}>
                    关 闭
                  </button>
                </div>
              </div>
            )}

            {/* ── 修改密码 ── */}
            {activeTab === 'password' && (
              <div style={{ maxWidth: 420 }}>
                {[
                  { label: '旧密码',   key: 'old'    },
                  { label: '新密码',   key: 'newPw'  },
                  { label: '确认密码', key: 'confirm' },
                ].map(({ label, key }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
                    <label style={{ width: 80, fontSize: 13, color: '#183b4b', flexShrink: 0 }}>
                      <span style={{ color: '#ef4444', marginRight: 3 }}>*</span>{label}
                    </label>
                    <input
                      type="password"
                      value={pwForm[key as keyof typeof pwForm]}
                      onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                      style={inputStyle}
                      placeholder={key === 'newPw' ? '至少8位，含大小写字母、数字和特殊字符' : ''}
                    />
                  </div>
                ))}

                {pwMsg && (
                  <p style={{ fontSize: 13, marginBottom: 14, color: pwMsg.ok ? '#16a34a' : '#ef4444' }}>
                    {pwMsg.ok ? '✓ ' : '✕ '}{pwMsg.text}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handlePasswordChange} disabled={pwSaving} style={{
                    padding: '9px 28px', borderRadius: 6, background: '#1d6f78', color: '#fff',
                    border: 'none', cursor: pwSaving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600,
                  }}>
                    {pwSaving ? '提交中…' : '保 存'}
                  </button>
                  <button onClick={() => { setPwForm({ old: '', newPw: '', confirm: '' }); setPwMsg(null) }} style={{
                    padding: '9px 28px', borderRadius: 6, background: '#ef4444', color: '#fff',
                    border: 'none', cursor: 'pointer', fontSize: 13,
                  }}>
                    重 置
                  </button>
                </div>
              </div>
            )}

            {/* ── 第三方应用 ── */}
            {activeTab === 'apps' && (
              <WechatBindPanel />
            )}

            {/* ── 在线设备 ── */}
            {activeTab === 'devices' && (
              <div>
                <div style={{ background: 'rgba(29,111,120,0.04)', borderRadius: 8, padding: '14px 18px', border: '1px solid rgba(29,111,120,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#183b4b' }}>当前设备 · Web 浏览器</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b8a98' }}>最近登录：{new Date().toLocaleString('zh-CN')}</p>
                  </div>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>当前</span>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

// ── 微信绑定面板 ─────────────────────────────────────────────────────────────

function WechatBindPanel() {
  const [bound, setBound] = useState(false)
  const [loading, setLoading] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    loadBindings()

    const params = new URLSearchParams(window.location.search)
    const status = params.get('wechat')
    if (status) {
      const text = params.get('message')
        || (status === 'bound'
          ? '微信绑定成功'
          : status === 'cancelled'
            ? '已取消微信绑定'
            : '微信绑定失败，请重新操作')
      setMessage({ ok: status === 'bound', text })
      const url = new URL(window.location.href)
      url.searchParams.delete('wechat')
      url.searchParams.delete('message')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [])

  async function loadBindings() {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const response = await fetch('/api/user/third-party-bindings', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      const wechat = data.providers?.find((item: { provider: string }) => item.provider === 'wechat')
      setBound(Boolean(wechat?.bound))
      setDisplayName(wechat?.displayName ?? null)
      setAvatarUrl(wechat?.avatarUrl ?? null)
    } catch {
      setMessage({ ok: false, text: '微信绑定状态读取失败' })
    }
  }

  async function handleBind() {
    if (bound) return
    const token = localStorage.getItem('token')
    if (!token) {
      setMessage({ ok: false, text: '请先登录后再绑定微信' })
      return
    }

    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch('/api/user/third-party-bindings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'wechat', action: 'start', returnTo: '/profile?tab=apps' }),
      })
      const data = await response.json()
      if (!response.ok) {
        setMessage({ ok: false, text: data.error || '微信绑定发起失败' })
        return
      }

      setMessage({ ok: true, text: '正在打开微信扫码授权页...' })
      window.location.href = data.authUrl
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : '微信绑定发起失败' })
    } finally {
      setLoading(false)
    }
  }

  async function handleUnbind() {
    if (!bound) return
    const token = localStorage.getItem('token')
    if (token) {
      setLoading(true)
      try {
        const response = await fetch('/api/user/third-party-bindings', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'wechat', action: 'unbind' }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          setMessage({ ok: false, text: data.error || '微信解绑失败' })
          return
        }
        setMessage({ ok: true, text: '已解绑微信账号' })
        setDisplayName(null)
        setAvatarUrl(null)
      } finally {
        setLoading(false)
      }
    }
    setBound(false)
  }

  return (
    <div style={{ maxWidth: 500 }}>
      {/* 微信卡片 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px', borderRadius: 10,
        border: `1px solid ${bound ? 'rgba(29,111,120,0.2)' : '#dde3e8'}`,
        background: bound ? 'rgba(29,111,120,0.04)' : '#fafafa',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'linear-gradient(135deg,#07c160,#09a651)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, overflow: 'hidden',
          }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="微信头像" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M8.7 10.3c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9zm4.4 0c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9zm4.6 5.7c.3 0 .6-.1.9-.1 2.4 0 4.4-1.7 4.4-3.8s-2-3.8-4.4-3.8c-.4 0-.8.1-1.2.2C16.9 5.8 14.1 4 10.8 4 7 4 4 6.6 4 9.8c0 1.9 1 3.6 2.6 4.7l-.5 1.6 1.9-1c.6.2 1.2.3 1.9.3.3 0 .7 0 1-.1.1.5.3 1 .6 1.4-.5.1-.9.2-1.5.2-.8 0-1.5-.1-2.2-.3l-2.8 1.4.7-2.3C3.9 14.4 2.5 12.3 2.5 10c0-4 3.5-7.2 7.8-7.2 3.9 0 7.1 2.5 7.7 5.8.2 0 .4-.1.6-.1 2.8 0 5.1 2 5.1 4.5s-2.3 4.5-5.1 4.5c-.5 0-.9-.1-1.3-.2l-2 1 .5-1.8c-.4-.2-.8-.5-1.1-.8.3.1.6.1.9.1.5 0 .9-.1 1.4-.2l-1.5.5z"/>
              </svg>
            )}
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#183b4b' }}>微信</p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: bound ? '#1d6f78' : '#9ba8b0' }}>
              {bound ? `✓ 已绑定${displayName ? `：${displayName}` : ''}` : '未绑定，绑定后可使用微信扫码登录'}
            </p>
          </div>
        </div>
        <button
          onClick={bound ? handleUnbind : handleBind}
          disabled={loading}
          style={{
            padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
            border: bound ? '1px solid #dde3e8' : 'none',
            background: bound ? '#fff' : '#07c160',
            color: bound ? '#6b8a98' : '#fff',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? '处理中...' : bound ? '解绑' : '立即绑定'}
        </button>
      </div>

      {message && (
        <div style={{
          padding: '10px 12px',
          borderRadius: 8,
          background: message.ok ? 'rgba(7,193,96,0.08)' : '#fef2f2',
          border: `1px solid ${message.ok ? 'rgba(7,193,96,0.2)' : '#fecaca'}`,
          color: message.ok ? '#087f43' : '#dc2626',
          fontSize: 12,
          marginBottom: 16,
        }}>
          {message.text}
        </div>
      )}

      {/* 说明 */}
      {!bound && (
        <div style={{ padding: '14px 16px', borderRadius: 8, background: '#f6f8fa', fontSize: 12, color: '#6b8a98', lineHeight: 1.8 }}>
          <strong style={{ color: '#183b4b', display: 'block', marginBottom: 6 }}>绑定说明</strong>
          <p style={{ margin: '0 0 4px' }}>1. 点击「立即绑定」，前往微信开放平台扫码授权</p>
          <p style={{ margin: '0 0 4px' }}>2. 授权后回到平台确认绑定的微信账号</p>
          <p style={{ margin: 0 }}>3. 绑定完成后可在登录页使用微信扫码登录</p>
        </div>
      )}

      {bound && (
        <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(7,193,96,0.06)', border: '1px solid rgba(7,193,96,0.2)', fontSize: 12, color: '#6b8a98' }}>
          <strong style={{ color: '#07c160' }}>✓ 已绑定微信</strong>
          <p style={{ margin: '6px 0 0' }}>你的账号已与微信绑定，可在登录页点击「微信登录」使用扫码登录。</p>
        </div>
      )}
    </div>
  )
}
