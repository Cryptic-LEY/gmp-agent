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
  finalExamQuestionCountNote: '题型配置为单选50、多选20、判断20、简答5，共95题、100分；若必须100题，建议补5道0分情境判断或调整题型数量。',
}

export const GAME_PROJECT_BASE_CREDIT = COURSE_CREDIT_RULES.gameProjectRegular / REGULAR_GAME_PROJECT_COUNT

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
    position: { left: '48.1%', top: '40.4%' },
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
    labelSide: 'left',
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
    position: { left: '40.1%', top: '34.5%' },
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
    missionCode: 'FINAL BOSS',
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
    scenes: scenes(['FINAL-01', 'FINAL-02', 'FINAL-03', 'FINAL-04', 'FINAL-05'], ['王城开门', '随机题阵', '难度天平', '全局诊断', '课程判定']),
  },
]

function createQuestion(seed: MissionQuestionSeed): ScenarioQuestion {
  return {
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

function buildGenericStoryQuestions(project: ProjectDefinition, track: EducationTrack, carrier: CarrierCase): ScenarioQuestion[] {
  const [owner, qa, prod, data, mentor] = project.npcs
  const roleScope = track === 'college' ? '按规程执行' : '组织风险判断'
  const seeds: MissionQuestionSeed[] = [
    {
      id: `P${project.id}-S01`, kind: 'single', chapter: project.scenes[0].title, sceneNumber: 1, speaker: owner,
      taskLabel: roleScope, stem: `${project.riskSignal}。你进入现场后的第一项行动是？`,
      options: [project.wrongShortcut, project.firstAction, '先完成生产任务再补充记录'],
      correct: [1], insight: '发现风险后应先建立受控边界，不能让未经评估的事项继续流转。',
      evidence: project.keyEvidence[0], deliverable: `${project.curriculum}启动检查表`, choicePrompt: '第一步如何把风险拉回受控状态？',
    },
    {
      id: `P${project.id}-S02`, kind: 'multiple', chapter: project.scenes[0].title, sceneNumber: 1, speaker: qa,
      taskLabel: '证据保全', stem: `启动${project.curriculum}任务时，哪些资料必须进入案卷？`,
      options: [project.keyEvidence[0], project.keyEvidence[1], '非正式聊天记录替代原始记录', 'QA 通知或批准记录'],
      correct: [0, 1, 3], insight: '案卷必须能还原事实、职责和批准路径。',
      evidence: '项目启动资料清单', deliverable: '证据目录', choicePrompt: '请选出必须封存的证据。',
    },
    {
      id: `P${project.id}-S03`, kind: 'single', chapter: project.scenes[1].title, sceneNumber: 2, speaker: data,
      taskLabel: '风险识别', stem: `调查发现：${project.processRisk}。最合规的处理是？`,
      options: ['先忽略，等最终结果再说', '记录偏差并评估对产品/系统的影响', '修改记录让参数看起来合格'],
      correct: [1], insight: '关键参数或系统控制缺口必须转化为可审核的风险评价。',
      evidence: project.keyEvidence[1], deliverable: '风险识别记录', choicePrompt: '面对关键风险，你会怎样定性？',
    },
    {
      id: `P${project.id}-S04`, kind: 'multiple', chapter: project.scenes[1].title, sceneNumber: 2, speaker: data,
      taskLabel: '影响评价', stem: '判断风险影响时，应优先收集哪些线索？',
      options: ['关键参数趋势', '批记录或电子记录', '无关人员偏好', '产品质量结果'],
      correct: [0, 1, 3], insight: '影响评价需要参数、记录和质量结果相互印证。',
      evidence: `${project.keyEvidence[1]} / ${carrier.impactTests}`, deliverable: '影响评价草案', choicePrompt: '哪些线索能支撑影响评价？',
    },
    {
      id: `P${project.id}-S05`, kind: 'single', chapter: project.scenes[2].title, sceneNumber: 3, speaker: prod,
      taskLabel: '现场访谈', stem: `生产代表承认现场曾采用“${project.wrongShortcut}”。下一步最应该追问什么？`,
      options: ['为什么这种做法会被默许并如何上报', '午餐由谁负责', '怎样把记录写得更好看'],
      correct: [0], insight: '访谈要把个人行为连接到流程、培训、监督和技术控制。',
      evidence: '现场访谈记录', deliverable: '访谈纪要', choicePrompt: '访谈中要继续追问哪条管理线索？',
    },
    {
      id: `P${project.id}-S06`, kind: 'multiple', chapter: project.scenes[2].title, sceneNumber: 3, speaker: prod,
      taskLabel: '事实核对', stem: '哪些事实可以作为现场不符合项继续论证？',
      options: [project.processRisk, '偏差未及时升级', '继续流转待判定事项', '员工个人爱好'],
      correct: [0, 1, 2], insight: '事实核对要避免主观定罪，先固定已发生的不符合项。',
      evidence: '访谈笔录 / 现场记录', deliverable: '不符合项清单', choicePrompt: '哪些事实已经足以进入不符合项清单？',
    },
    {
      id: `P${project.id}-S07`, kind: 'single', chapter: project.scenes[3].title, sceneNumber: 4, speaker: qa,
      taskLabel: '范围扩展', stem: `${project.scopeRisk}。正确的扩展范围是？`,
      options: ['只处理当前批次', '覆盖所有相同暴露条件或同系统影响对象', '等客户投诉后再说'],
      correct: [1], insight: '范围评价必须跟着共同暴露条件走，而不是跟着单一批号走。',
      evidence: project.keyEvidence[2], deliverable: '影响范围清单', choicePrompt: '你会把调查范围扩展到哪里？',
    },
    {
      id: `P${project.id}-S08`, kind: 'case', chapter: project.scenes[3].title, sceneNumber: 4, speaker: qa,
      taskLabel: '决策组合', stem: '若部分相关批次或记录已进入下一阶段，哪些动作合理？',
      options: ['追加趋势或必要复核', '形成质量风险处置意见', '只冻结当前节点后停止调查', '记录依据并提交质量批准'],
      correct: [0, 1, 3], insight: '已进入后续阶段的对象也需要被纳入质量风险结论。',
      evidence: '扩展调查资料包', deliverable: '质量风险处置意见', choicePrompt: '请选择可以被批准的组合动作。',
    },
    {
      id: `P${project.id}-S09`, kind: 'multiple', chapter: project.scenes[4].title, sceneNumber: 5, speaker: mentor,
      taskLabel: 'CAPA 设计', stem: `围绕“${project.capaMove}”，哪些措施能证明闭环不是口头承诺？`,
      options: ['批准后的程序或技术控制', '培训/执行证据', '有效性复核标准', '只发一条提醒消息'],
      correct: [0, 1, 2], insight: 'CAPA 应有批准、执行、复核和有效性标准。',
      evidence: project.keyEvidence[2], deliverable: 'CAPA 计划', choicePrompt: '哪些措施能形成真正的闭环？',
    },
    {
      id: `P${project.id}-S10`, kind: 'case', chapter: project.scenes[4].title, sceneNumber: 5, speaker: mentor,
      taskLabel: '结案审核', stem: '提交结案前，需要同时确认哪些内容？',
      options: ['根因有证据支撑', '影响范围已评价', 'CAPA 有有效性计划', '只展示成功动画'],
      correct: [0, 1, 2], insight: '结案不是结束叙事，而是证明风险已经被系统性控制。',
      evidence: '结案审核包', deliverable: '结案报告', choicePrompt: '哪些条件满足后才可以提交结案？',
    },
  ]

  return seeds.map(createQuestion).map(question => enrichQuestion(project, question, carrier, track))
}

function buildGenericBossQuestions(project: ProjectDefinition, track: EducationTrack, carrier: CarrierCase): ScenarioQuestion[] {
  const [, qa,, data, mentor] = project.npcs
  const seeds: MissionQuestionSeed[] = [
    {
      id: `P${project.id}-B01`, kind: 'single', chapter: '终场核验 / 风险边界', sceneNumber: 5, speaker: qa,
      taskLabel: 'Boss 核验', stem: `${project.riskSignal}时，最不能接受的处置是？`,
      options: [project.firstAction, project.wrongShortcut, '通知 QA 并记录风险'],
      correct: [1], insight: 'Boss 战核验的是是否能识别错误捷径。',
      evidence: '终场证据卷宗', deliverable: '核验结论', choicePrompt: '先击破哪个错误决策？',
    },
    {
      id: `P${project.id}-B02`, kind: 'multiple', chapter: '终场核验 / 证据链', sceneNumber: 5, speaker: data,
      taskLabel: 'Boss 核验', stem: '哪些证据可以支撑终场判断？',
      options: [project.keyEvidence[0], project.keyEvidence[1], project.keyEvidence[2], '无来源口头保证'],
      correct: [0, 1, 2], insight: '终场判断必须建立在可复核证据上。',
      evidence: '终场证据卷宗', deliverable: '证据核验', choicePrompt: '选择能造成有效伤害的证据。',
    },
    {
      id: `P${project.id}-B03`, kind: 'single', chapter: '终场核验 / 影响评价', sceneNumber: 5, speaker: qa,
      taskLabel: 'Boss 核验', stem: `${project.processRisk}最需要转化为什么？`,
      options: ['可审核的影响评价', '临时口头说明', '漂亮的页面标题'],
      correct: [0], insight: '工艺或系统风险必须转化为影响评价。',
      evidence: carrier.impactTests, deliverable: '影响评价核验', choicePrompt: '风险应被转化成哪类输出？',
    },
    {
      id: `P${project.id}-B04`, kind: 'multiple', chapter: '终场核验 / 范围', sceneNumber: 5, speaker: mentor,
      taskLabel: 'Boss 核验', stem: '哪些情况会触发扩展调查？',
      options: ['同暴露条件', '同系统控制缺陷', '历史趋势异常', '无关装饰变化'],
      correct: [0, 1, 2], insight: '扩展调查由共同风险驱动。',
      evidence: '扩展范围清单', deliverable: '范围核验', choicePrompt: '选择扩展调查触发器。',
    },
    {
      id: `P${project.id}-B05`, kind: 'case', chapter: '终场核验 / CAPA', sceneNumber: 5, speaker: mentor,
      taskLabel: 'Boss 核验', stem: `围绕${project.capaMove}，可批准的 CAPA 组合是？`,
      options: ['批准后的控制措施', '执行证据', '有效性复核', '只贴提醒'],
      correct: [0, 1, 2], insight: 'CAPA 需要改变控制机制并验证有效。',
      evidence: 'CAPA 计划', deliverable: 'CAPA 核验', choicePrompt: '用哪组 CAPA 击破 Boss？',
    },
    {
      id: `P${project.id}-B06`, kind: 'single', chapter: '终场核验 / 质量决策', sceneNumber: 5, speaker: qa,
      taskLabel: 'Boss 核验', stem: '质量批准前最关键的判断对象是？',
      options: ['患者风险与产品质量', '交付压力', '页面是否好看'],
      correct: [0], insight: 'GMP 决策以患者和产品质量为核心。',
      evidence: '质量批准记录', deliverable: '批准建议', choicePrompt: '质量决策首先保护什么？',
    },
    {
      id: `P${project.id}-B07`, kind: 'multiple', chapter: '终场核验 / 数据', sceneNumber: 5, speaker: data,
      taskLabel: 'Boss 核验', stem: '记录可追溯通常需要哪些条件？',
      options: ['原始记录完整', '责任可归属', '修改有审计轨迹', '只保留最终截图'],
      correct: [0, 1, 2], insight: '可追溯是所有项目的底层能力。',
      evidence: '记录复核表', deliverable: '数据核验', choicePrompt: '选择可追溯条件。',
    },
    {
      id: `P${project.id}-B08`, kind: 'single', chapter: '终场核验 / 复发预防', sceneNumber: 5, speaker: mentor,
      taskLabel: 'Boss 核验', stem: '判断 CAPA 可关闭的必要条件是？',
      options: ['达到预设有效性标准', '完成一次签到', '负责人说可以'],
      correct: [0], insight: '活动发生不等于风险下降。',
      evidence: '有效性复核报告', deliverable: '关闭建议', choicePrompt: '关闭前必须证明什么？',
    },
    {
      id: `P${project.id}-B09`, kind: 'case', chapter: '终场核验 / 结案', sceneNumber: 5, speaker: qa,
      taskLabel: 'Boss 核验', stem: '结案报告必须同时覆盖哪些内容？',
      options: ['事实与证据', '根因与影响', 'CAPA 与有效性', '只写最终合格'],
      correct: [0, 1, 2], insight: '结案报告必须能被第三方重建。',
      evidence: '结案报告', deliverable: '结案核验', choicePrompt: '选择结案报告的必备骨架。',
    },
    {
      id: `P${project.id}-B10`, kind: 'case', chapter: '终场核验 / 最后一击', sceneNumber: 5, speaker: mentor,
      taskLabel: 'Boss 核验', stem: `如何证明${project.caseFocus}风险已真正受控？`,
      options: ['风险边界清楚', '措施已执行且有效', '后续趋势无复发', '只显示通关动画'],
      correct: [0, 1, 2], insight: '真正通关来自证据、措施和趋势三者闭环。',
      evidence: '终场结论包', deliverable: '最终判定', choicePrompt: '请选择终场最后一击。',
    },
  ]

  return seeds.map(createQuestion).map(question => ({
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
      sceneNumber: (index % 5) + 1,
      speaker,
      taskLabel: `${typeLabel} · ${points} 分`,
      stem: `${source.curriculum}：${stem}`,
      options,
      correct,
      insight: `本题来自项目${source.id}“${source.title}”，用于验证全项目知识迁移。`,
      evidence: source.keyEvidence[index % source.keyEvidence.length],
      deliverable: '最终总测作答记录',
      choicePrompt: `请选择${difficulty(index)}难度${typeLabel}的最佳作答。`,
      points,
    })
  }

  const seeds: ScenarioQuestion[] = []
  for (let i = 0; i < 50; i += 1) {
    const source = regularProjects[i % regularProjects.length]
    seeds.push(make(i, 'single', '单选题', `${source.riskSignal}时，首要质量动作是什么？`, [source.wrongShortcut, source.firstAction, '等待下一批再处理', '只做口头说明'], [1], 0.5))
  }
  for (let i = 0; i < 20; i += 1) {
    const source = regularProjects[i % regularProjects.length]
    seeds.push(make(50 + i, 'multiple', '多选题', `围绕${source.caseFocus}，哪些证据可以支持结论？`, [source.keyEvidence[0], source.keyEvidence[1], source.keyEvidence[2], '无来源口头保证'], [0, 1, 2], 2))
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
    narration: `最终总测题阵覆盖十个常规项目，当前采用 50 道单选、20 道多选、20 道判断、5 道简答要点题，共 95 题、100 分。难中易按 2:4:4 分布。`,
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
  return Number((GAME_PROJECT_BASE_CREDIT * medalMultiplier(medal)).toFixed(1))
}

export function answerKeyFor(questions: ScenarioQuestion[]) {
  return questions.map(question => `${question.id}: ${question.correct.join('、')}`)
}
