import {
  PROJECT7_NPCS,
  PROJECT7_SCENES,
  assignedRoleLabel,
  buildProject7BossQuestions,
  buildProject7StoryQuestions,
  type CarrierCase,
  type EducationTrack,
  type ScenarioNpc,
  type ScenarioQuestion,
  type ScenarioQuestionKind,
} from './project7'

export type ProjectMedal = 'bronze' | 'silver' | 'gold' | 'none'

export interface ProjectScene {
  id: string
  number: number
  title: string
  defect: string
  objective: string
}

export interface ProjectDefinition {
  id: number
  curriculum: string
  title: string
  missionCode: string
  position: { left: string; top: string }
  labelSide?: 'left' | 'right'
  finalBoss?: boolean
  lead: string
  caseFocus: string
  riskSignal: string
  wrongShortcut: string
  firstAction: string
  processRisk: string
  scopeRisk: string
  capaMove: string
  keyEvidence: [string, string, string]
  storyImage: string
  bossImage: string
  bossName: string
  bossTitle: string
  npcs: ScenarioNpc[]
  scenes: ProjectScene[]
}

interface MissionQuestionSeed {
  id: string
  kind: ScenarioQuestionKind
  chapter: string
  sceneNumber: number
  speaker: ScenarioNpc
  taskLabel: string
  stem: string
  options: string[]
  correct: number[]
  insight: string
  evidence: string
  deliverable: string
  choicePrompt: string
  points?: number
}

const OPTIONS = ['A', 'B', 'C', 'D']
export const FINAL_PROJECT_ID = 11
export const REGULAR_GAME_PROJECT_COUNT = 10

export const COURSE_CREDIT_RULES = {
  regularTotal: 700,
  courseLearningRegular: 350,
  gameProjectRegular: 350,
  finalTotal: 300,
  courseFinalTest: 150,
  finalBoss: 150,
  finalBossBase: 100,
  medalBonus: 50,
  finalExamQuestionCountNote: '题型配置为单选50、多选20、判断20、简答5，共95题、100分；若必须100题，建议补5道0分情境判断或调整题型数量。',
}

export const GAME_PROJECT_BASE_CREDIT = COURSE_CREDIT_RULES.gameProjectRegular / REGULAR_GAME_PROJECT_COUNT
export const FINAL_BOSS_BASE_CREDIT = COURSE_CREDIT_RULES.finalBossBase
export const MEDAL_BONUS_CREDIT_TOTAL = COURSE_CREDIT_RULES.medalBonus

const REGULAR_PROJECT_MEDAL_BONUS: Record<ProjectMedal, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 4,
}

const FINAL_BOSS_MEDAL_BONUS: Record<ProjectMedal, number> = {
  none: 0,
  bronze: 3,
  silver: 6,
  gold: 10,
}

const npcSet = (prefix: string, names: [string, string, string, string, string]): ScenarioNpc[] => [
  { id: `${prefix}-owner`, name: names[0], title: '项目负责人', attitude: '希望快速推进但愿意接受证据' },
  { id: `${prefix}-qa`, name: names[1], title: 'QA 审核员', attitude: '关注流程边界和记录完整性' },
  { id: `${prefix}-prod`, name: names[2], title: '生产代表', attitude: '承受交付压力，熟悉现场细节' },
  { id: `${prefix}-data`, name: names[3], title: '数据管理员', attitude: '掌握电子记录和趋势线索' },
  { id: `${prefix}-mentor`, name: names[4], title: '质量负责人', attitude: '要求形成可批准的闭环结论' },
]

const scenes = (codes: string[], titles: string[]): ProjectScene[] => titles.map((title, index) => ({
  id: `scene-${index + 1}`,
  number: index + 1,
  title,
  defect: codes[index],
  objective: [
    '锁定风险并控制现场',
    '保全证据并判断影响',
    '访谈多角色还原事实',
    '扩展范围并论证根因',
    '提交 CAPA 与结案依据',
  ][index],
}))

