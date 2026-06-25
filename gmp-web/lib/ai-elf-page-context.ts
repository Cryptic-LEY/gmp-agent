export type AiElfAudience = 'student' | 'teacher'

export interface AiElfQuickAction {
  label: string
  prompt: string
}

export interface AiElfPageContext {
  label: string
  intent: string
  scope: string
  greeting: string
  hint: string
  placeholder: string
  audience: AiElfAudience
  quickActions: AiElfQuickAction[]
}

const DEFAULT_STUDENT_ACTIONS: AiElfQuickAction[] = [
  { label: '本页怎么用', prompt: '请用三句话告诉我当前页面最适合怎么用。' },
  { label: '下一步建议', prompt: '结合当前页面，给我一个现在就能执行的学习建议。' },
  { label: 'GMP 解释', prompt: '请解释一个和当前页面相关的 GMP 核心概念，并举一个简短例子。' },
]

const DEFAULT_CONTEXT: AiElfPageContext = {
  label: 'GMP 助学平台',
  intent: '帮助学习者完成 GMP 课程学习、练习、复盘和实训任务。',
  scope: '如果缺少页面内的实时数据，不要编造数据，请给出查看或补充信息的方式。',
  greeting: '你好，我是 GMP 小精灵。你停在哪个页面，我就优先按这个页面的学习场景来回答。',
  hint: '我会根据当前页面回答',
  placeholder: '问我本页内容、下一步怎么学，或 GMP 概念解释',
  audience: 'student',
  quickActions: DEFAULT_STUDENT_ACTIONS,
}

