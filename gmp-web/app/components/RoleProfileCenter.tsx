'use client'

import Image from 'next/image'
import { useRef, useState, type ChangeEvent, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import {
  BookOpen,
  Building2,
  Calendar,
  Camera,
  Hash,
  IdCard,
  Mail,
  Monitor,
  Phone,
  Shield,
  Smartphone,
  User,
} from 'lucide-react'

export type ProfileRole = 'teacher' | 'admin'

export interface RoleProfileData {
  userId: string
  displayName: string
  email: string
  role: string
  orgId: string
  createdAt: string
  realName?: string | null
  school?: string | null
  major?: string | null
  className?: string | null
  studentId?: string | null
  idCard?: string | null
  phone?: string | null
  avatarUrl?: string | null
}

export interface RoleProfileForm {
  displayName: string
  email: string
  realName: string
  school: string
  major: string
  className: string
  studentId: string
  idCard: string
  phone: string
}

type ProfileTab = 'basic' | 'password' | 'apps' | 'devices'

interface RoleProfileCenterProps {
  profile: RoleProfileData | null
  displayName: string
  role: ProfileRole
  form: RoleProfileForm
  onFormChange: Dispatch<SetStateAction<RoleProfileForm>>
  saving: boolean
  onSave: () => void | Promise<void>
  onAvatarUpload: (avatarUrl: string) => Promise<void>
  onClose: () => void
}

const PANEL: CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  borderRadius: 12,
  border: '1px solid rgba(34,73,84,0.14)',
  boxShadow: '0 1px 4px rgba(31,71,92,0.06)',
}

const inputStyle: CSSProperties = {
  flex: 1,
  border: '1px solid #dde3e8',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  color: '#183b4b',
  minWidth: 0,
}

const ROLE_LABEL: Record<ProfileRole, string> = {
  teacher: '教师',
  admin: '管理员',
}

const tabs: { key: ProfileTab; label: string }[] = [
  { key: 'basic', label: '基本资料' },
  { key: 'password', label: '修改密码' },
  { key: 'apps', label: '第三方应用' },
  { key: 'devices', label: '在线设备' },
]

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