export const PROJECT_MISSIONS: ProjectDefinition[] = [
  {
    id: 1,
    curriculum: '工艺研究与法规基础',
    title: '配方诞生：工艺风险评审',
    missionCode: 'MISSION 01',
    position: { left: '28.8%', top: '70.6%' },
    lead: '研发处方进入中试前的第一次质量闸门',
    caseFocus: '处方工艺转移包',
    riskSignal: '中试前处方筛选记录缺少关键质量属性与工艺参数关联评价',
    wrongShortcut: '只凭研发经验进入中试',
    firstAction: '建立 CQA/CPP 风险清单并组织质量评审',
    processRisk: '混合时间、粒度和溶出曲线尚未形成设计空间',
    scopeRisk: '同平台口服固体制剂可能共用相同处方风险',
    capaMove: '补充 QbD 风险评估、确认关键参数并设置中试放行闸门',
    keyEvidence: ['处方筛选记录', 'CQA/CPP 风险矩阵', '小试与中试桥接方案'],
    storyImage: '/simulation/story-director.webp',
    bossImage: '/simulation/boss-record-corrupter.webp',
    bossName: '盲试炼金师',
    bossTitle: '未评估工艺风险的凝结体',
    npcs: npcSet('p1', ['许知微', '秦牧', '罗启', '闻澈', '周明澜']),
    scenes: scenes(['RND-01', 'QBD-02', 'TR-03', 'REG-04', 'GATE-05'], ['处方立项', '参数迷雾', '中试闸门', '法规回声', '评审签发']),
  },
  {
    id: 2,
    curriculum: '清洁验证',
    title: '战衣净魂：清洁验证挑战',
    missionCode: 'MISSION 02',
    position: { left: '47.6%', top: '75.2%' },
    lead: '多产品共线后的残留控制挑战',
    caseFocus: '共线设备清洁验证',
    riskSignal: '换品种前清洁记录完整，但最难清洁点未覆盖取样',
    wrongShortcut: '只看最终目检合格',
    firstAction: '按最差条件确认取样点、限度和分析方法',
    processRisk: '设备死角残留与清洁剂残留未形成双重评价',
    scopeRisk: '共线高活性产品可能影响后续所有暴露批次',
    capaMove: '重建清洁矩阵、补充验证批次并设置周期性再确认',
    keyEvidence: ['清洁矩阵', '擦拭/淋洗取样记录', '残留限度计算表'],
    storyImage: '/simulation/story-production.webp',
    bossImage: '/simulation/boss-production.webp',
    bossName: '残留影武者',
    bossTitle: '清洁盲点的潜伏实体',
    npcs: npcSet('p2', ['白芷', '程远', '杜衡', '岑越', '林严谨']),
    scenes: scenes(['CLN-01', 'CLN-02', 'CLN-03', 'CLN-04', 'CLN-05'], ['换线警报', '死角取样', '限度审判', '共线追溯', '净化闭环']),
  },
  {
    id: 3,
    curriculum: '委托管理',
    title: '委托迷雾：MAH 远程审计',
    missionCode: 'MISSION 03',
    position: { left: '70.2%', top: '65.5%' },
    labelSide: 'left',
    lead: '委托生产现场与持有人责任之间的证据拉扯',
    caseFocus: 'MAH 委托生产审计包',
    riskSignal: '受托方偏差台账显示同类问题复发，但质量协议未约定升级时限',
    wrongShortcut: '把责任全部交给受托方',
    firstAction: '按质量协议启动远程审计并锁定升级义务',
    processRisk: '批记录审核、偏差上报和放行沟通存在时间差',
    scopeRisk: '相同受托线的多个品种可能共享质量体系缺陷',
    capaMove: '修订质量协议、建立关键偏差升级和持有人复核机制',
    keyEvidence: ['质量协议', '远程审计清单', '受托方偏差/CAPA 台账'],
    storyImage: '/simulation/story-qa.webp',
    bossImage: '/simulation/boss-qa.webp',
    bossName: '外包迷雾主',
    bossTitle: '责任边界模糊的化身',
    npcs: npcSet('p3', ['顾青岚', '林严谨', '何川', '叶书', '沈既白']),
    scenes: scenes(['MAH-01', 'MAH-02', 'MAH-03', 'MAH-04', 'MAH-05'], ['协议裂缝', '远程镜头', '批放行线', '责任回声', '审计结案']),
  },
  {
    id: 4,
    curriculum: '发运与召回',
    title: '温度危机：冷链追溯',
    missionCode: 'MISSION 04',
    position: { left: '42.2%', top: '56.8%' },
    lead: '运输温度异常后的市场风险判断',
    caseFocus: '冷链发运与召回评估',
    riskSignal: '运输途中温度超限 4 小时，承运商建议按到货外观合格入库',
    wrongShortcut: '只看外包装未破损就接收',
    firstAction: '隔离到货批次并启动温度偏差影响评估',
    processRisk: '温度记录、装箱位置和稳定性数据未完成关联',
    scopeRisk: '同一路线同承运商发运批次可能同样暴露',
    capaMove: '修订承运商资质、温控报警升级和召回评估流程',
    keyEvidence: ['温度记录仪数据', '发运路线与装箱图', '稳定性支持资料'],
    storyImage: '/simulation/story-specialist.webp',
    bossImage: '/simulation/boss-specialist.webp',
    bossName: '寒链断脉者',
    bossTitle: '温控失效的风险实体',
    npcs: npcSet('p4', ['夏知寒', '顾栖', '陆承', '闻澈', '周明澜']),
    scenes: scenes(['SHIP-01', 'TEMP-02', 'WH-03', 'MK-04', 'RECALL-05'], ['到货冻结', '温度曲线', '仓储访谈', '市场边界', '召回判定']),
  },
  {
    id: 5,
    curriculum: '确认与验证',
    title: '验证堡垒：eBRS 上线行动',
    missionCode: 'MISSION 05',
    position: { left: '26.5%', top: '49.1%' },
    lead: '电子批记录上线前的验证决策',
    caseFocus: 'eBRS 系统验证',
    riskSignal: '电子批记录准备上线，但用户权限、审计追踪和异常流程未完成挑战测试',
    wrongShortcut: '先上线再补验证脚本',
    firstAction: '冻结上线闸门并补齐 URS/风险评估/验证脚本',
    processRisk: '电子签名、权限矩阵和异常处理未覆盖关键业务场景',
    scopeRisk: '同系统覆盖多个车间与产品放行流程',
    capaMove: '完成 CSV 验证、权限复核和上线后监控计划',
    keyEvidence: ['URS 与风险评估', '验证脚本和偏差记录', '权限/审计追踪测试'],
    storyImage: '/simulation/story-it.webp',
    bossImage: '/simulation/boss-it.webp',
    bossName: '未验证主机',
    bossTitle: '电子记录失控的核心',
    npcs: npcSet('p5', ['陆云栖', '秦牧', '韩工', '顾航', '林严谨']),
    scenes: scenes(['CSV-01', 'CSV-02', 'CSV-03', 'CSV-04', 'CSV-05'], ['上线前夜', '权限矩阵', '脚本挑战', '偏差回路', '验证批准']),
  },
  {
    id: 6,
    curriculum: '数据完整性',
    title: '沉默真相：实验室数据追踪',
    missionCode: 'MISSION 06',
    position: { left: '21.6%', top: '37.3%' },
    lead: '实验室数据从异常图谱延伸到体系缺陷',
    caseFocus: '实验室数据完整性调查',
    riskSignal: 'HPLC 审计追踪存在空窗期，部分重积分缺少理由',
    wrongShortcut: '只打印最终合格图谱',
    firstAction: '保全原始电子数据并启动数据可靠性专项调查',
    processRisk: '共用账号、重积分和系统时间校准存在组合风险',
    scopeRisk: '同仪器历史放行批次可能受到影响',
    capaMove: '恢复审计追踪、复核权限并建立周期性数据审核',
    keyEvidence: ['审计追踪导出', '原始序列和重积分记录', '账号权限矩阵'],
    storyImage: '/simulation/story-it.webp',
    bossImage: '/simulation/boss-it.webp',
    bossName: '删迹主控',
    bossTitle: '审计追踪失效实体',
    npcs: npcSet('p6', ['张雨辰', '林严谨', '韩工', '顾航', '周明澜']),
    scenes: scenes(['DI-01', 'DI-02', 'DI-03', 'DI-04', 'DI-05'], ['静默序列', '账号裂痕', '重积分室', '历史回顾', '数据封印']),
  },
  {
    id: 7,
    curriculum: '偏差调查与 CAPA',
    title: '失控的偏差：CAPA 调查之旅',
    missionCode: 'MISSION 07',
    position: { left: '40.1%', top: '34.5%' },
    labelSide: 'left',
    lead: 'OOS 与工艺偏差交织后的 CAPA 闭环',
    caseFocus: '偏差调查与 CAPA',
    riskSignal: '复测合格被用于掩盖未判定 OOS',
    wrongShortcut: '用复测替代调查',
    firstAction: '隔离批次并启动分阶段调查',
    processRisk: '总混超时与物料变更叠加',
    scopeRisk: '同暴露批次可能共享风险',
    capaMove: '建立根因、影响评价与 CAPA 有效性验证',
    keyEvidence: ['原始检验记录', '设备日志', 'CAPA 执行证据'],
    storyImage: '/simulation/story-director.webp',
    bossImage: '/simulation/boss-record-corrupter.webp',
    bossName: '无效闭环',
    bossTitle: '表面整改的凝结体',
    npcs: [PROJECT7_NPCS.qc, PROJECT7_NPCS.operator, PROJECT7_NPCS.foreman, PROJECT7_NPCS.qa, PROJECT7_NPCS.supplier],
    scenes: PROJECT7_SCENES,
  },
  {
    id: 8,
    curriculum: '无菌保障',
    title: '线外之兵：无菌灌装攻防',
    missionCode: 'MISSION 08',
    position: { left: '62.4%', top: '47.0%' },
    labelSide: 'left',
    lead: '无菌灌装线环境趋势异常后的批次判定',
    caseFocus: '无菌工艺保障',
    riskSignal: 'A级区沉降菌趋势接近警戒线，灌装仍被要求继续',
    wrongShortcut: '只要无菌检查合格就放行',
    firstAction: '控制批次并启动环境监测与无菌保障评估',
    processRisk: '干预操作、压差波动和人员行为记录不一致',
    scopeRisk: '同班次连续灌装批次可能共享暴露风险',
    capaMove: '强化干预确认、环境趋势复核和无菌模拟再评估',
    keyEvidence: ['环境监测趋势', '无菌干预记录', '压差与人员进出记录'],
    storyImage: '/simulation/story-production.webp',
    bossImage: '/simulation/boss-production.webp',
    bossName: '微粒军团长',
    bossTitle: '无菌屏障裂缝的集合体',
    npcs: npcSet('p8', ['宁微', '顾栖', '韩工', '闻澈', '周明澜']),
    scenes: scenes(['ST-01', 'ST-02', 'ST-03', 'ST-04', 'ST-05'], ['灌装警戒', '压差走廊', '干预回放', '批次暴露', '无菌重筑']),
  },
  {
    id: 9,
    curriculum: '厂房设施',
    title: '空中楼阁：HVAC 压差迷局',
    missionCode: 'MISSION 09',
    position: { left: '68.0%', top: '39.2%' },
    labelSide: 'right',
    lead: 'HVAC 压差失衡后的污染控制判断',
    caseFocus: '厂房设施与公用系统',
    riskSignal: '洁净区压差连续波动，报警被解释为传感器偶发噪声',
    wrongShortcut: '关闭报警等待下次校准',
    firstAction: '评估压差偏差影响并核对设施运行趋势',
    processRisk: '门禁频繁开启、过滤器压差和房间级别边界不一致',
    scopeRisk: '同一空调系统服务区域的生产批次可能受影响',
    capaMove: '完成设施偏差调查、过滤器复核和报警升级',
    keyEvidence: ['HVAC 趋势记录', '压差报警日志', '洁净区门禁记录'],
    storyImage: '/simulation/story-specialist.webp',
    bossImage: '/simulation/boss-specialist.webp',
    bossName: '逆压风暴眼',
    bossTitle: '洁净屏障失衡实体',
    npcs: npcSet('p9', ['苏岚', '秦牧', '杜衡', '顾航', '林严谨']),
    scenes: scenes(['FAC-01', 'FAC-02', 'FAC-03', 'FAC-04', 'FAC-05'], ['压差闪烁', '风量迷图', '门禁证词', '区域追溯', '屏障复位']),
  },
  {
    id: 10,
    curriculum: '变更控制',
    title: '变更风暴：工艺变更防线',
    missionCode: 'MISSION 10',
    position: { left: '55.0%', top: '36.1%' },
    labelSide: 'left',
    lead: '供应商与工艺参数同步变化后的变更评估',
    caseFocus: '变更控制与技术转移',
    riskSignal: '辅料供应商和关键参数同时变更，但影响评估只写“无明显影响”',
    wrongShortcut: '先执行变更，稳定后再补评估',
    firstAction: '冻结变更实施并补充跨部门风险评估',
    processRisk: '验证范围、物料属性和批记录模板未同步更新',
    scopeRisk: '已实施试生产批次和待放行批次均需纳入评价',
    capaMove: '完善变更分级、批准路径和实施后效果确认',
    keyEvidence: ['变更申请与批准记录', '风险评估矩阵', '实施后确认报告'],
    storyImage: '/simulation/story-qa.webp',
    bossImage: '/simulation/boss-qa.webp',
    bossName: '未控变更王',
    bossTitle: '未经批准变更的聚合体',
    npcs: npcSet('p10', ['江衡', '林严谨', '韩工', '顾航', '周明澜']),
    scenes: scenes(['CHG-01', 'CHG-02', 'CHG-03', 'CHG-04', 'CHG-05'], ['风暴预警', '评估缺口', '现场回放', '批次边界', '变更封存']),
  },
  {
    id: 11,
    curriculum: '年度质量回顾',
    title: '终局王城：体系诊断会战',
    missionCode: 'MISSION 11',
    position: { left: '49.5%', top: '27.1%' },
    labelSide: 'left',
    finalBoss: true,
    lead: '全项目知识点覆盖的课程最终总测',
    caseFocus: 'GMP 全体系诊断',
    riskSignal: '年度质量回顾暴露多个系统性趋势，需要完成最终诊断',
    wrongShortcut: '只挑熟悉章节作答',
    firstAction: '按全项目任务覆盖进行随机总测',
    processRisk: '易中难比例、题型权重和证据判断需要同时达标',
    scopeRisk: '十个项目中的知识漏洞都会影响最终合格',
    capaMove: '完成课程总测与最终 Boss 后形成课程合格结论',
    keyEvidence: ['全项目题库', '课程最终总测', '最终 Boss 诊断报告'],
    storyImage: '/simulation/story-director.webp',
    bossImage: '/simulation/boss-record-corrupter.webp',
    bossName: '体系终审官',
    bossTitle: '全课程质量风险的最终化身',
    npcs: npcSet('p11', ['周明澜', '林严谨', '韩工', '顾航', '苏妍']),
    scenes: scenes(
      ['FINAL-01', 'FINAL-02', 'FINAL-03', 'FINAL-04', 'FINAL-05', 'FINAL-06', 'FINAL-07', 'FINAL-08', 'FINAL-09', 'FINAL-10', 'FINAL-11'],
      ['第一章回溯', '第二章回溯', '第三章回溯', '第四章回溯', '第五章回溯', '第六章回溯', '第七章回溯', '第八章回溯', '第九章回溯', '第十章回溯', '体系终审'],
    ),
  },
]

function questionOptionHash(text: string) {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return hash
}

function balanceQuestionOptions(seed: MissionQuestionSeed, question: ScenarioQuestion): ScenarioQuestion {
  const optionCount = seed.options.length
  if (seed.kind === 'sequence' || optionCount < 2) return question

  const rotation = questionOptionHash(`${seed.id}:${seed.sceneNumber}:${seed.stem}`) % optionCount
  if (rotation === 0) return question

  const indexToOptionId = new Map<number, string>()
  const options = Array.from({ length: optionCount }, (_, newIndex) => {
    const originalIndex = (newIndex + rotation) % optionCount
    const nextId = OPTIONS[newIndex]
    indexToOptionId.set(originalIndex, nextId)
    return { id: nextId, label: seed.options[originalIndex] }
  })

  return {
    ...question,
    options,
    correct: seed.correct
      .map(index => indexToOptionId.get(index) ?? OPTIONS[index])
      .filter((id): id is string => Boolean(id)),
  }
}

function createQuestion(seed: MissionQuestionSeed): ScenarioQuestion {
  const question = {
    id: seed.id,
    kind: seed.kind,
    chapter: seed.chapter,
    sceneNumber: seed.sceneNumber,
    stem: seed.stem,
    options: seed.options.map((label, index) => ({ id: OPTIONS[index], label })),
    correct: seed.correct.map(index => OPTIONS[index]),
    insight: seed.insight,
    context: seed.stem,
    taskLabel: seed.taskLabel,
    evidence: seed.evidence,
    deliverable: seed.deliverable,
    speaker: seed.speaker,
    points: seed.points ?? 10,
    sceneMood: '',
    narration: '',
    dialogue: [],
    choicePrompt: seed.choicePrompt,
  }
  return balanceQuestionOptions(seed, question)
}

function enrichQuestion(project: ProjectDefinition, question: ScenarioQuestion, carrier: CarrierCase, track: EducationTrack): ScenarioQuestion {
  const scene = project.scenes.find(item => item.number === question.sceneNumber) ?? project.scenes[0]
  const npc = question.speaker
  const roleName = assignedRoleLabel(track)

  return {
    ...question,
    sceneMood: `${scene.title} · ${scene.objective}`,
    narration: `${project.title}的第 ${scene.number} 幕展开：${project.lead}。当前载体是${carrier.productName}，风险信号指向“${project.riskSignal}”。`,
    dialogue: [
      { speaker: '旁白', line: `${scene.defect} 档案被推到你面前，${project.caseFocus}已经进入待判定状态。`, tone: 'narrator' },
      { speaker: npc.name, title: npc.title, line: `现场有人建议“${project.wrongShortcut}”，但证据还没有闭环。`, tone: 'npc' },
      { speaker: roleName, line: `我会先按${project.curriculum}的质量逻辑行动，保全证据，再作出判断。`, tone: 'player' },
      { speaker: '系统提示', line: question.insight, tone: 'system' },
    ],
  }
}

