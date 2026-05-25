'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, HelpCircle, BookOpen, Flame, MessageSquare, Sparkles, Shield, Star } from 'lucide-react'

const PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  borderRadius: 12,
  border: '1px solid rgba(34,73,84,0.14)',
  boxShadow: '0 1px 4px rgba(31,71,92,0.06)',
}

interface FAQ { q: string; a: string }

const FAQ_SECTIONS = [
  {
    icon: BookOpen,
    title: '入门指南',
    color: '#1d6f78',
    faqs: [
      {
        q: '如何开始学习？',
        a: '注册并登录后，进入「主页」即可看到 GMP实施与管理 课程。点击「去学习」会弹出个性化导学向导，系统根据你的学历和专业背景生成诊断题，再给出专属学习路线。按照路线逐步完成各阶段任务即可。',
      },
      {
        q: '课程图谱有什么用？',
        a: '课程图谱将所有知识点和技能点以可视化网络呈现。知识图谱展示各知识点之间的依赖与关联；能力图谱展示实际操作技能的分布。拖动气泡可以自由探索，悬停可查看详情。',
      },
      {
        q: '如何切换语言？',
        a: '点击顶部导航栏右侧的「CN / EN」图标即可在中文和英文之间切换。当前版本 UI 已支持语言偏好存储，完整翻译将在后续版本更新。',
      },
      {
        q: '个性化学习是如何工作的？',
        a: '点击「去学习」→ 完成 5 道诊断题后，系统会结合你的学历背景和答题结果，将你分入「基础入门」「进阶应用」或「综合提升」三个层级，并生成对应的分步学习路线。路线中每个步骤都可点击直接跳转到对应功能模块。',
      },
    ],
  },
  {
    icon: Flame,
    title: '打卡与积分',
    color: '#f97316',
    faqs: [
      {
        q: '连续打卡的规则是什么？',
        a: '每天首次登录平台即算打卡成功，连续打卡天数会累计。当天 23:59 前未登录则连续中断，但历史最长连续记录会永久保存。打卡当天可获得基础 XP 奖励。',
      },
      {
        q: '积分（XP）是如何获得的？',
        a: 'XP 的主要来源：① 每日登录打卡 +10 XP；② 连续打卡奖励（第 3 天 +50 XP，第 7 天 +100 XP 等）；③ 完成每日练习题 +5~20 XP（根据题目难度）；④ AI 答疑互动 +2 XP（每次）。',
      },
      {
        q: '等级系统是怎样的？',
        a: '平台共设 10 个等级：GMP新人 → GMP见习员 → GMP初级员 → GMP中级员 → GMP高级员 → GMP专家 → GMP导师 → GMP大师 → GMP宗师 → GMP至尊。每个等级需要达到对应 XP 阈值，升级后解锁新的学习内容和功能。',
      },
      {
        q: '打卡中断后还能恢复吗？',
        a: '连续天数中断后需要重新从第 1 天开始计数。但系统会保留你的历史最长连续记录，并在「连续打卡」页面展示完整的打卡日历。',
      },
    ],
  },
  {
    icon: MessageSquare,
    title: 'AI 答疑',
    color: '#7c3aed',
    faqs: [
      {
        q: 'AI 答疑能回答哪些问题？',
        a: 'AI 助手专门针对 GMP 药品生产质量管理规范进行了训练，可以回答：GMP 条款解读、生产过程中的质量控制问题、OOS 调查流程、CAPA 制定方法、批放行判断标准、验证与确认要求等专业问题。',
      },
      {
        q: '如何提问才能得到最好的回答？',
        a: '建议提问时附上具体场景，例如「我们在片剂生产中遇到了环境监测超标，按照 GMP 第几条应该如何处理？」比模糊的「GMP 是什么」更能得到精准的回答。也可以上传相关文件让 AI 分析。',
      },
      {
        q: 'AI 的回答准确吗？',
        a: 'AI 回答基于 2010 版《药品生产质量管理规范》及相关附录，引用条款均有出处。但 AI 并非执法机构，关键决策请以官方法规文本为准，建议将 AI 答疑作为学习辅助而非唯一依据。',
      },
    ],
  },
  {
    icon: Sparkles,
    title: '个性化学习',
    color: '#0891b2',
    faqs: [
      {
        q: '诊断题可以重新做吗？',
        a: '可以。在主页点击「去学习」，完成向导的第一步（问卷）后即可重新生成诊断题。系统会根据你当前填写的学历和专业重新生成题目。',
      },
      {
        q: '学习路线可以自定义吗？',
        a: '系统生成的路线是推荐路径，并非强制顺序。你可以在任意时间通过侧边栏导航直接进入任意功能模块学习。路线中的「进入」按钮会跳转到对应的功能页面，方便你快速到达。',
      },
    ],
  },
  {
    icon: Shield,
    title: '账号与数据',
    color: '#16a34a',
    faqs: [
      {
        q: '学习数据会保存吗？',
        a: '所有学习记录（打卡、积分、练习成绩、知识点掌握度）均实时同步保存到服务器，登录后可在任意设备上查看。',
      },
      {
        q: '如何修改个人信息？',
        a: '点击右上角头像 → 个人中心 → 基本资料，可以修改昵称、手机号、邮箱等信息。修改密码在「修改密码」标签页操作。',
      },
      {
        q: '忘记密码怎么办？',
        a: '目前请联系平台管理员重置密码。后续版本将支持通过注册邮箱自助找回密码功能。',
      },
    ],
  },
]