export default function RoleProfileCenter({
  profile,
  displayName,
  role,
  form,
  onFormChange,
  saving,
  onSave,
  onAvatarUpload,
  onClose,
}: RoleProfileCenterProps) {
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<ProfileTab>('basic')
  const [pwForm, setPwForm] = useState({ old: '', newPw: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [wechatBound, setWechatBound] = useState(false)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarMsg, setAvatarMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const fieldLabels = role === 'admin'
    ? { school: '学校/机构', major: '部门', className: '岗位', studentId: '工号/编号' }
    : { school: '学校/机构', major: '专业/部门', className: '任教班级/岗位', studentId: '工号' }

  const name = profile?.realName || profile?.displayName || displayName || '-'
  const roleLabel = ROLE_LABEL[role]
  const initial = name[0] || roleLabel[0] || '?'

  const infoRows = [
    { icon: User, label: '真实姓名', value: profile?.realName || profile?.displayName || '-' },
    { icon: Building2, label: fieldLabels.school, value: profile?.school || profile?.orgId || '-' },
    { icon: BookOpen, label: fieldLabels.major, value: profile?.major || '-' },
    { icon: Hash, label: fieldLabels.className, value: profile?.className || '-' },
    { icon: IdCard, label: fieldLabels.studentId, value: profile?.studentId || '-' },
    { icon: Phone, label: '手机号', value: profile?.phone || '-' },
    { icon: Mail, label: '邮箱', value: profile?.email || '-' },
    { icon: Shield, label: '角色', value: roleLabel },
    { icon: Calendar, label: '注册时间', value: profile?.createdAt?.slice(0, 10) || '-' },
  ]

  const fieldRow = (label: string, key: keyof RoleProfileForm, type = 'text', required = false) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
      <label style={{ width: 94, fontSize: 13, color: '#183b4b', flexShrink: 0 }}>
        {required && <span style={{ color: '#ef4444', marginRight: 3 }}>*</span>}
        {label}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={event => onFormChange(prev => ({ ...prev, [key]: event.target.value }))}
        style={inputStyle}
      />
    </div>
  )

  async function handlePasswordChange() {
    const token = localStorage.getItem('token')
    if (!token) return

    setPwMsg(null)
    if (!pwForm.old || !pwForm.newPw || !pwForm.confirm) {
      setPwMsg({ ok: false, text: '请填写所有密码字段' })
      return
    }
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMsg({ ok: false, text: '两次输入的新密码不一致' })
      return
    }
    if (pwForm.newPw.length < 6) {
      setPwMsg({ ok: false, text: '新密码至少6位' })
      return
    }

    setPwSaving(true)
    try {
      const response = await fetch('/api/user/password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: pwForm.old, newPassword: pwForm.newPw }),
      })
      const data = await response.json()

      if (response.ok) {
        setPwMsg({ ok: true, text: '密码已修改成功' })
        setPwForm({ old: '', newPw: '', confirm: '' })
      } else {
        setPwMsg({ ok: false, text: data.error ?? '修改失败' })
      }
    } finally {
      setPwSaving(false)
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
    setAvatarSaving(true)
    setAvatarMsg(null)
    try {
      const avatarUrl = await resizeAvatar(file)
      await onAvatarUpload(avatarUrl)
      setAvatarMsg({ ok: true, text: '头像已更新' })
    } catch (error) {
      setAvatarMsg({ ok: false, text: error instanceof Error ? error.message : '头像保存失败' })
    } finally {
      setAvatarSaving(false)
    }
  }

  return (
    <section style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 20, maxWidth: 1160, alignItems: 'start' }}>
      <div style={{ ...PANEL, padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <div style={{ position: 'relative', overflow: 'hidden', width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#215566,#35818a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {profile?.avatarUrl ? (
              <Image src={profile.avatarUrl} alt={`${name}的头像`} fill unoptimized style={{ objectFit: 'cover' }} />
            ) : (
              <span style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>{initial}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarSaving}
            aria-label="更换头像"
            style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, padding: 0, borderRadius: '50%', background: '#fff', border: '2px solid #e8eff2', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: avatarSaving ? 'wait' : 'pointer' }}
          >
            <Camera size={12} color="#6b8a98" />
          </button>
          <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleAvatarChange} />
        </div>

        <p style={{ fontWeight: 700, fontSize: 15, color: '#183b4b', margin: '0 0 2px' }}>{name}</p>
        <p style={{ fontSize: 12, color: '#9ba8b0', margin: '0 0 20px' }}>{roleLabel}</p>
        {avatarMsg && (
          <p style={{ width: '100%', margin: '0 0 14px', padding: '8px 10px', borderRadius: 6, color: avatarMsg.ok ? '#14765d' : '#c63f44', background: avatarMsg.ok ? '#e8f7f1' : '#fdeaea', fontSize: 11, lineHeight: 1.5 }}>
            {avatarMsg.text}
          </p>
        )}

        <div style={{ width: '100%', borderTop: '1px solid rgba(31,71,92,0.08)' }}>
          {infoRows.map(({ icon: Icon, label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(31,71,92,0.06)' }}>
              <Icon size={14} color="#6b8a98" strokeWidth={1.7} style={{ marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#6b8a98', width: 74, flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 12, color: '#183b4b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...PANEL, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(31,71,92,0.1)', flexWrap: 'wrap' }}>
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                padding: '14px 24px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: activeTab === key ? 700 : 400,
                color: activeTab === key ? '#1d6f78' : '#6b8a98',
                borderBottom: activeTab === key ? '2px solid #1d6f78' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto' }}>
          {activeTab === 'basic' && (
            <div style={{ maxWidth: 560 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: '#9ba8b0', margin: '0 0 16px', letterSpacing: 1 }}>账号信息</p>
              {fieldRow('用户昵称', 'displayName', 'text', true)}
              {fieldRow('邮箱', 'email', 'email', true)}

              <div style={{ height: 1, background: 'rgba(31,71,92,0.08)', margin: '8px 0 20px' }} />

              <p style={{ fontWeight: 700, fontSize: 13, color: '#9ba8b0', margin: '0 0 16px', letterSpacing: 1 }}>基础信息</p>
              {fieldRow('真实姓名', 'realName')}
              {fieldRow(fieldLabels.school, 'school')}
              {fieldRow(fieldLabels.major, 'major')}
              {fieldRow(fieldLabels.className, 'className')}
              {fieldRow(fieldLabels.studentId, 'studentId')}
              {fieldRow('身份证号', 'idCard')}
              {fieldRow('手机号', 'phone', 'tel')}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  onClick={onSave}
                  disabled={saving}
                  style={{ padding: '9px 28px', borderRadius: 6, background: '#1d6f78', color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  {saving ? '保存中...' : '保 存'}
                </button>
                <button
                  onClick={onClose}
                  style={{ padding: '9px 28px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}
                >
                  关 闭
                </button>
              </div>
            </div>
          )}

          {activeTab === 'password' && (
            <div style={{ maxWidth: 440 }}>
              {[
                { label: '旧密码', key: 'old' },
                { label: '新密码', key: 'newPw' },
                { label: '确认密码', key: 'confirm' },
              ].map(({ label, key }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
                  <label style={{ width: 84, fontSize: 13, color: '#183b4b', flexShrink: 0 }}>
                    <span style={{ color: '#ef4444', marginRight: 3 }}>*</span>
                    {label}
                  </label>
                  <input
                    type="password"
                    value={pwForm[key as keyof typeof pwForm]}
                    onChange={event => setPwForm(prev => ({ ...prev, [key]: event.target.value }))}
                    style={inputStyle}
                    placeholder={key === 'newPw' ? '至少6位' : ''}
                  />
                </div>
              ))}

              {pwMsg && (
                <p style={{ fontSize: 13, marginBottom: 14, color: pwMsg.ok ? '#16a34a' : '#ef4444' }}>
                  {pwMsg.ok ? '✓ ' : '✕ '}
                  {pwMsg.text}
                </p>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handlePasswordChange}
                  disabled={pwSaving}
                  style={{ padding: '9px 28px', borderRadius: 6, background: '#1d6f78', color: '#fff', border: 'none', cursor: pwSaving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  {pwSaving ? '提交中...' : '保 存'}
                </button>
                <button
                  onClick={() => { setPwForm({ old: '', newPw: '', confirm: '' }); setPwMsg(null) }}
                  style={{ padding: '9px 28px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}
                >
                  重 置
                </button>
              </div>
              <p style={{ fontSize: 12, color: '#9ba8b0', marginTop: 16 }}>修改密码后，当前登录 Token 仍然有效，下次登录请使用新密码。</p>
            </div>
          )}

          {activeTab === 'apps' && (
            <div style={{ maxWidth: 520 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderRadius: 10, border: `1px solid ${wechatBound ? 'rgba(29,111,120,0.2)' : '#dde3e8'}`, background: wechatBound ? 'rgba(29,111,120,0.04)' : '#fafafa', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#07c160,#09a651)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                      <path d="M8.7 10.3c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9zm4.4 0c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9zm4.6 5.7c.3 0 .6-.1.9-.1 2.4 0 4.4-1.7 4.4-3.8s-2-3.8-4.4-3.8c-.4 0-.8.1-1.2.2C16.9 5.8 14.1 4 10.8 4 7 4 4 6.6 4 9.8c0 1.9 1 3.6 2.6 4.7l-.5 1.6 1.9-1c.6.2 1.2.3 1.9.3.3 0 .7 0 1-.1.1.5.3 1 .6 1.4-.5.1-.9.2-1.5.2-.8 0-1.5-.1-2.2-.3l-2.8 1.4.7-2.3C3.9 14.4 2.5 12.3 2.5 10c0-4 3.5-7.2 7.8-7.2 3.9 0 7.1 2.5 7.7 5.8.2 0 .4-.1.6-.1 2.8 0 5.1 2 5.1 4.5s-2.3 4.5-5.1 4.5c-.5 0-.9-.1-1.3-.2l-2 1 .5-1.8c-.4-.2-.8-.5-1.1-.8.3.1.6.1.9.1.5 0 .9-.1 1.4-.2l-1.5.5z" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#183b4b' }}>微信</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: wechatBound ? '#1d6f78' : '#9ba8b0' }}>
                      {wechatBound ? '✓ 已绑定' : '未绑定，绑定后可使用微信扫码登录'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setWechatBound(value => !value)}
                  style={{ padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: wechatBound ? '1px solid #dde3e8' : 'none', background: wechatBound ? '#fff' : '#07c160', color: wechatBound ? '#6b8a98' : '#fff', cursor: 'pointer' }}
                >
                  {wechatBound ? '解绑' : '立即绑定'}
                </button>
              </div>

              <div style={{ padding: '14px 16px', borderRadius: 8, background: wechatBound ? 'rgba(7,193,96,0.06)' : '#f6f8fa', border: wechatBound ? '1px solid rgba(7,193,96,0.2)' : 'none', fontSize: 12, color: '#6b8a98', lineHeight: 1.8 }}>
                <strong style={{ color: wechatBound ? '#07c160' : '#183b4b', display: 'block', marginBottom: 6 }}>
                  {wechatBound ? '✓ 已绑定微信' : '绑定说明'}
                </strong>
                {wechatBound ? (
                  <p style={{ margin: 0 }}>你的账号已与微信绑定，可在登录页使用微信扫码登录。</p>
                ) : (
                  <>
                    <p style={{ margin: '0 0 4px' }}>1. 点击“立即绑定”，使用微信扫描二维码。</p>
                    <p style={{ margin: '0 0 4px' }}>2. 在微信中确认授权，即可完成绑定。</p>
                    <p style={{ margin: 0 }}>3. 当前为前端绑定状态展示，后续可接入真实 OAuth。</p>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'devices' && (
            <div style={{ display: 'grid', gap: 12, maxWidth: 620 }}>
              <div style={{ background: 'rgba(29,111,120,0.04)', borderRadius: 8, padding: '14px 18px', border: '1px solid rgba(29,111,120,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Monitor size={20} color="#1d6f78" />
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#183b4b' }}>当前设备 · Web 浏览器</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b8a98' }}>最近登录：{new Date().toLocaleString('zh-CN')}</p>
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>当前</span>
              </div>
              <div style={{ background: '#fafafa', borderRadius: 8, padding: '14px 18px', border: '1px solid #dde3e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Smartphone size={20} color="#6b8a98" />
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#183b4b' }}>移动端设备</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b8a98' }}>暂无其他在线设备</p>
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#eef2f4', color: '#6b8a98', fontWeight: 600 }}>离线</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