type NpcIndex = 0 | 1 | 2 | 3 | 4
type MissionQuestionDraft = Omit<MissionQuestionSeed, 'id' | 'speaker'> & { speaker: NpcIndex }

const p = 20

const PROJECT_KNOWLEDGE_BANKS: Record<number, { story: MissionQuestionDraft[]; boss: MissionQuestionDraft[] }> = {
  1: {
    story: [
      { kind: 'single', chapter: '处方立项 / QTPP-CQA', sceneNumber: 1, speaker: 0, points: p, taskLabel: '知识点：QbD 启动', stem: '处方进入中试前，哪项输出最能证明研发目标已转化为质量控制对象？', options: ['只形成生产排期', '建立 QTPP、CQA 与风险清单', '先采购中试物料', '只记录研发经验'], correct: [1], insight: 'QbD 起点是把目标产品质量概况转化为关键质量属性。', evidence: 'QTPP / CQA 清单', deliverable: '处方立项风险表', choicePrompt: '识别处方立项的首个质量知识点。' },
      { kind: 'multiple', chapter: '参数迷雾 / CQA-CPP', sceneNumber: 2, speaker: 1, points: p, taskLabel: '知识点：关键参数', stem: '评审 CQA 与 CPP 关联时，应重点纳入哪些资料？', options: ['粒度与溶出曲线', '混合时间范围', '研发人员口头偏好', '小试批间差异'], correct: [0, 1, 3], insight: '关键参数必须由质量属性、工艺数据和批间差异共同支撑。', evidence: 'CQA/CPP 风险矩阵', deliverable: '参数关联评审表', choicePrompt: '选择能支撑 CQA-CPP 关联的证据。' },
      { kind: 'sequence', chapter: '中试闸门 / 技术转移', sceneNumber: 3, speaker: 2, points: p, taskLabel: '知识点：中试前闸门', stem: '把处方包交给中试前，正确的技术转移顺序是什么？', options: ['确认中试批记录草案', '先定义 CQA 与验收标准', '评估设备放大差异', '召开质量评审并批准闸门'], correct: [1, 2, 0, 3], insight: '技术转移应先定义质量目标，再评估放大差异，最后批准中试闸门。', evidence: '小试-中试桥接方案', deliverable: '中试前批准记录', choicePrompt: '按顺序点击中试前质量闸门。' },
      { kind: 'case', chapter: '法规回声 / 设计空间', sceneNumber: 4, speaker: 3, points: p, taskLabel: '知识点：设计空间', stem: '混合时间和粒度均未形成设计空间，但项目组想用经验范围推进。哪些处理可以批准？', options: ['补充 DoE 或风险评估', '设定中试监测点', '直接按经验范围生产', '记录偏差触发条件'], correct: [0, 1, 3], insight: '设计空间不充分时，应设置数据补强和风险触发条件。', evidence: '法规符合性评审', deliverable: '设计空间补强计划', choicePrompt: '用案例要点判断设计空间是否可推进。' },
      { kind: 'multiple', chapter: '评审签发 / 中试放行', sceneNumber: 5, speaker: 4, points: p, taskLabel: '知识点：评审签发', stem: '中试闸门批准前，质量负责人最需要看到哪些闭环证据？', options: ['CQA/CPP 已确认', '桥接方案已批准', '异常处理路径已定义', '只提供时间表'], correct: [0, 1, 2], insight: '放行闸门看的是质量目标、桥接方案和异常处置是否完整。', evidence: '中试放行闸门记录', deliverable: '评审签发意见', choicePrompt: '选择中试放行前的必备证据。' },
    ],
    boss: [
      { kind: 'case', chapter: 'Boss / QbD 综合', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: 'Boss 要求“先做三批中试，再补 CQA/CPP”。你应如何反击？', options: ['冻结中试闸门', '补齐 CQA/CPP 风险矩阵', '设置桥接验证与偏差触发', '接受经验放行'], correct: [0, 1, 2], insight: '高难度点在于把研发经验转化为可批准的质量闸门。', evidence: '终场处方风险卷宗', deliverable: 'QbD 核验结论', choicePrompt: '选择能击破盲试推进的组合。' },
      { kind: 'sequence', chapter: 'Boss / 放大路径', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '处方放大风险评审的正确顺序是？', options: ['批准中试闸门', '定义 CQA 与验收标准', '识别 CPP 与设备差异', '形成监测与偏差响应'], correct: [1, 2, 3, 0], insight: 'Boss 题要求按质量决策逻辑排序，而不是只选对单点。', evidence: '放大风险评审表', deliverable: '放大路径裁定', choicePrompt: '按顺序完成放大路径核验。' },
      { kind: 'multiple', chapter: 'Boss / 质量属性', sceneNumber: 5, speaker: 3, taskLabel: 'Boss 核验', stem: '若溶出曲线出现批间漂移，哪些知识点必须进入结论？', options: ['粒度分布影响', '混合均匀度趋势', '处方筛选假设', '包装标签颜色'], correct: [0, 1, 2], insight: '质量属性异常应追溯到处方假设、物料属性和工艺参数。', evidence: '溶出与粒度趋势', deliverable: '质量属性答辩', choicePrompt: '选出溶出漂移的核心证据线。' },
      { kind: 'single', chapter: 'Boss / 法规边界', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: '设计空间未建立时，最危险的结案表述是？', options: ['限定中试条件并继续收集数据', '说明风险依据和控制点', '宣称所有参数已被验证且无需监测', '提交质量评审批准'], correct: [2], insight: '未验证的设计空间不能被写成已验证结论。', evidence: '法规审评意见', deliverable: '合规表述修正', choicePrompt: '识别最危险的法规表述。' },
      { kind: 'case', chapter: 'Boss / 中试偏差', sceneNumber: 5, speaker: 2, taskLabel: 'Boss 核验', stem: '首批中试混合端点接近警戒线，哪些动作构成高质量处置？', options: ['暂停扩大批量', '复核 CPP 与 CQA 关联', '补充趋势监测', '只看最终合格报告'], correct: [0, 1, 2], insight: '中试偏差要回到 CPP/CQA 关系，而不是只看最终结果。', evidence: '中试偏差记录', deliverable: '偏差处置意见', choicePrompt: '选择能守住中试闸门的动作。' },
      { kind: 'sequence', chapter: 'Boss / CAPA 关闭', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '处方风险 CAPA 的关闭顺序应为？', options: ['验证后续中试批趋势', '批准补充控制策略', '执行参数监测', '确认无新风险后关闭'], correct: [1, 2, 0, 3], insight: 'CAPA 关闭必须经历批准、执行、验证和关闭判定。', evidence: '处方风险 CAPA', deliverable: '关闭建议', choicePrompt: '按顺序完成最后一击。' },
    ],
  },
  2: {
    story: [
      { kind: 'single', chapter: '换线警报 / 最差条件', sceneNumber: 1, speaker: 0, points: p, taskLabel: '知识点：清洁验证启动', stem: '多产品共线换线前，选择清洁验证对象的首要依据是？', options: ['产品名称好记', '最差条件与残留风险', '生产计划最紧', '包装材料相同'], correct: [1], insight: '清洁验证应基于毒性、溶解性、批量、设备接触面等最差条件。', evidence: '清洁矩阵', deliverable: '最差条件选择表', choicePrompt: '锁定清洁验证的第一个知识点。' },
      { kind: 'multiple', chapter: '死角取样 / 取样代表性', sceneNumber: 2, speaker: 1, points: p, taskLabel: '知识点：擦拭/淋洗', stem: '最难清洁点取样方案应同时覆盖哪些内容？', options: ['设备死角位置', '擦拭回收率', '淋洗覆盖范围', '操作员偏好'], correct: [0, 1, 2], insight: '取样代表性来自风险点、方法回收率和覆盖范围。', evidence: '取样点布置图', deliverable: '清洁取样方案', choicePrompt: '选择能证明取样代表性的项目。' },
      { kind: 'case', chapter: '限度审判 / MACO', sceneNumber: 3, speaker: 3, points: p, taskLabel: '知识点：残留限度', stem: '清洁限度只写“肉眼不可见”，哪些补充才能被批准？', options: ['基于 PDE/剂量计算 MACO', '微生物或清洁剂限度', '分析方法验证', '维持目检作为唯一标准'], correct: [0, 1, 2], insight: '目检只能辅助，残留限度需可计算、可检测、可验证。', evidence: '残留限度计算表', deliverable: '限度批准意见', choicePrompt: '用案例要点补齐 MACO 知识。' },
      { kind: 'sequence', chapter: '共线追溯 / 暴露批次', sceneNumber: 4, speaker: 2, points: p, taskLabel: '知识点：共线影响', stem: '发现未覆盖死角取样后，正确的追溯顺序是？', options: ['评估已生产暴露批次', '锁定同设备共线产品', '隔离待判定批次', '形成质量处置结论'], correct: [2, 1, 0, 3], insight: '清洁风险要先控制当前批，再按共线暴露范围追溯。', evidence: '共线生产台账', deliverable: '暴露批次清单', choicePrompt: '按顺序完成共线追溯。' },
      { kind: 'multiple', chapter: '净化闭环 / 再确认', sceneNumber: 5, speaker: 4, points: p, taskLabel: '知识点：再验证', stem: '清洁验证 CAPA 完成后，哪些证据支持关闭？', options: ['补充验证批次合格', '清洁 SOP 生效', '周期性再确认计划', '只发口头提醒'], correct: [0, 1, 2], insight: '清洁验证闭环需要验证结果、程序控制和再确认机制。', evidence: '清洁验证报告', deliverable: '再确认计划', choicePrompt: '选出清洁验证闭环证据。' },
    ],
    boss: [
      { kind: 'case', chapter: 'Boss / 清洁矩阵', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: 'Boss 宣称“所有产品同一清洁程序即可”。哪些反击成立？', options: ['按最差条件重建矩阵', '纳入高活性/低溶解性产品', '确认设备接触面积', '只保留通用目检'], correct: [0, 1, 2], insight: '高难点是用矩阵证明清洁程序适用边界。', evidence: '终场清洁矩阵', deliverable: '矩阵核验', choicePrompt: '选择击破通用清洁假设的证据。' },
      { kind: 'sequence', chapter: 'Boss / 残留限度', sceneNumber: 5, speaker: 3, taskLabel: 'Boss 核验', stem: '建立残留限度的正确顺序是？', options: ['确认分析方法能检出限度', '选择 PDE/剂量等限度依据', '换算到设备表面积或取样量', '批准清洁限度'], correct: [1, 2, 0, 3], insight: '限度不是先写数字，而是先有毒理/剂量依据和方法能力。', evidence: 'MACO 计算包', deliverable: '限度裁定', choicePrompt: '按顺序完成 MACO 审判。' },
      { kind: 'multiple', chapter: 'Boss / 方法验证', sceneNumber: 5, speaker: 3, taskLabel: 'Boss 核验', stem: '擦拭法用于残留检测前，应验证哪些方法能力？', options: ['回收率', '专属性/灵敏度', '取样面积一致性', '检验员星座'], correct: [0, 1, 2], insight: '清洁验证检测方法必须证明能把残留可靠取出来、测出来。', evidence: '方法验证记录', deliverable: '方法适用性意见', choicePrompt: '选出方法验证的关键能力。' },
      { kind: 'case', chapter: 'Boss / 保持时间', sceneNumber: 5, speaker: 2, taskLabel: 'Boss 核验', stem: '设备清洁后超过已验证清洁保持时间，哪些处置合理？', options: ['重新评估或再清洁', '检查微生物/残留风险', '记录偏差并批准使用', '直接投入生产'], correct: [0, 1, 2], insight: '脏保持和清洁保持时间都是清洁验证边界。', evidence: '保持时间记录', deliverable: '使用前质量判断', choicePrompt: '判断保持时间越界后的处置。' },
      { kind: 'single', chapter: 'Boss / 放行边界', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: '清洁验证失败时，最不合规的批次处置是？', options: ['隔离并评估暴露批次', '追加调查与复验', '按外观合格直接放行', '升级质量负责人批准'], correct: [2], insight: '外观合格不能替代残留风险判定。', evidence: '暴露批次处置单', deliverable: '批次状态裁定', choicePrompt: '识别 Boss 的错误捷径。' },
      { kind: 'sequence', chapter: 'Boss / 清洁闭环', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '清洁验证缺口 CAPA 的关闭顺序应为？', options: ['执行补充验证', '批准修订取样/限度方案', '评估后续共线趋势', '批准关闭'], correct: [1, 0, 2, 3], insight: '清洁验证 CAPA 必须先修订方案，再以补充验证和趋势证明有效。', evidence: '清洁 CAPA 关闭包', deliverable: '关闭批准建议', choicePrompt: '按顺序完成净化最后一击。' },
    ],
  },
  3: {
    story: [
      { kind: 'single', chapter: '协议裂缝 / MAH 责任', sceneNumber: 1, speaker: 0, points: p, taskLabel: '知识点：持有人责任', stem: '受托方偏差复发时，MAH 最不能采用哪种态度？', options: ['按质量协议启动监督', '评估批次和系统风险', '认为责任完全属于受托方', '要求偏差升级'], correct: [2], insight: 'MAH 对委托生产质量负全生命周期责任。', evidence: '质量协议', deliverable: '责任边界确认', choicePrompt: '识别 MAH 委托管理的底线。' },
      { kind: 'multiple', chapter: '远程镜头 / 远程审计', sceneNumber: 2, speaker: 1, points: p, taskLabel: '知识点：审计证据', stem: '远程审计受托方偏差复发，应调取哪些证据？', options: ['偏差/CAPA 台账', '批记录审核记录', '质量协议升级条款', '受托方宣传册'], correct: [0, 1, 2], insight: '远程审计也必须锁定真实记录、升级义务和闭环有效性。', evidence: '远程审计清单', deliverable: '审计证据包', choicePrompt: '选择远程审计核心材料。' },
      { kind: 'case', chapter: '批放行线 / 放行职责', sceneNumber: 3, speaker: 2, points: p, taskLabel: '知识点：委托放行', stem: '受托方建议“先按本厂结论放行，MAH 后补签”。哪些处理正确？', options: ['MAH 复核批记录和偏差状态', '确认质量协议授权边界', '未完成复核不得放行', '直接接受受托方结论'], correct: [0, 1, 2], insight: '委托生产不能削弱持有人放行责任。', evidence: '批放行沟通记录', deliverable: '放行复核意见', choicePrompt: '用案例要点判断放行边界。' },
      { kind: 'sequence', chapter: '责任回声 / 偏差升级', sceneNumber: 4, speaker: 3, points: p, taskLabel: '知识点：升级时限', stem: '关键偏差在受托方复发，MAH 的正确管理顺序是？', options: ['评估受影响品种/批次', '按协议触发升级通知', '审查 CAPA 有效性', '修订协议或监督频次'], correct: [1, 0, 2, 3], insight: '委托管理先触发升级，再评价影响，最终强化监督机制。', evidence: '偏差升级记录', deliverable: '升级管理清单', choicePrompt: '按顺序处理受托方关键偏差。' },
      { kind: 'multiple', chapter: '审计结案 / 协议修订', sceneNumber: 5, speaker: 4, points: p, taskLabel: '知识点：质量协议', stem: '质量协议修订应明确哪些控制点？', options: ['关键偏差上报时限', '批记录/数据共享要求', 'CAPA 有效性复核职责', '只写商业价格'], correct: [0, 1, 2], insight: '质量协议应把责任、资料、时限和升级路径写清楚。', evidence: '质量协议修订稿', deliverable: '委托管理 CAPA', choicePrompt: '选出协议修订的质量条款。' },
    ],
    boss: [
      { kind: 'case', chapter: 'Boss / MAH 责任答辩', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: 'Boss 以“受托方已处理”为由要求 MAH 结案。哪些反击成立？', options: ['MAH 独立复核偏差和批次影响', '核验受托 CAPA 有效性', '确认协议升级履行情况', '完全沿用受托方说法'], correct: [0, 1, 2], insight: '高难点在于区分受托方执行责任与 MAH 监督责任。', evidence: '委托管理终场卷宗', deliverable: 'MAH 责任裁定', choicePrompt: '选择能守住持有人责任的证据。' },
      { kind: 'sequence', chapter: 'Boss / 审计闭环', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '远程审计发现系统缺陷后的正确闭环顺序是？', options: ['提高监督频次或现场审计', '提出审计发现并分级', '跟踪 CAPA 有效性', '确认受影响批次处置'], correct: [1, 3, 2, 0], insight: '审计闭环不是发报告结束，而是从发现、影响、CAPA 到监督调整。', evidence: '审计闭环台账', deliverable: '审计关闭建议', choicePrompt: '按顺序完成审计闭环。' },
      { kind: 'multiple', chapter: 'Boss / 放行沟通', sceneNumber: 5, speaker: 2, taskLabel: 'Boss 核验', stem: '委托批放行沟通中，哪些信息缺失会阻断批准？', options: ['偏差状态', '检验结果与原始数据', '质量协议授权链', '物流车牌颜色'], correct: [0, 1, 2], insight: '放行依赖完整质量状态，不是单一放行建议。', evidence: '放行沟通包', deliverable: '放行阻断意见', choicePrompt: '选出阻断批准的缺失项。' },
      { kind: 'case', chapter: 'Boss / 复发管理', sceneNumber: 5, speaker: 3, taskLabel: 'Boss 核验', stem: '同类偏差三个月内复发，MAH 应如何提高控制强度？', options: ['判定原 CAPA 有效性不足', '重新分析系统根因', '必要时暂停委托批次放行', '保持原监督频次不变'], correct: [0, 1, 2], insight: '复发说明监督和 CAPA 可能都未有效。', evidence: '复发偏差趋势', deliverable: '强化监督决定', choicePrompt: '选择复发后的高阶管理动作。' },
      { kind: 'single', chapter: 'Boss / 协议缺陷', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: '质量协议未约定关键偏差升级时限，最准确的缺陷性质是？', options: ['商业条款缺失', '委托质量管理职责边界不清', '培训签到缺失', '仓储面积不足'], correct: [1], insight: '关键时限缺失会导致持有人无法及时履行监督和放行责任。', evidence: '质量协议缺陷表', deliverable: '缺陷分级意见', choicePrompt: '识别协议缺陷的真正风险。' },
      { kind: 'sequence', chapter: 'Boss / 协议修订', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '修订委托质量协议的正确顺序是？', options: ['批准生效并培训双方', '识别职责和升级缺口', '设定资料共享/时限/批准边界', '纳入年度供应商回顾'], correct: [1, 2, 0, 3], insight: '协议修订要从缺口识别到条款固化，再进入持续回顾。', evidence: '协议修订记录', deliverable: '协议修订批准', choicePrompt: '按顺序完成协议封印。' },
    ],
  },
  4: {
    story: [
      { kind: 'single', chapter: '到货冻结 / 温度偏差', sceneNumber: 1, speaker: 0, points: p, taskLabel: '知识点：温控异常', stem: '冷链到货发现 4 小时温度超限，第一项质量动作是？', options: ['按外观合格入库', '隔离批次并启动温度偏差调查', '直接退货不记录', '等待销售决定'], correct: [1], insight: '温度超限必须先控制批次状态，再评价质量影响。', evidence: '到货验收记录', deliverable: '温度偏差启动单', choicePrompt: '锁定冷链异常第一步。' },
      { kind: 'multiple', chapter: '温度曲线 / 数据判读', sceneNumber: 2, speaker: 3, points: p, taskLabel: '知识点：曲线复核', stem: '判断温度超限影响时，应同时复核哪些信息？', options: ['记录仪原始曲线', '装箱位置与探头位置', '稳定性支持资料', '承运商口头保证'], correct: [0, 1, 2], insight: '温度偏差评价要把时间、位置和稳定性数据关联起来。', evidence: '温度记录仪数据', deliverable: '温度曲线复核表', choicePrompt: '选择温度曲线判读证据。' },
      { kind: 'case', chapter: '仓储访谈 / 收货判定', sceneNumber: 3, speaker: 2, points: p, taskLabel: '知识点：仓储接收', stem: '仓库提出“外包装未破损可接收”。哪些处理可批准？', options: ['维持隔离标签', '核对报警和运输路线', '等待质量部门处置', '按外观放行'], correct: [0, 1, 2], insight: '外观检查不能替代温控质量状态判定。', evidence: '仓储访谈记录', deliverable: '收货状态意见', choicePrompt: '用案例要点判断收货边界。' },
      { kind: 'sequence', chapter: '市场边界 / 召回评估', sceneNumber: 4, speaker: 1, points: p, taskLabel: '知识点：召回边界', stem: '发现同一路线多批次可能暴露，正确评估顺序是？', options: ['提出召回/不召回建议', '锁定同路线同承运商批次', '评价稳定性和患者风险', '确认市场流向'], correct: [1, 3, 2, 0], insight: '召回评估从暴露范围和流向开始，再进入风险建议。', evidence: '发运路线与流向记录', deliverable: '市场风险清单', choicePrompt: '按顺序完成召回边界评估。' },
      { kind: 'multiple', chapter: '召回判定 / 承运商管理', sceneNumber: 5, speaker: 4, points: p, taskLabel: '知识点：运输 CAPA', stem: '冷链偏差 CAPA 应包括哪些系统措施？', options: ['承运商再评价', '报警升级时限', '包装验证或装箱优化', '只要求司机注意'], correct: [0, 1, 2], insight: '运输 CAPA 要覆盖承运商、报警和包装/路线控制。', evidence: '运输 CAPA 计划', deliverable: '召回判定报告', choicePrompt: '选择冷链 CAPA 的系统措施。' },
    ],
    boss: [
      { kind: 'case', chapter: 'Boss / 温度偏差答辩', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: 'Boss 说“外观合格且客户急用，可以入库”。哪些反击成立？', options: ['温度超限需质量评价', '批次维持隔离', '稳定性资料支持后再处置', '外观合格即可放行'], correct: [0, 1, 2], insight: '高难点在于区分物流接收和质量放行。', evidence: '冷链终场卷宗', deliverable: '温控质量裁定', choicePrompt: '选择能击破外观放行的证据。' },
      { kind: 'sequence', chapter: 'Boss / 影响评价', sceneNumber: 5, speaker: 3, taskLabel: 'Boss 核验', stem: '温度超限影响评价的正确顺序是？', options: ['形成批次处置建议', '确认超限时长和最高/最低温', '关联装箱位置与稳定性资料', '评价同路线批次'], correct: [1, 2, 3, 0], insight: '先还原暴露，再判断范围，最后形成处置。', evidence: '温度影响评价包', deliverable: '批次处置建议', choicePrompt: '按顺序完成温控影响评价。' },
      { kind: 'multiple', chapter: 'Boss / 召回触发', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '哪些信息会提高召回评估等级？', options: ['产品稳定性对温度敏感', '已发往市场终端', '同路线重复报警', '标签字体较小'], correct: [0, 1, 2], insight: '召回风险由产品敏感性、市场暴露和重复失控共同抬高。', evidence: '召回评估资料', deliverable: '召回等级建议', choicePrompt: '选出召回升级触发因素。' },
      { kind: 'case', chapter: 'Boss / 承运商审计', sceneNumber: 5, speaker: 2, taskLabel: 'Boss 核验', stem: '承运商报警后 6 小时才通知，哪些 CAPA 能被批准？', options: ['修订报警升级协议', '复核承运商资质', '进行模拟运输挑战', '仅要求下次快点'], correct: [0, 1, 2], insight: '承运商失控需要协议、资质和验证三线整改。', evidence: '承运商审计记录', deliverable: '承运商 CAPA', choicePrompt: '选择承运商失控整改组合。' },
      { kind: 'single', chapter: 'Boss / 放行判定', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: '温度偏差未完成前，批次状态最准确的是？', options: ['合格待售', '隔离待判定', '无需状态', '召回完成'], correct: [1], insight: '未完成温度影响评价前，批次不能被认定为可用。', evidence: '批次状态记录', deliverable: '状态裁定', choicePrompt: '识别温控偏差下的批次状态。' },
      { kind: 'sequence', chapter: 'Boss / 冷链闭环', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '冷链偏差 CAPA 关闭顺序应为？', options: ['验证报警时限和运输趋势', '批准承运商/包装整改', '执行路线与装箱优化', '关闭 CAPA'], correct: [1, 2, 0, 3], insight: '冷链 CAPA 要验证下一阶段运输风险确实下降。', evidence: '冷链 CAPA 关闭包', deliverable: '关闭批准', choicePrompt: '按顺序完成冷链最后一击。' },
    ],
  },
  5: {
    story: [
      { kind: 'single', chapter: '上线前夜 / CSV 范围', sceneNumber: 1, speaker: 0, points: p, taskLabel: '知识点：CSV 启动', stem: 'eBRS 上线前，验证范围首先应从哪份文件展开？', options: ['宣传彩页', 'URS 与业务流程风险评估', '服务器采购单', '用户微信群'], correct: [1], insight: '计算机化系统验证从用户需求和风险评估确定范围。', evidence: 'URS 与风险评估', deliverable: 'CSV 启动范围', choicePrompt: '识别 CSV 的起点。' },
      { kind: 'multiple', chapter: '权限矩阵 / 访问控制', sceneNumber: 2, speaker: 3, points: p, taskLabel: '知识点：权限管理', stem: '电子批记录权限矩阵应覆盖哪些控制？', options: ['角色最小权限', '电子签名职责', '离职/转岗权限回收', '所有人管理员权限'], correct: [0, 1, 2], insight: '权限控制要保证职责分离、可归属和持续维护。', evidence: '权限矩阵', deliverable: '权限复核记录', choicePrompt: '选择权限矩阵核心控制点。' },
      { kind: 'case', chapter: '脚本挑战 / 审计追踪', sceneNumber: 3, speaker: 1, points: p, taskLabel: '知识点：挑战测试', stem: '验证脚本未挑战审计追踪关闭、异常复核和电子签名。哪些处理正确？', options: ['补充挑战脚本', '记录验证偏差', '完成缺陷关闭后再上线', '先上线再补截图'], correct: [0, 1, 2], insight: '关键业务场景未挑战，验证不能支持上线。', evidence: '验证脚本和偏差记录', deliverable: '挑战测试补充计划', choicePrompt: '用案例要点判断上线可否批准。' },
      { kind: 'sequence', chapter: '偏差回路 / 验证偏差', sceneNumber: 4, speaker: 2, points: p, taskLabel: '知识点：验证偏差处理', stem: '验证执行中发现关键脚本失败，正确处理顺序是？', options: ['评估对上线的影响', '记录验证偏差', '整改并复测', '批准偏差关闭'], correct: [1, 0, 2, 3], insight: '验证偏差需先记录和评价，再整改复测，最后关闭。', evidence: '验证偏差单', deliverable: '偏差关闭记录', choicePrompt: '按顺序处理验证偏差。' },
      { kind: 'multiple', chapter: '验证批准 / 上线条件', sceneNumber: 5, speaker: 4, points: p, taskLabel: '知识点：上线批准', stem: 'eBRS 上线批准前，哪些证据必须完整？', options: ['URS 可追溯矩阵', '测试通过与偏差关闭', '权限/审计追踪复核', '只看供应商承诺'], correct: [0, 1, 2], insight: '上线批准依赖需求追溯、测试结果和关键控制证明。', evidence: '验证总结报告', deliverable: '上线批准意见', choicePrompt: '选择上线前的必备证据。' },
    ],
    boss: [
      { kind: 'case', chapter: 'Boss / CSV 上线裁定', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: 'Boss 要求“先上线，审计追踪以后再测”。哪些反击成立？', options: ['审计追踪是关键控制必须验证', '未关闭关键偏差不得上线', '形成上线风险接受需质量批准', '供应商说能用即可'], correct: [0, 1, 2], insight: '高难点在于把系统功能映射到 GMP 关键控制。', evidence: 'CSV 终场卷宗', deliverable: '上线裁定', choicePrompt: '选择能阻止未验证上线的证据。' },
      { kind: 'sequence', chapter: 'Boss / 验证生命周期', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: 'CSV 生命周期顺序应为？', options: ['验证总结与上线批准', 'URS 与风险评估', '配置/权限设计', 'IQ/OQ/PQ 或等效测试'], correct: [1, 2, 3, 0], insight: 'CSV 不是一次截图，而是从需求到测试到批准的生命周期。', evidence: 'CSV 生命周期记录', deliverable: '生命周期核验', choicePrompt: '按顺序完成验证生命周期。' },
      { kind: 'multiple', chapter: 'Boss / 数据完整性控制', sceneNumber: 5, speaker: 3, taskLabel: 'Boss 核验', stem: 'eBRS 中支持数据完整性的系统控制包括？', options: ['审计追踪', '电子签名', '权限分离', '共享管理员账号'], correct: [0, 1, 2], insight: '电子记录系统要保障可归属、完整、可追溯。', evidence: '审计追踪与电子签名测试', deliverable: 'DI 控制核验', choicePrompt: '选出电子记录关键控制。' },
      { kind: 'case', chapter: 'Boss / 变更后验证', sceneNumber: 5, speaker: 2, taskLabel: 'Boss 核验', stem: '上线前修改批记录模板，哪些动作应追加？', options: ['评估模板变更影响', '更新脚本并回归测试', '复核相关培训', '直接沿用旧测试结论'], correct: [0, 1, 2], insight: '验证状态会被配置和模板变更影响，需要回归确认。', evidence: '模板变更记录', deliverable: '回归测试意见', choicePrompt: '判断模板变更后的验证动作。' },
      { kind: 'single', chapter: 'Boss / 权限风险', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: '生产人员拥有放行审批权限，最直接违反什么控制原则？', options: ['职责分离和最小权限', '先进先出', '清洁保持时间', '温度分布'], correct: [0], insight: '权限设置应防止同一角色完成不相容职责。', evidence: '权限矩阵缺陷', deliverable: '权限风险判定', choicePrompt: '识别权限缺陷知识点。' },
      { kind: 'sequence', chapter: 'Boss / 上线闭环', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '关键验证偏差关闭后的上线顺序应为？', options: ['质量批准上线', '复测并确认通过', '更新验证总结', '执行上线后监控'], correct: [1, 2, 0, 3], insight: '上线批准后仍需进入持续监控，验证生命周期才完整。', evidence: '上线批准包', deliverable: '上线后监控计划', choicePrompt: '按顺序完成系统上线。' },
    ],
  },
  6: {
    story: [
      { kind: 'single', chapter: '静默序列 / ALCOA+', sceneNumber: 1, speaker: 0, points: p, taskLabel: '知识点：数据完整性', stem: 'HPLC 审计追踪出现空窗期，首先受损的是哪类数据完整性要求？', options: ['可归属和完整性', '仓储面积', '包装美观', '发运路线'], correct: [0], insight: '审计追踪缺口会影响数据是否完整、可追溯、可归属。', evidence: '审计追踪导出', deliverable: 'DI 风险启动单', choicePrompt: '识别审计追踪空窗的知识点。' },
      { kind: 'multiple', chapter: '账号裂痕 / 账号管理', sceneNumber: 2, speaker: 3, points: p, taskLabel: '知识点：可归属性', stem: '共用账号风险评价应覆盖哪些内容？', options: ['操作无法归属', '权限过宽', '密码管理失控', '试剂颜色'], correct: [0, 1, 2], insight: '账号管理是 ALCOA+ 中可归属性和安全性的基础。', evidence: '账号权限矩阵', deliverable: '账号风险评价', choicePrompt: '选择共用账号的核心风险。' },
      { kind: 'case', chapter: '重积分室 / 原始数据', sceneNumber: 3, speaker: 1, points: p, taskLabel: '知识点：重积分理由', stem: '检验员多次重积分但未记录理由。哪些处置正确？', options: ['保留原始积分和重积分记录', '要求科学理由和复核', '评估对报告结果影响', '删除最早积分'], correct: [0, 1, 2], insight: '数据处理可修正，但原始数据和理由必须可重建。', evidence: '原始序列和重积分记录', deliverable: '数据处理复核意见', choicePrompt: '用案例要点判断重积分处置。' },
      { kind: 'sequence', chapter: '历史回顾 / 影响范围', sceneNumber: 4, speaker: 2, points: p, taskLabel: '知识点：历史回顾', stem: '发现审计追踪长期关闭后，正确回顾顺序是？', options: ['确定关闭期间与方法范围', '形成已放行批次风险结论', '保全原始数据备份', '复核历史报告和异常修改'], correct: [2, 0, 3, 1], insight: '历史回顾先保全数据，再划定期间和方法，最后形成批次风险结论。', evidence: '历史数据回顾表', deliverable: '受影响数据清单', choicePrompt: '按顺序完成数据历史回顾。' },
      { kind: 'multiple', chapter: '数据封印 / 周期审核', sceneNumber: 5, speaker: 4, points: p, taskLabel: '知识点：周期性审核', stem: '数据完整性 CAPA 应包括哪些长期控制？', options: ['恢复并锁定审计追踪', '周期性数据审核', '权限定期复核', '只打印最终报告'], correct: [0, 1, 2], insight: 'DI 闭环要把技术控制和周期审核固化。', evidence: '周期性数据审核计划', deliverable: 'DI CAPA 计划', choicePrompt: '选择数据完整性长期控制。' },
    ],
    boss: [
      { kind: 'case', chapter: 'Boss / ALCOA+ 答辩', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: 'Boss 要求只提交最终合格图谱。哪些反击符合 ALCOA+？', options: ['提交原始序列和处理过程', '保留审计追踪证据', '解释重积分科学理由', '隐藏异常序列'], correct: [0, 1, 2], insight: '高难点是证明结果能被完整重建，而不是只看最终数字。', evidence: 'DI 终场卷宗', deliverable: 'ALCOA+ 裁定', choicePrompt: '选择能击破选择性报告的证据。' },
      { kind: 'sequence', chapter: 'Boss / 数据保全', sceneNumber: 5, speaker: 3, taskLabel: 'Boss 核验', stem: '数据可靠性专项调查的正确顺序是？', options: ['评估历史批次影响', '立即保全原始数据', '恢复控制并验证', '锁定缺陷范围'], correct: [1, 3, 0, 2], insight: 'DI 调查先保全，再定范围和影响，最后恢复并验证控制。', evidence: '专项调查计划', deliverable: 'DI 调查路径', choicePrompt: '按顺序完成数据可靠性调查。' },
      { kind: 'multiple', chapter: 'Boss / 审计追踪', sceneNumber: 5, speaker: 3, taskLabel: 'Boss 核验', stem: '审计追踪复核应重点关注哪些事件？', options: ['删除/修改数据', '重积分和重测', '时间修改或权限变更', '仪器外壳颜色'], correct: [0, 1, 2], insight: '审计追踪复核关注可能改变数据含义和可归属性的事件。', evidence: '审计追踪复核表', deliverable: '追踪复核结论', choicePrompt: '选出审计追踪关键事件。' },
      { kind: 'case', chapter: 'Boss / 已放行批次', sceneNumber: 5, speaker: 2, taskLabel: 'Boss 核验', stem: '审计追踪关闭期间有多个批次已放行，哪些动作合理？', options: ['回顾相关原始数据', '评价产品质量风险', '必要时升级市场风险', '只修复当前账号'], correct: [0, 1, 2], insight: 'DI 缺陷影响已放行批次时，不能只做当前系统整改。', evidence: '已放行批次回顾', deliverable: '市场风险建议', choicePrompt: '判断已放行批次处置组合。' },
      { kind: 'single', chapter: 'Boss / 账号缺陷', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: '共享账号造成的最核心风险是？', options: ['无法证明谁执行了关键操作', '样品更容易溶解', '仓库温度上升', '设备更易清洁'], correct: [0], insight: '可归属性是实验室数据可靠性的底线。', evidence: '账号权限缺陷', deliverable: '账号风险判定', choicePrompt: '识别共享账号的核心风险。' },
      { kind: 'sequence', chapter: 'Boss / DI 闭环', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: 'DI CAPA 关闭顺序应为？', options: ['周期性审核证明有效', '批准权限和审计追踪整改', '执行培训与系统配置', '关闭 CAPA'], correct: [1, 2, 0, 3], insight: '数据完整性 CAPA 关闭需要证明技术控制和人员执行均有效。', evidence: 'DI CAPA 关闭包', deliverable: '关闭批准', choicePrompt: '按顺序完成数据封印。' },
    ],
  },
  8: {
    story: [
      { kind: 'single', chapter: '灌装警戒 / 环境趋势', sceneNumber: 1, speaker: 0, points: p, taskLabel: '知识点：无菌趋势', stem: 'A级区沉降菌趋势接近警戒线时，最先应做什么？', options: ['继续灌装直到检验失败', '控制批次并启动环境趋势评估', '只更换记录表', '忽略趋势'], correct: [1], insight: '无菌保障关注趋势预警，不能只等成品无菌检查。', evidence: '环境监测趋势', deliverable: '无菌趋势评估启动单', choicePrompt: '识别无菌趋势预警动作。' },
      { kind: 'multiple', chapter: '压差走廊 / 屏障控制', sceneNumber: 2, speaker: 3, points: p, taskLabel: '知识点：压差与屏障', stem: '评价无菌屏障时，应同时查看哪些记录？', options: ['压差趋势', '人员进出记录', '门开启/报警记录', '休息室菜单'], correct: [0, 1, 2], insight: '无菌屏障由压差、人员行为和报警响应共同维持。', evidence: '压差与人员进出记录', deliverable: '屏障控制复核表', choicePrompt: '选择无菌屏障控制证据。' },
      { kind: 'case', chapter: '干预回放 / 无菌干预', sceneNumber: 3, speaker: 2, points: p, taskLabel: '知识点：干预管理', stem: '灌装中发生未记录干预。哪些处理可以批准？', options: ['回看视频和批记录', '评价干预对暴露风险影响', '必要时隔离相关时段产品', '事后补写为常规操作'], correct: [0, 1, 2], insight: '无菌干预必须记录、评价并关联暴露产品。', evidence: '无菌干预记录', deliverable: '干预影响评价', choicePrompt: '用案例要点判断无菌干预处置。' },
      { kind: 'sequence', chapter: '批次暴露 / APS', sceneNumber: 4, speaker: 1, points: p, taskLabel: '知识点：无菌模拟', stem: '趋势异常可能影响无菌保障时，正确评价顺序是？', options: ['复核 APS/培养基模拟适用性', '锁定暴露批次和时段', '汇总 EM 与干预记录', '形成批次质量建议'], correct: [1, 2, 0, 3], insight: '无菌评价要先界定暴露，再结合 EM、干预和 APS 证据。', evidence: '无菌模拟与批次暴露清单', deliverable: '暴露风险评价', choicePrompt: '按顺序完成无菌暴露评价。' },
      { kind: 'multiple', chapter: '无菌重筑 / CCS', sceneNumber: 5, speaker: 4, points: p, taskLabel: '知识点：污染控制策略', stem: '无菌 CAPA 应纳入哪些污染控制策略要素？', options: ['干预培训和资格确认', '压差报警升级', 'EM 趋势复核', '只等待无菌检查'], correct: [0, 1, 2], insight: '污染控制策略是系统性预防，而不是依赖终检。', evidence: '污染控制策略更新', deliverable: '无菌 CAPA 计划', choicePrompt: '选择无菌保障闭环措施。' },
    ],
    boss: [
      { kind: 'case', chapter: 'Boss / 无菌保障答辩', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: 'Boss 声称“成品无菌检查合格就能放行”。哪些反击成立？', options: ['评价 EM 趋势和干预', '锁定暴露批次风险', '复核 APS/屏障控制', '只看终检结果'], correct: [0, 1, 2], insight: '高难点是理解无菌检查不能替代过程无菌保障。', evidence: '无菌终场卷宗', deliverable: '无菌放行裁定', choicePrompt: '选择击破终检依赖的证据。' },
      { kind: 'sequence', chapter: 'Boss / 暴露评价', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '无菌暴露风险评价的正确顺序是？', options: ['形成批次处置和 CAPA', '确定异常时段和产品范围', '复核干预/压差/EM 证据', '判断 APS 是否仍支持工艺'], correct: [1, 2, 3, 0], insight: '无菌 Boss 题要求把异常时段、证据和模拟保障串起来。', evidence: '暴露评价路径', deliverable: '无菌风险结论', choicePrompt: '按顺序完成无菌暴露审判。' },
      { kind: 'multiple', chapter: 'Boss / 干预风险', sceneNumber: 5, speaker: 2, taskLabel: 'Boss 核验', stem: '未计划干预会提高哪些风险？', options: ['人员行为污染', 'A级区暴露时间增加', '记录无法追溯', '标签颜色变化'], correct: [0, 1, 2], insight: '干预风险来自人员、暴露和记录三条线。', evidence: '干预风险评估', deliverable: '干预风险判定', choicePrompt: '选出未计划干预的核心风险。' },
      { kind: 'case', chapter: 'Boss / 趋势升级', sceneNumber: 5, speaker: 3, taskLabel: 'Boss 核验', stem: 'EM 结果未超行动限但连续接近警戒线，哪些动作合理？', options: ['启动趋势调查', '复核清洁和人员行为', '评估预防性 CAPA', '等待超行动限再处理'], correct: [0, 1, 2], insight: '无菌系统强调趋势预警和预防控制。', evidence: 'EM 趋势图', deliverable: '趋势调查意见', choicePrompt: '判断警戒趋势如何升级。' },
      { kind: 'single', chapter: 'Boss / APS 适用性', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: '重大新干预未被培养基模拟覆盖，最准确的风险是？', options: ['APS 代表性不足', '仓库库存不足', '清洁剂太多', '包装尺寸不一致'], correct: [0], insight: 'APS 必须覆盖常规和代表性干预，才能支持无菌工艺。', evidence: 'APS 方案', deliverable: '模拟适用性判定', choicePrompt: '识别 APS 代表性缺口。' },
      { kind: 'sequence', chapter: 'Boss / CCS 闭环', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '污染控制策略整改关闭顺序应为？', options: ['趋势复核证明风险下降', '批准 CCS 更新', '执行人员/压差/干预整改', '批准关闭'], correct: [1, 2, 0, 3], insight: 'CCS 关闭必须证明屏障、行为和趋势均改善。', evidence: 'CCS CAPA 关闭包', deliverable: '关闭建议', choicePrompt: '按顺序完成无菌最后一击。' },
    ],
  },
  9: {
    story: [
      { kind: 'single', chapter: '压差闪烁 / 设施偏差', sceneNumber: 1, speaker: 0, points: p, taskLabel: '知识点：压差偏差', stem: '洁净区压差连续波动时，第一项质量动作是？', options: ['关闭报警避免干扰', '启动设施偏差并评估影响', '等下次校准', '只通知保洁'], correct: [1], insight: '压差波动可能影响洁净屏障，应作为设施偏差管理。', evidence: '压差报警日志', deliverable: '设施偏差启动单', choicePrompt: '识别压差异常第一步。' },
      { kind: 'multiple', chapter: '风量迷图 / HVAC 趋势', sceneNumber: 2, speaker: 3, points: p, taskLabel: '知识点：HVAC 趋势', stem: '复核 HVAC 失衡，应同时查看哪些记录？', options: ['房间压差趋势', '风量/过滤器压差', '报警确认记录', '墙面装饰风格'], correct: [0, 1, 2], insight: 'HVAC 评价要关联压差、风量、过滤器和报警响应。', evidence: 'HVAC 趋势记录', deliverable: '设施趋势复核表', choicePrompt: '选择 HVAC 趋势证据。' },
      { kind: 'case', chapter: '门禁证词 / 人流物流', sceneNumber: 3, speaker: 2, points: p, taskLabel: '知识点：洁净边界', stem: '门禁记录显示压差波动期间频繁开门。哪些处理正确？', options: ['核对人员/物料进出', '评价房间级别边界影响', '必要时控制相关批次', '把报警解释为偶发噪声'], correct: [0, 1, 2], insight: '洁净边界由设施状态和人员物流行为共同影响。', evidence: '门禁与批次记录', deliverable: '边界影响评价', choicePrompt: '用案例要点判断洁净边界。' },
      { kind: 'sequence', chapter: '区域追溯 / 影响范围', sceneNumber: 4, speaker: 1, points: p, taskLabel: '知识点：区域影响', stem: '同一 HVAC 系统服务多房间时，正确追溯顺序是？', options: ['形成生产批次影响结论', '锁定服务区域和时间段', '关联房间活动和批次', '复核环境监测结果'], correct: [1, 2, 3, 0], insight: '设施影响范围由系统服务区域、时间段和生产活动共同确定。', evidence: '服务区域图 / 批次台账', deliverable: '区域影响清单', choicePrompt: '按顺序完成区域追溯。' },
      { kind: 'multiple', chapter: '屏障复位 / 设施 CAPA', sceneNumber: 5, speaker: 4, points: p, taskLabel: '知识点：设施闭环', stem: 'HVAC 压差偏差 CAPA 应包括哪些措施？', options: ['过滤器/风量复核', '报警升级和确认时限', '门禁行为控制', '永久关闭报警'], correct: [0, 1, 2], insight: '设施 CAPA 要同时覆盖设备状态、报警和使用行为。', evidence: '设施 CAPA 计划', deliverable: '屏障复位报告', choicePrompt: '选择设施偏差闭环措施。' },
    ],
    boss: [
      { kind: 'case', chapter: 'Boss / 洁净屏障答辩', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: 'Boss 说“传感器偶发噪声，不用调查”。哪些反击成立？', options: ['复核压差趋势和报警', '评价服务区域批次影响', '确认过滤器/风量状态', '直接关闭报警'], correct: [0, 1, 2], insight: '高难点是把设施趋势转换为污染控制风险。', evidence: 'HVAC 终场卷宗', deliverable: '设施风险裁定', choicePrompt: '选择击破偶发噪声说法的证据。' },
      { kind: 'sequence', chapter: 'Boss / 设施影响评价', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '压差失衡影响评价的正确顺序是？', options: ['形成批次与区域处置建议', '确定失衡时段和房间级别', '复核风量/过滤器/门禁', '关联生产批次和 EM 趋势'], correct: [1, 2, 3, 0], insight: '设施风险评价要从时间和空间边界进入批次结论。', evidence: '设施影响评价路径', deliverable: '区域处置建议', choicePrompt: '按顺序完成设施影响评价。' },
      { kind: 'multiple', chapter: 'Boss / HEPA 与过滤器', sceneNumber: 5, speaker: 3, taskLabel: 'Boss 核验', stem: '过滤器压差异常后，应核对哪些知识点？', options: ['HEPA 完整性或维护状态', '风量平衡', '报警记录', '员工生日'], correct: [0, 1, 2], insight: '过滤器异常可能破坏洁净区风量和过滤屏障。', evidence: '过滤器维护记录', deliverable: '过滤器风险判定', choicePrompt: '选出过滤器异常复核点。' },
      { kind: 'case', chapter: 'Boss / 报警管理', sceneNumber: 5, speaker: 2, taskLabel: 'Boss 核验', stem: '报警被频繁确认但未调查，哪些 CAPA 可批准？', options: ['设定报警分级和升级时限', '复训报警响应职责', '定期趋势复核', '降低报警声音'], correct: [0, 1, 2], insight: '报警管理 CAPA 要解决响应机制，而不是降低提示。', evidence: '报警管理记录', deliverable: '报警 CAPA', choicePrompt: '判断报警管理整改组合。' },
      { kind: 'single', chapter: 'Boss / 批次状态', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: '压差失衡期间生产的批次，未评价前应处于什么状态？', options: ['待判定/受控', '自动合格', '无需记录', '销售优先'], correct: [0], insight: '设施偏差影响批次必须先受控再判定。', evidence: '批次状态清单', deliverable: '状态裁定', choicePrompt: '识别设施偏差下的批次状态。' },
      { kind: 'sequence', chapter: 'Boss / 屏障闭环', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '洁净屏障 CAPA 关闭顺序应为？', options: ['验证趋势稳定', '批准设施和报警整改', '执行维护/校准/培训', '关闭 CAPA'], correct: [1, 2, 0, 3], insight: '屏障复位必须用趋势稳定证明整改有效。', evidence: '屏障 CAPA 关闭包', deliverable: '关闭批准', choicePrompt: '按顺序完成屏障复位。' },
    ],
  },
  10: {
    story: [
      { kind: 'single', chapter: '风暴预警 / 变更分级', sceneNumber: 1, speaker: 0, points: p, taskLabel: '知识点：变更控制启动', stem: '辅料供应商和关键参数同时变更时，首先应做什么？', options: ['先执行再观察', '冻结实施并启动变更分级评估', '只通知采购', '直接更新标签'], correct: [1], insight: '重大或复合变更必须先评估和批准，再实施。', evidence: '变更申请与批准记录', deliverable: '变更启动评估', choicePrompt: '识别变更控制第一步。' },
      { kind: 'multiple', chapter: '评估缺口 / 影响评价', sceneNumber: 2, speaker: 1, points: p, taskLabel: '知识点：影响评估', stem: '变更影响评估应覆盖哪些维度？', options: ['物料关键属性', '工艺参数和验证状态', '批记录/质量标准', '供应商广告语'], correct: [0, 1, 2], insight: '变更影响评估要覆盖物料、工艺、文件和验证状态。', evidence: '风险评估矩阵', deliverable: '影响评估报告', choicePrompt: '选择变更影响评价维度。' },
      { kind: 'case', chapter: '现场回放 / 实施控制', sceneNumber: 3, speaker: 2, points: p, taskLabel: '知识点：实施前批准', stem: '现场已经按新参数试生产，但变更未批准。哪些处理正确？', options: ['隔离试生产批次', '记录未批准实施偏差', '补做影响评价和质量批准', '将日期改成批准后'], correct: [0, 1, 2], insight: '未批准变更已实施时，要按偏差和变更双线控制。', evidence: '试生产批记录', deliverable: '未批准实施处置', choicePrompt: '用案例要点处理未批准变更。' },
      { kind: 'sequence', chapter: '批次边界 / 已实施范围', sceneNumber: 4, speaker: 3, points: p, taskLabel: '知识点：变更追溯', stem: '发现变更已影响多个批次，正确追溯顺序是？', options: ['形成批次处置结论', '锁定变更实施日期和批次', '复核关键质量结果', '评价验证/稳定性需求'], correct: [1, 2, 3, 0], insight: '变更追溯先定实施范围，再评价质量和验证需求。', evidence: '实施后确认报告', deliverable: '已实施批次清单', choicePrompt: '按顺序完成变更追溯。' },
      { kind: 'multiple', chapter: '变更封存 / 有效性确认', sceneNumber: 5, speaker: 4, points: p, taskLabel: '知识点：实施后确认', stem: '变更批准后，实施后确认应包括哪些内容？', options: ['首批/连续批趋势', '关键属性比较', '文件和培训生效', '只看生产效率'], correct: [0, 1, 2], insight: '变更不是批准即结束，实施后还要确认效果和风险。', evidence: '实施后确认报告', deliverable: '变更关闭建议', choicePrompt: '选择实施后确认内容。' },
    ],
    boss: [
      { kind: 'case', chapter: 'Boss / 未控变更答辩', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: 'Boss 要求“供应商和参数变更已执行，报告写无明显影响”。哪些反击成立？', options: ['补做跨部门影响评估', '隔离并评价已实施批次', '确认验证和稳定性需求', '直接接受无影响结论'], correct: [0, 1, 2], insight: '高难点是识别复合变更对物料、工艺和批次的联动影响。', evidence: '变更终场卷宗', deliverable: '变更裁定', choicePrompt: '选择能击破无影响结论的证据。' },
      { kind: 'sequence', chapter: 'Boss / 变更流程', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '规范变更控制流程顺序是？', options: ['批准实施', '变更申请与分级', '影响评估和验证策略', '实施后效果确认'], correct: [1, 2, 0, 3], insight: '变更控制必须先评估批准，再实施确认。', evidence: '变更流程图', deliverable: '流程核验', choicePrompt: '按顺序完成变更控制流程。' },
      { kind: 'multiple', chapter: 'Boss / 验证联动', sceneNumber: 5, speaker: 3, taskLabel: 'Boss 核验', stem: '供应商粒度变化可能触发哪些验证或确认？', options: ['工艺参数确认', '溶出/含量均匀度趋势', '物料标准复核', '办公桌位置'], correct: [0, 1, 2], insight: '物料属性变化可能改变工艺表现和质量属性。', evidence: '物料属性比较', deliverable: '验证联动意见', choicePrompt: '选出物料变更的联动验证点。' },
      { kind: 'case', chapter: 'Boss / 文件同步', sceneNumber: 5, speaker: 2, taskLabel: 'Boss 核验', stem: '变更批准后批记录模板未同步，哪些 CAPA 正确？', options: ['修订模板并版本控制', '培训相关岗位', '复核已执行批记录差异', '口头通知即可'], correct: [0, 1, 2], insight: '变更批准必须落实到文件、培训和执行记录。', evidence: '批记录模板变更', deliverable: '文件同步 CAPA', choicePrompt: '判断文件同步缺口的整改。' },
      { kind: 'single', chapter: 'Boss / 分级判断', sceneNumber: 5, speaker: 1, taskLabel: 'Boss 核验', stem: '同时改变关键辅料供应商和关键工艺参数，通常应按什么思路管理？', options: ['较高风险变更或重大变更评估', '无需评估', '只做采购登记', '仅更换标签'], correct: [0], insight: '复合变更要按更高风险等级组织评估。', evidence: '变更分级表', deliverable: '分级裁定', choicePrompt: '识别复合变更等级。' },
      { kind: 'sequence', chapter: 'Boss / 变更关闭', sceneNumber: 5, speaker: 4, taskLabel: 'Boss 核验', stem: '变更 CAPA 关闭顺序应为？', options: ['确认实施后趋势达标', '批准变更与验证策略', '执行文件/培训/验证', '批准关闭'], correct: [1, 2, 0, 3], insight: '变更关闭要证明批准内容已经落地且质量趋势可接受。', evidence: '变更关闭包', deliverable: '关闭批准', choicePrompt: '按顺序完成变更风暴封印。' },
    ],
  },
  11: {
    story: [
      { kind: 'single', chapter: '体系终审 / 总测启动', sceneNumber: 1, speaker: 0, points: p, taskLabel: '知识点：全项目覆盖', stem: '最终体系诊断会战开始前，最重要的作答策略是？', options: ['只做熟悉章节', '按十个项目覆盖证据链', '跳过薄弱知识点', '只看题目长度'], correct: [1], insight: '最终 Boss 考查跨章节迁移，不能只依赖单章记忆。', evidence: '全项目题库', deliverable: '总测作答计划', choicePrompt: '选择最终总测启动策略。' },
      { kind: 'multiple', chapter: '体系终审 / 系统趋势', sceneNumber: 3, speaker: 1, points: p, taskLabel: '知识点：年度质量回顾', stem: '年度质量回顾中，哪些信号提示系统性风险？', options: ['同类偏差复发', '供应商/工艺趋势漂移', 'CAPA 有效性不足', '页面主题变化'], correct: [0, 1, 2], insight: 'AQR/PQR 关注趋势、复发和系统有效性。', evidence: '年度质量回顾趋势', deliverable: '系统风险清单', choicePrompt: '选择系统趋势信号。' },
      { kind: 'case', chapter: '体系终审 / 知识迁移', sceneNumber: 5, speaker: 3, points: p, taskLabel: '知识点：跨章节联动', stem: '一个批次同时涉及变更、数据完整性和放行压力。哪些处理原则可迁移？', options: ['先控制批次状态', '保全原始证据', '完成影响评价后质量批准', '只挑一个问题处理'], correct: [0, 1, 2], insight: '跨章节题的核心仍是状态控制、证据保全和质量决策。', evidence: '跨项目案例卷宗', deliverable: '迁移判断记录', choicePrompt: '用案例要点完成知识迁移。' },
      { kind: 'sequence', chapter: '体系终审 / 诊断顺序', sceneNumber: 8, speaker: 4, points: p, taskLabel: '知识点：体系诊断', stem: '完成最终体系诊断的推荐顺序是？', options: ['锁定风险信号', '评价产品/患者影响', '追溯系统根因', '提出 CAPA 与有效性指标'], correct: [0, 1, 2, 3], insight: '体系诊断由风险信号进入影响、根因和 CAPA。', evidence: '体系诊断框架', deliverable: '诊断路径图', choicePrompt: '按顺序完成体系诊断。' },
      { kind: 'multiple', chapter: '体系终审 / 结论批准', sceneNumber: 11, speaker: 4, points: p, taskLabel: '知识点：最终结论', stem: '最终结论可批准前，应同时满足哪些条件？', options: ['证据可重建', '风险评价完整', 'CAPA 有有效性指标', '只给最终分数'], correct: [0, 1, 2], insight: '最终通关标准是证据、风险和措施均可审核。', evidence: '最终 Boss 诊断报告', deliverable: '最终批准建议', choicePrompt: '选择最终批准条件。' },
    ],
    boss: [],
  },
}