const GAME_RULES = [
  { icon: '🎯', title: '每日练习规则', desc: '每天系统随机从题库中抽取 10 道题，涵盖不同章节和难度。答对 1 道 +5 XP，全部答对额外奖励 +20 XP。每日练习每天仅可完成一次。' },
  { icon: '🔥', title: '连续打卡奖励', desc: '连续 3 天 +50 XP、连续 7 天 +150 XP、连续 14 天 +300 XP、连续 30 天 +600 XP。断签后奖励重置，需要重新积累连续天数。' },
  { icon: '⭐', title: '知识点掌握度', desc: '每道练习题关联特定知识点，答题正确会提升该知识点的掌握度（0~100%）。掌握度影响课程图谱中节点的视觉权重，帮助识别薄弱环节。' },
  { icon: '🏆', title: '等级晋升', desc: '达到每个等级的 XP 阈值自动晋升，无需手动申请。晋升后解锁对应难度的练习题和高级 AI 问答权限。' },
  { icon: '🤝', title: '行为规范', desc: '本平台仅用于 GMP 学习，禁止用于商业目的或传播未经核实的监管信息。AI 答疑内容仅供学习参考，正式执行请以官方文件为准。' },
]

function FAQItem({ q, a }: FAQ) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid rgba(31,71,92,0.08)' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#183b4b', paddingRight: 16 }}>{q}</span>
        {open ? <ChevronDown size={16} color="#1d6f78" style={{ flexShrink: 0 }} /> : <ChevronRight size={16} color="#9ba8b0" style={{ flexShrink: 0 }} />}
      </button>
      {open && (
        <p style={{ fontSize: 14, color: '#46606f', lineHeight: 1.75, margin: '0 0 14px', paddingRight: 24 }}>{a}</p>
      )}
    </div>
  )
}

export default function HelpPage() {
  return (
    <div style={{ padding: '28px 32px 48px', maxWidth: 960, margin: '0 auto' }}>

      {/* Hero */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#1d6f78,#35818a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HelpCircle size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#183b4b' }}>帮助中心</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#6b8a98' }}>常见问题解答与平台使用规则</p>
          </div>
        </div>
      </div>

      {/* FAQ sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
        {FAQ_SECTIONS.map(({ icon: Icon, title, color, faqs }) => (
          <div key={title} style={{ ...PANEL, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color={color} />
              </div>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#183b4b' }}>{title}</span>
            </div>
            {faqs.map(faq => <FAQItem key={faq.q} {...faq} />)}
          </div>
        ))}
      </div>

      {/* Game rules */}
      <div style={{ ...PANEL, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f9731615', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Star size={16} color="#f97316" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#183b4b' }}>平台规则</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {GAME_RULES.map(r => (
            <div key={r.title} style={{ background: 'rgba(29,111,120,0.04)', borderRadius: 8, padding: '14px 16px', border: '1px solid rgba(29,111,120,0.1)' }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{r.icon}</div>
              <p style={{ fontWeight: 700, fontSize: 13, color: '#183b4b', margin: '0 0 6px' }}>{r.title}</p>
              <p style={{ fontSize: 13, color: '#46606f', lineHeight: 1.65, margin: 0 }}>{r.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: '#9ba8b0' }}>
        未找到你的问题？请联系平台管理员或在 AI 答疑中直接提问。
      </div>
    </div>
  )
}