const CONTEXTS: Record<string, AiElfPageContext> = {
  '/dashboard': {
    label: '主页',
    intent: '展示学习概览、任务入口、打卡状态和近期学习提醒。',
    scope: '优先围绕今日任务、学习节奏和平台入口提供建议。',
    greeting: '你现在在主页。我可以帮你快速判断今天先学什么、先练什么。',
    hint: '我可以帮你规划今日学习',
    placeholder: '例如：今天我应该先做什么？',
    audience: 'student',
    quickActions: [
      { label: '今日优先级', prompt: '请根据主页场景，帮我列一个今日学习优先级。' },
      { label: '学习节奏', prompt: '我想保持学习连续性，请给我一个轻量的今日学习节奏。' },
      { label: '入口说明', prompt: '请说明课程、练习、实训、报告这几个入口分别什么时候用。' },
    ],
  },
  '/course': {
    label: '课程学习',
    intent: '学习 GMP 章节、课件、视频、讨论和章节测验。',
    scope: '优先解释课程章节、学习顺序、课件复盘和章节测验准备方法。',
    greeting: '你现在在课程学习页。我可以帮你梳理章节重点、解释课件内容，或生成复习问题。',
    hint: '我可以讲本章重点',
    placeholder: '例如：这个章节应该抓哪些重点？',
    audience: 'student',
    quickActions: [
      { label: '章节重点', prompt: '请告诉我学习 GMP 课程章节时应该重点关注哪些内容。' },
      { label: '生成复习题', prompt: '请基于当前课程学习场景，生成 3 道适合复习的 GMP 问题。' },
      { label: '课后复盘', prompt: '请给我一个课程学习后的 5 分钟复盘方法。' },
    ],
  },
  '/practice': {
    label: '每日练习',
    intent: '完成 GMP 练习题，复盘错题，巩固薄弱知识点。',
    scope: '优先围绕做题策略、错因分析、知识点解释和复习建议回答。',
    greeting: '你现在在每日练习页。我可以帮你分析错因、解释题干，或给你做题策略。',
    hint: '我可以帮你复盘错题',
    placeholder: '例如：这类题总错怎么办？',
    audience: 'student',
    quickActions: [
      { label: '错题复盘', prompt: '请给我一个 GMP 练习错题复盘模板。' },
      { label: '做题策略', prompt: '请告诉我做 GMP 选择题时如何快速定位关键条件。' },
      { label: '薄弱巩固', prompt: '如果练习正确率不稳定，我应该怎么巩固？' },
    ],
  },
  '/streak': {
    label: '连续打卡',
    intent: '查看连续学习天数、打卡记录和激励状态。',
    scope: '优先围绕学习习惯、轻量任务和持续性建议回答。',
    greeting: '你现在在连续打卡页。我可以帮你把学习任务拆小，保持不断档。',
    hint: '我可以帮你保住学习节奏',
    placeholder: '例如：今天很忙，怎么保持打卡？',
    audience: 'student',
    quickActions: [
      { label: '轻量任务', prompt: '请给我一个 10 分钟内可以完成的 GMP 学习打卡任务。' },
      { label: '习惯建议', prompt: '请帮我设计一个更容易坚持的每日学习习惯。' },
      { label: '补救计划', prompt: '如果我最近学习断断续续，应该怎么恢复节奏？' },
    ],
  },
  '/progress': {
    label: '我的进度',
    intent: '查看知识掌握度、学习进展和薄弱项。',
    scope: '优先围绕薄弱项判断、复习顺序和掌握度提升回答。',
    greeting: '你现在在我的进度页。我可以帮你读懂薄弱项，并安排下一轮复习。',
    hint: '我可以帮你分析薄弱项',
    placeholder: '例如：薄弱知识点该怎么补？',
    audience: 'student',
    quickActions: [
      { label: '薄弱项策略', prompt: '请给我一个针对 GMP 薄弱知识点的复习策略。' },
      { label: '复习顺序', prompt: '如果多个知识点都没掌握，我应该按什么顺序复习？' },
      { label: '掌握标准', prompt: '怎样判断一个 GMP 知识点已经真正掌握？' },
    ],
  },
  '/plan': {
    label: '个性化学习',
    intent: '查看和执行个人学习计划。',
    scope: '优先围绕计划拆解、时间安排和学习目标回答。',
    greeting: '你现在在个性化学习页。我可以帮你把计划拆成更容易执行的小步骤。',
    hint: '我可以帮你调整学习计划',
    placeholder: '例如：这周计划怎么安排更合理？',
    audience: 'student',
    quickActions: [
      { label: '拆解计划', prompt: '请把 GMP 学习计划拆成今天、明天、本周三个层级。' },
      { label: '时间安排', prompt: '如果我每天只有 30 分钟，GMP 学习计划应该怎么排？' },
      { label: '目标校准', prompt: '请帮我判断学习计划里的目标是否太宽泛，并给出调整建议。' },
    ],
  },
  '/chat': {
    label: 'AI 助学',
    intent: '进行完整的 GMP 问答和连续对话。',
    scope: '优先帮助用户组织问题、追问和整理 AI 回答。',
    greeting: '你已经在完整 AI 助学页。我可以帮你把问题问得更准，或整理刚才的回答。',
    hint: '我可以帮你优化提问',
    placeholder: '例如：帮我把这个问题问得更专业',
    audience: 'student',
    quickActions: [
      { label: '优化提问', prompt: '请帮我把一个 GMP 学习问题改写得更具体、更容易得到有效回答。' },
      { label: '追问方向', prompt: '当 AI 回答太笼统时，我应该从哪些角度追问？' },
      { label: '整理答案', prompt: '请给我一个整理 AI 回答为学习笔记的格式。' },
    ],
  },
  '/simulation': {
    label: '实训仿真',
    intent: '在情景任务中完成 GMP 判断、证据分析和角色决策。',
    scope: '优先给提示和思路，不直接替用户完成关键判断；强调证据、法规和风险链条。',
    greeting: '你现在在实训仿真页。我可以给你提示，但会尽量保留关键判断给你自己完成。',
    hint: '我可以给实训提示',
    placeholder: '例如：这个场景应该先看什么证据？',
    audience: 'student',
    quickActions: [
      { label: '场景提示', prompt: '实训场景里遇到 GMP 风险判断时，我应该先看哪些证据？' },
      { label: '判断框架', prompt: '请给我一个 GMP 实训场景的风险判断框架。' },
      { label: '复盘方法', prompt: '完成实训后，我应该怎样复盘自己的判断过程？' },
    ],
  },
  '/report': {
    label: '成绩报告',
    intent: '查看成绩、练习表现和学习反馈。',
    scope: '优先围绕成绩解读、提升建议和复盘行动回答。',
    greeting: '你现在在成绩报告页。我可以帮你把分数转成下一步改进动作。',
    hint: '我可以解读成绩报告',
    placeholder: '例如：报告看完以后我该怎么提升？',
    audience: 'student',
    quickActions: [
      { label: '报告解读', prompt: '请告诉我看 GMP 成绩报告时最应该关注哪几个指标。' },
      { label: '提升动作', prompt: '如果成绩不理想，请给我 3 个具体提升动作。' },
      { label: '复盘模板', prompt: '请给我一个成绩报告复盘模板。' },
    ],
  },
  '/profile': {
    label: '个人中心',
    intent: '查看和维护个人资料、学习身份和头像信息。',
    scope: '优先围绕资料完善、学习身份和平台设置回答。',
    greeting: '你现在在个人中心。我可以帮你确认资料是否影响学习计划和推荐。',
    hint: '我可以帮你检查学习资料',
    placeholder: '例如：个人资料会影响哪些学习推荐？',
    audience: 'student',
    quickActions: [
      { label: '资料影响', prompt: '个人资料里的学历、专业会怎样影响 GMP 学习推荐？' },
      { label: '完善建议', prompt: '请告诉我个人中心哪些信息最值得完善。' },
      { label: '学习身份', prompt: '学生、教师、管理员在平台里的 AI 使用场景有什么区别？' },
    ],
  },
  '/help': {
    label: '帮助中心',
    intent: '查看平台使用说明、规则和常见问题。',
    scope: '优先解释平台功能、学习路径和使用规则。',
    greeting: '你现在在帮助中心。我可以把平台规则讲得更直白，也可以帮你找下一步入口。',
    hint: '我可以解释平台规则',
    placeholder: '例如：我应该从哪个模块开始？',
    audience: 'student',
    quickActions: [
      { label: '新手入口', prompt: '我是新用户，请告诉我 GMP 助学平台应该从哪里开始。' },
      { label: '功能说明', prompt: '请用简洁语言解释课程、练习、实训、报告的区别。' },
      { label: '使用规则', prompt: '请说明连续打卡和积分等级对学习有什么帮助。' },
    ],
  },
  '/teacher': {
    label: '教师工作台',
    intent: '支持教师进行课程管理、题目生成、作业批阅和学生学习分析。',
    scope: '优先围绕备课、课堂讲解、作业反馈、学生薄弱项和教学管理回答。',
    greeting: '你现在在教师工作台。我可以帮你备课、设计讲解、整理学生错点或改写作业反馈。',
    hint: '我可以辅助备课和讲评',
    placeholder: '例如：帮我设计一个 GMP 课堂讲解思路',
    audience: 'teacher',
    quickActions: [
      { label: '备课思路', prompt: '请给我一个 GMP 课程的课堂讲解结构。' },
      { label: '错点讲评', prompt: '请给我一个学生 GMP 错题讲评模板。' },
      { label: '作业反馈', prompt: '请帮我写一段专业、鼓励式的 GMP 作业反馈。' },
    ],
  },
  '/admin': {
    label: '管理控制台',
    intent: '支持平台账号、学校、课程、题库、系统配置和 AI 配置管理。',
    scope: '优先围绕管理操作说明、配置影响和数据治理建议回答。',
    greeting: '你现在在管理控制台。我可以帮你理解配置影响、梳理管理步骤或检查操作风险。',
    hint: '我可以解释管理配置',
    placeholder: '例如：AI 配置改动会影响哪些功能？',
    audience: 'teacher',
    quickActions: [
      { label: '配置影响', prompt: '请说明管理控制台里的 AI 配置可能影响哪些平台功能。' },
      { label: '操作检查', prompt: '做系统配置变更前，我应该检查哪些风险点？' },
      { label: '数据治理', prompt: '请给我一个平台题库和课程数据治理建议。' },
    ],
  },
}