function seedFromDraft(project: ProjectDefinition, prefix: 'S' | 'B', index: number, draft: MissionQuestionDraft): MissionQuestionSeed {
  return {
    ...draft,
    id: `P${project.id}-${prefix}${String(index + 1).padStart(2, '0')}`,
    speaker: project.npcs[draft.speaker] ?? project.npcs[0],
  }
}

function storyBankFor(project: ProjectDefinition) {
  return PROJECT_KNOWLEDGE_BANKS[project.id]?.story ?? PROJECT_KNOWLEDGE_BANKS[11].story
}

function bossBankFor(project: ProjectDefinition) {
  return PROJECT_KNOWLEDGE_BANKS[project.id]?.boss ?? []
}

function buildGenericStoryQuestions(project: ProjectDefinition, track: EducationTrack, carrier: CarrierCase): ScenarioQuestion[] {
  return storyBankFor(project)
    .map((draft, index) => seedFromDraft(project, 'S', index, draft))
    .map(createQuestion)
    .map(question => enrichQuestion(project, question, carrier, track))
}

function buildGenericBossQuestions(project: ProjectDefinition, track: EducationTrack, carrier: CarrierCase): ScenarioQuestion[] {
  const seeds = bossBankFor(project)
  return seeds.map((draft, index) => seedFromDraft(project, 'B', index, draft)).map(createQuestion).map(question => ({
    ...enrichQuestion(project, question, carrier, track),
    sceneMood: project.finalBoss ? '终局王城 · 全项目随机总测' : `${project.bossName}登场`,
    narration: project.finalBoss
      ? `最终 Boss 覆盖全部项目任务。当前题型规则：单选50题各0.5分、多选20题各2分、判断20题各0.5分、简答5题各5分，共100分。`
      : `${project.bossName}从${project.caseFocus}的证据缺口中成形，只有可批准的质量判断能造成伤害。`,
    dialogue: [
      { speaker: '旁白', line: `${project.bossTitle}挡在结案门前，要求你用证据回答。`, tone: 'narrator' },
      { speaker: question.speaker.name, title: question.speaker.title, line: track === 'college' ? '按审核清单逐项确认。' : '请说明证据如何支撑风险判断。', tone: 'npc' },
      { speaker: assignedRoleLabel(track), line: '我会用证据链、影响评价和有效性标准完成核验。', tone: 'player' },
    ],
  }))
}

