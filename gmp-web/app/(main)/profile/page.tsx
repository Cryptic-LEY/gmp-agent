'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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

export default function ProfilePage() {
  const router = useRouter()

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
      })
      .catch(() => {})
  }, [router])

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
    if (pwForm.newPw.length < 6) {
      setPwMsg({ ok: false, text: '新密码至少6位' }); return
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
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#215566,#35818a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>
                {(profile?.realName || profile?.displayName)?.[0] ?? '?'}
              </span>
            </div>
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: '#fff', border: '2px solid #e8eff2', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Camera size={12} color="#6b8a98" />
            </div>
          </div>

          <p style={{ fontWeight: 700, fontSize: 15, color: '#183b4b', margin: '0 0 2px' }}>
            {profile?.realName || profile?.displayName || '—'}
          </p>
          <p style={{ fontSize: 12, color: '#9ba8b0', margin: '0 0 20px' }}>
            {roleLabel[profile?.role ?? ''] ?? profile?.role ?? ''}
          </p>

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
                {fieldRow('用户昵称', 'displayName', 'text', true)}
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
                      placeholder={key === 'newPw' ? '至少6位' : ''}
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
                <p style={{ fontSize: 12, color: '#9ba8b0', marginTop: 16 }}>
                  修改密码后，当前登录 Token 仍然有效，下次登录请使用新密码。
                </p>
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
  const [bound, setBound]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [qrVisible, setQrVisible] = useState(false)
  const [countdown, setCountdown] = useState(0)

  function handleBind() {
    if (bound) return
    setQrVisible(true)
    setCountdown(60)
    setLoading(true)

    // 模拟倒计时 + 二维码过期
    let c = 60
    const timer = setInterval(() => {
      c--
      setCountdown(c)
      if (c <= 0) {
        clearInterval(timer)
        setLoading(false)
        setQrVisible(false)
      }
    }, 1000)

    // 模拟 5s 后扫码成功（演示用）
    setTimeout(() => {
      clearInterval(timer)
      setLoading(false)
      setQrVisible(false)
      setBound(true)
      setCountdown(0)
    }, 5000)
  }

  function handleUnbind() {
    if (!bound) return
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
          {/* 微信绿色图标 */}
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'linear-gradient(135deg,#07c160,#09a651)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M8.7 10.3c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9zm4.4 0c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9zm4.6 5.7c.3 0 .6-.1.9-.1 2.4 0 4.4-1.7 4.4-3.8s-2-3.8-4.4-3.8c-.4 0-.8.1-1.2.2C16.9 5.8 14.1 4 10.8 4 7 4 4 6.6 4 9.8c0 1.9 1 3.6 2.6 4.7l-.5 1.6 1.9-1c.6.2 1.2.3 1.9.3.3 0 .7 0 1-.1.1.5.3 1 .6 1.4-.5.1-.9.2-1.5.2-.8 0-1.5-.1-2.2-.3l-2.8 1.4.7-2.3C3.9 14.4 2.5 12.3 2.5 10c0-4 3.5-7.2 7.8-7.2 3.9 0 7.1 2.5 7.7 5.8.2 0 .4-.1.6-.1 2.8 0 5.1 2 5.1 4.5s-2.3 4.5-5.1 4.5c-.5 0-.9-.1-1.3-.2l-2 1 .5-1.8c-.4-.2-.8-.5-1.1-.8.3.1.6.1.9.1.5 0 .9-.1 1.4-.2l-1.5.5z"/>
            </svg>
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#183b4b' }}>微信</p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: bound ? '#1d6f78' : '#9ba8b0' }}>
              {bound ? '✓ 已绑定' : '未绑定 — 绑定后可使用微信扫码登录'}
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
          {loading ? '等待扫码…' : bound ? '解绑' : '立即绑定'}
        </button>
      </div>

      {/* 二维码弹层 */}
      {qrVisible && (
        <div style={{
          padding: '24px', borderRadius: 10, border: '1px solid #dde3e8',
          background: '#fff', textAlign: 'center', marginBottom: 20,
        }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#183b4b', margin: '0 0 16px' }}>
            微信扫码绑定账号
          </p>
          {/* 占位二维码 — 实际项目替换为真实微信 OAuth 二维码 */}
          <div style={{
            width: 160, height: 160, margin: '0 auto 14px',
            background: '#f0f4f5', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px dashed #c5d5da', flexDirection: 'column', gap: 8,
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="#c5d5da">
              <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 13h7v7H3v-7zm2 2v3h3v-3H5zm11 0h2v2h-2v-2zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm4-4h-2v2h2v-2zm-4 0h2v-2h-2v2z"/>
            </svg>
            <span style={{ fontSize: 11, color: '#9ba8b0' }}>微信扫码</span>
          </div>
          <p style={{ fontSize: 12, color: '#9ba8b0', margin: 0 }}>
            二维码有效期 <strong style={{ color: countdown < 10 ? '#ef4444' : '#183b4b' }}>{countdown}</strong> 秒
          </p>
          <p style={{ fontSize: 11, color: '#c5d5da', marginTop: 8 }}>
            （演示模式：5 秒后自动绑定成功）
          </p>
        </div>
      )}

      {/* 说明 */}
      {!bound && (
        <div style={{ padding: '14px 16px', borderRadius: 8, background: '#f6f8fa', fontSize: 12, color: '#6b8a98', lineHeight: 1.8 }}>
          <strong style={{ color: '#183b4b', display: 'block', marginBottom: 6 }}>绑定说明</strong>
          <p style={{ margin: '0 0 4px' }}>1. 点击「立即绑定」，使用微信扫描二维码</p>
          <p style={{ margin: '0 0 4px' }}>2. 在微信中确认授权，即可完成绑定</p>
          <p style={{ margin: 0 }}>3. 绑定后可在登录页使用微信扫码直接登录</p>
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