const HIDDEN_PREFIXES = ['/login', '/register', '/onboarding', '/pretest']

export function shouldHideAiElf(pathname: string) {
  return pathname === '/' || HIDDEN_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

export function getAiElfPageContext(pathname: string): AiElfPageContext {
  if (pathname.startsWith('/course/') && pathname.endsWith('/quiz')) {
    return {
      ...CONTEXTS['/course'],
      label: '章节测验',
      intent: '完成课程章节测验，检查 GMP 章节掌握情况。',
      greeting: '你现在在章节测验页。我可以帮你复盘思路，但不会直接替你作答。',
      hint: '我可以提示答题思路',
      placeholder: '例如：这类题该怎么分析？',
    }
  }

  if (pathname.startsWith('/course/') && pathname.includes('/discussion')) {
    return {
      ...CONTEXTS['/course'],
      label: '课程讨论',
      intent: '围绕课程章节进行 GMP 问题讨论和案例交流。',
      greeting: '你现在在课程讨论页。我可以帮你组织观点，或者把讨论问题说得更清楚。',
      hint: '我可以帮你组织讨论观点',
      placeholder: '例如：帮我整理一段讨论发言',
    }
  }

  if (pathname.startsWith('/course/')) {
    return {
      ...CONTEXTS['/course'],
      label: '课程详情',
      greeting: '你现在在课程详情页。我可以帮你提炼这一章怎么学、怎么复盘。',
      hint: '我可以提炼课程重点',
    }
  }

  const exact = CONTEXTS[pathname]
  if (exact) return exact

  const prefixMatch = Object.keys(CONTEXTS)
    .filter(route => route !== '/')
    .find(route => pathname.startsWith(`${route}/`))

  return prefixMatch ? CONTEXTS[prefixMatch] : DEFAULT_CONTEXT
}