function buildFinalBossQuestions(project: ProjectDefinition, track: EducationTrack, carrier: CarrierCase): ScenarioQuestion[] {
  const regularProjects = PROJECT_MISSIONS.filter(item => !item.finalBoss)
  const difficulty = (index: number) => {
    const bucket = index % 10
    return bucket < 2 ? '难' : bucket < 6 ? '中' : '易'
  }
  const make = (index: number, kind: ScenarioQuestionKind, typeLabel: string, stem: string, options: string[], correct: number[], points: number) => {
    const source = regularProjects[index % regularProjects.length]
    const speaker = project.npcs[index % project.npcs.length]
    return createQuestion({
      id: `FINAL-${String(index + 1).padStart(3, '0')}`,
      kind,
      chapter: `最终总测 / ${typeLabel} / ${difficulty(index)}`,
      sceneNumber: (index % 11) + 1,
      speaker,
      taskLabel: `${typeLabel} · ${points} 分`,
      stem: `${source.curriculum}：${stem}`,
      options,
      correct,
      insight: `本题来自项目${source.id}“${source.title}”，用于验证全项目知识迁移。`,
      evidence: source.keyEvidence[index % source.keyEvidence.length],
      deliverable: '最终总测作答记录',
      choicePrompt: kind === 'sequence'
        ? `按顺序点击${difficulty(index)}难度${typeLabel}的处置步骤。`
        : `请选择${difficulty(index)}难度${typeLabel}的最佳作答。`,
      points,
    })
  }

  const seeds: ScenarioQuestion[] = []
  for (let i = 0; i < 50; i += 1) {
    const source = regularProjects[i % regularProjects.length]
    seeds.push(make(i, 'single', '单选题', `${source.riskSignal}时，首要质量动作是什么？`, [source.wrongShortcut, source.firstAction, '等待下一批再处理', '只做口头说明'], [1], 0.5))
  }
  for (let i = 0; i < 15; i += 1) {
    const source = regularProjects[i % regularProjects.length]
    seeds.push(make(50 + i, 'multiple', '多选题', `围绕${source.caseFocus}，哪些证据可以支持结论？`, [source.keyEvidence[0], source.keyEvidence[1], source.keyEvidence[2], '无来源口头保证'], [0, 1, 2], 2))
  }
  for (let i = 0; i < 5; i += 1) {
    const source = regularProjects[(i + 5) % regularProjects.length]
    seeds.push(make(65 + i, 'sequence', '排序题', `${source.riskSignal}后，终场处置的正确顺序是什么？`, ['形成质量处置和 CAPA', '保全证据并暂停放行', '界定同暴露范围', '复核关键质量结果'], [1, 2, 3, 0], 2))
  }
  for (let i = 0; i < 20; i += 1) {
    const source = regularProjects[i % regularProjects.length]
    seeds.push(make(70 + i, 'single', '判断题', `“${source.wrongShortcut}”可以作为合规结案方式。`, ['正确', '错误'], [1], 0.5))
  }
  for (let i = 0; i < 5; i += 1) {
    const source = regularProjects[i % regularProjects.length]
    seeds.push(make(90 + i, 'case', '简答题', `请选出${source.capaMove}的简答要点组合。`, ['风险边界', '证据链', 'CAPA 有效性', '跳过影响评价'], [0, 1, 2], 5))
  }

  return seeds.map(question => ({
    ...enrichQuestion(project, question, carrier, track),
    sceneMood: '终局王城 · 全项目随机总测',
    narration: `最终总测题阵覆盖十个常规项目，当前采用 50 道单选、15 道多选、5 道排序、20 道判断、5 道简答要点题，共 95 题、100 分。难中易按 2:4:4 分布。`,
    dialogue: [
      { speaker: '旁白', line: '王城大厅的题阵逐层亮起，每一道题都来自此前项目的关键决策。', tone: 'narrator' },
      { speaker: question.speaker.name, title: question.speaker.title, line: '不要只背答案，要判断证据、风险和批准路径是否成立。', tone: 'npc' },
      { speaker: assignedRoleLabel(track), line: '我会按全项目证据链完成最终诊断。', tone: 'player' },
    ],
  }))
}

export function getProjectDefinition(projectId: number) {
  return PROJECT_MISSIONS.find(project => project.id === projectId) ?? PROJECT_MISSIONS[0]
}

export function buildProjectStoryQuestions(project: ProjectDefinition, track: EducationTrack, carrier: CarrierCase): ScenarioQuestion[] {
  return project.id === 7 ? buildProject7StoryQuestions(track, carrier) : buildGenericStoryQuestions(project, track, carrier)
}

export function buildProjectBossQuestions(project: ProjectDefinition, track: EducationTrack, carrier: CarrierCase): ScenarioQuestion[] {
  if (project.finalBoss) return buildFinalBossQuestions(project, track, carrier)
  return project.id === 7 ? buildProject7BossQuestions(track, carrier) : buildGenericBossQuestions(project, track, carrier)
}

export function medalFromScore(score: number): ProjectMedal {
  if (score >= 90) return 'gold'
  if (score >= 80) return 'silver'
  if (score >= 60) return 'bronze'
  return 'none'
}

export function medalRank(medal: ProjectMedal) {
  return medal === 'gold' ? 3 : medal === 'silver' ? 2 : medal === 'bronze' ? 1 : 0
}

export function medalMultiplier(medal: ProjectMedal) {
  if (medal === 'gold') return 1.7
  if (medal === 'silver') return 1.4
  if (medal === 'bronze') return 1
  return 0
}

export function creditForMedal(medal: ProjectMedal) {
  return medal === 'none' ? 0 : GAME_PROJECT_BASE_CREDIT
}

export function baseCreditForProjectMedal(projectId: number, medal: ProjectMedal) {
  if (medal === 'none') return 0

  const project = PROJECT_MISSIONS.find(item => item.id === projectId)
  if (!project) return 0
  return project.finalBoss ? FINAL_BOSS_BASE_CREDIT : GAME_PROJECT_BASE_CREDIT
}

export function medalBonusCreditForProject(projectId: number, medal: ProjectMedal) {
  const project = PROJECT_MISSIONS.find(item => item.id === projectId)
  if (!project) return 0
  return project.finalBoss ? FINAL_BOSS_MEDAL_BONUS[medal] : REGULAR_PROJECT_MEDAL_BONUS[medal]
}

export function creditForProjectMedal(projectId: number, medal: ProjectMedal) {
  return Number((baseCreditForProjectMedal(projectId, medal) + medalBonusCreditForProject(projectId, medal)).toFixed(1))
}

export function answerKeyFor(questions: ScenarioQuestion[]) {
  return questions.map(question => `${question.id}: ${question.correct.join('、')}`)
}
