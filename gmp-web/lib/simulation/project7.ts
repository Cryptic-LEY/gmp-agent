export type EducationTrack = 'college' | 'undergraduate'
export type ScenarioQuestionKind = 'single' | 'multiple' | 'case' | 'sequence'

export interface CaseCatalogProduct {
  productName: string
  dosageForm: string
  dosageCategory: string
  sectionCount: number
}

export interface CarrierCase {
  id: string
  productName: string
  dosageForm: string
  dosageCategory: string
  process: string
  anomaly: string
  materialClue: string
  impactTests: string
  rationale: string
}

export interface CarrierRoute {
  id: string
  label: string
  matchingMajors: string[]
  rationale: string
  primaryCarriers: CarrierCase[]
  auxiliaryCategories: string[]
  auxiliaryForms?: string[]
}

export interface ScenarioNpc {
  id: string
  name: string
  title: string
  attitude: string
}

export interface ScenarioDialogueLine {
  speaker: string
  title?: string
  line: string
  tone: 'narrator' | 'npc' | 'player' | 'system'
}

export interface ScenarioQuestion {
  id: string
  kind: ScenarioQuestionKind
  chapter: string
  sceneNumber: number
  stem: string
  options: { id: string; label: string }[]
  correct: string[]
  insight: string
  context: string
  taskLabel: string
  evidence: string
  deliverable: string
  speaker: ScenarioNpc
  points: number
  sceneMood: string
  narration: string
  dialogue: ScenarioDialogueLine[]
  choicePrompt: string
}

type PromptSeed = Omit<ScenarioQuestion, 'options' | 'correct' | 'sceneMood' | 'narration' | 'dialogue' | 'choicePrompt'> & {
  options: string[]
  correct: number[]
}

const OPTIONS = ['A', 'B', 'C', 'D']

function questionOptionHash(text: string) {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return hash
}

function balanceQuestionOptions(seed: PromptSeed, question: ScenarioQuestion): ScenarioQuestion {
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

const CHEM_TABLET: CarrierCase = {
  id: 'carbamazepine-tablet',
  productName: '卡马西平片',
  dosageForm: '片剂',
  dosageCategory: '化学药制剂',
  process: '称量配料 -> 湿法制粒 -> 总混 -> 压片 -> 包装',
  anomaly: '总混后含量均匀度 85.0%，低于 90.0%-110.0% 内控标准',
  materialClue: '首次使用的新供应商微晶纤维素粒度分布异常',
  impactTests: '含量均匀度、溶出度与混合时间趋势',
  rationale: '片剂覆盖物料、制粒、总混和压片等典型 GMP 风险节点，适合作为化学制剂长期主线。',
}

const CHEM_CAPSULE: CarrierCase = {
  id: 'acetaminophen-capsule',
  productName: '对乙酰氨基酚胶囊',
  dosageForm: '胶囊剂',
  dosageCategory: '化学药制剂',
  process: '称量配料 -> 制粒/整粒 -> 总混 -> 充填 -> 包装',
  anomaly: '充填前混合物含量均匀度 86.2%，超出工艺控制范围',
  materialClue: '润滑剂加入时长改变且辅料供应商变更未完成评估',
  impactTests: '装量差异、含量均匀度与溶出度趋势',
  rationale: '胶囊剂可补足充填与装量控制场景，与片剂共同形成口服固体制剂训练主轴。',
}

const TCM_CAPSULE: CarrierCase = {
  id: 'xuanmai-capsule',
  productName: '玄麦甘桔胶囊',
  dosageForm: '中成药胶囊',
  dosageCategory: '中成药',
  process: '提取浓缩 -> 干燥制粒 -> 浸膏粉总混 -> 胶囊充填 -> 包装',
  anomaly: '浸膏粉总混后标志性成分均匀度结果明显偏低',
  materialClue: '新批次浸膏粉水分与粒度波动，供应商/前处理评价不完整',
  impactTests: '标志性成分含量、装量差异与水分趋势',
  rationale: '胶囊中成药连接提取物控制和固体制剂生产，便于贯穿中药质量控制教学。',
}

const TCM_LIQUID: CarrierCase = {
  id: 'yinqiao-mixture',
  productName: '银翘合剂',
  dosageForm: '中成药合剂',
  dosageCategory: '中成药',
  process: '提取 -> 浓缩配液 -> 过滤 -> 灌装 -> 成品检验',
  anomaly: '配液后标志性成分含量低于工艺控制限，待灌装批次报警',
  materialClue: '提取液转移与浓缩终点记录不一致，药材批次变更缺少扩展评价',
  impactTests: '标志性成分含量、相对密度与微生物风险趋势',
  rationale: '合剂呈现提取、配液和灌装风险，与胶囊构成中药固液两条稳定主线。',
}

const BIO_VACCINE: CarrierCase = {
  id: 'rabies-vaccine',
  productName: '冻干人用狂犬病疫苗',
  dosageForm: '冻干疫苗',
  dosageCategory: '生物制品',
  process: '原液制备 -> 配液 -> 无菌灌装 -> 冻干 -> 灯检/包装',
  anomaly: '冻干后效价检测结果为目标下限的 85.0%，批次处于待判定状态',
  materialClue: '冻干曲线超出验证范围，关键辅料批次变更尚未完成风险评估',
  impactTests: '效价、残余水分、无菌/内毒素与冻干曲线趋势',
  rationale: '现有案例库中材料最完整的生物制品案例，可贯穿无菌保障、验证与批放行教学。',
}

const STERILE_INJECTION: CarrierCase = {
  id: 'ceftriaxone-injection',
  productName: '注射用头孢曲松钠',
  dosageForm: '注射剂',
  dosageCategory: '化学药制剂',
  process: '无菌原料接收 -> 分装 -> 轧盖 -> 检验 -> 放行',
  anomaly: '分装后含量结果偏低且数据审核发现异常重测记录',
  materialClue: '无菌分装参数漂移且关键设备确认记录不完整',
  impactTests: '装量、含量、无菌与环境监测趋势',
  rationale: '适合作为无菌设备与设施控制的对照案例。',
}

export const CARRIER_ROUTES: CarrierRoute[] = [
  {
    id: 'pharmacy',
    label: '化学制剂主线',
    matchingMajors: ['药学', '药品生产技术', '药物制剂', '药事管理', '食品药品监督管理'],
    rationale: '以最常见的口服固体制剂贯穿工艺研究、偏差、验证和放行，辅助抽取注射剂或原料药作对照。',
    primaryCarriers: [CHEM_TABLET, CHEM_CAPSULE],
    auxiliaryCategories: ['化学药制剂', '化学原料药'],
  },
  {
    id: 'traditional',
    label: '中药制剂主线',
    matchingMajors: ['中药学', '中药制药'],
    rationale: '以中成药胶囊与合剂覆盖提取物、配液/总混、灌装和质量标准，饮片作为溯源补充案例。',
    primaryCarriers: [TCM_CAPSULE, TCM_LIQUID],
    auxiliaryCategories: ['中成药', '中药饮片'],
  },
  {
    id: 'biotech',
    label: '生物无菌主线',
    matchingMajors: ['生物制药', '生物技术'],
    rationale: '以案例材料最完整的冻干疫苗贯穿无菌保障、关键工艺参数和效价放行，并抽取注射剂进行无菌对照。',
    primaryCarriers: [BIO_VACCINE],
    auxiliaryCategories: ['化学药制剂'],
    auxiliaryForms: ['注射剂'],
  },
  {
    id: 'equipment',
    label: '设备与验证主线',
    matchingMajors: ['制药设备'],
    rationale: '以片剂设备链与无菌分装设施为核心，强调设备确认、联锁和数据可靠性。',
    primaryCarriers: [CHEM_TABLET, STERILE_INJECTION],
    auxiliaryCategories: ['化学药制剂', '生物制品'],
  },
]

const FALLBACK_ROUTE = CARRIER_ROUTES[0]

export const PROJECT7_NPCS: Record<string, ScenarioNpc> = {
  qc: { id: 'qc', name: '张雨辰', title: 'QC 检验员', attitude: '希望复测后快速结案' },
  data: { id: 'data', name: '顾航', title: '实验室数据工程师', attitude: '掌握审计追踪与原始记录' },
  operator: { id: 'operator', name: '李强', title: '总混操作工', attitude: '承认用餐期间设备延时运行' },
  foreman: { id: 'foreman', name: '王海', title: '生产班组长', attitude: '受到交付与产量指标压力' },
  qa: { id: 'qa', name: '林严谨', title: 'QA 负责人', attitude: '要求形成可审核的闭环结论' },
  supplier: { id: 'supplier', name: '苏妍', title: '供应商质量专员', attitude: '提供变更与批次追溯证据' },
}

export const PROJECT7_SCENES = [
  { id: 'alarm', number: 1, title: '警报响起', defect: 'OOS-02', objective: '启动调查并控制批次' },
  { id: 'laboratory', number: 2, title: '实验室迷雾', defect: 'L-05 / L-06', objective: '保全数据与识别实验室风险' },
  { id: 'workshop', number: 3, title: '深入车间', defect: 'DEV-02', objective: '通过访谈还原超时工艺' },
  { id: 'root-cause', number: 4, title: '根因追踪', defect: 'QA-17', objective: '扩展受影响批次范围' },
  { id: 'capa', number: 5, title: 'CAPA 闭环', defect: 'CAPA-03', objective: '制定并验证预防措施' },
]

export function normalizeEducationTrack(value?: string | null): EducationTrack {
  return value === 'college' || /专科|高职|中职/.test(value ?? '') ? 'college' : 'undergraduate'
}

export function trackLabel(track: EducationTrack) {
  return track === 'college' ? '专科' : '本科'
}

export function assignedRoleLabel(track: EducationTrack) {
  return track === 'college' ? 'GMP 合规员' : '质量调查组长'
}

export function getCarrierRoute(major?: string | null): CarrierRoute {
  return CARRIER_ROUTES.find(route => route.matchingMajors.some(item => major?.includes(item))) ?? FALLBACK_ROUTE
}

export function getPrimaryCarrierChoices(route: CarrierRoute, catalog: CaseCatalogProduct[]): CarrierCase[] {
  if (!catalog.length) return route.primaryCarriers
  const available = route.primaryCarriers.filter(carrier =>
    catalog.some(item => item.productName === carrier.productName && item.dosageForm === carrier.dosageForm),
  )
  return available.length ? available : route.primaryCarriers
}

export function getAuxiliaryCasePool(route: CarrierRoute, catalog: CaseCatalogProduct[], currentProduct: string) {
  return catalog.filter(item =>
    item.productName !== currentProduct
      && route.auxiliaryCategories.includes(item.dosageCategory)
      && (!route.auxiliaryForms || route.auxiliaryForms.includes(item.dosageForm)),
  )
}

export function pickAuxiliaryCase(pool: CaseCatalogProduct[], previousProduct?: string) {
  const alternatives = pool.filter(item => item.productName !== previousProduct)
  const choices = alternatives.length ? alternatives : pool
  return choices.length ? choices[Math.floor(Math.random() * choices.length)] : null
}

function makeQuestion(seed: PromptSeed): ScenarioQuestion {
  const question = {
    ...seed,
    options: seed.options.map((label, index) => ({ id: OPTIONS[index], label })),
    correct: seed.correct.map(index => OPTIONS[index]),
    sceneMood: '',
    narration: '',
    dialogue: [],
    choicePrompt: '',
  }
  return balanceQuestionOptions(seed, question)
}

function dramaForQuestion(question: ScenarioQuestion, carrier: CarrierCase, track: EducationTrack): ScenarioQuestion {
  const roleName = assignedRoleLabel(track)
  const product = carrier.productName
  const processPoint = carrier.process.includes('总混') ? '总混间' : carrier.dosageForm.includes('疫苗') ? '冻干间' : '关键工序现场'
  const moodByScene: Record<number, string> = {
    1: 'QC 警报在质量办公室响起',
    2: '实验室屏幕上闪着未审核的原始序列',
    3: `${processPoint}门口仍贴着待判定批次标签`,
    4: '物料追溯表把风险从一个批次拉成一条线',
    5: 'CAPA 评审会进入最后十分钟',
  }
  const narrator = (line: string): ScenarioDialogueLine => ({ speaker: '旁白', line, tone: 'narrator' })
  const npc = (line: string, speaker = question.speaker): ScenarioDialogueLine => ({
    speaker: speaker.name,
    title: speaker.title,
    line,
    tone: 'npc',
  })
  const player = (line: string): ScenarioDialogueLine => ({ speaker: roleName, line, tone: 'player' })
  const system = (line: string): ScenarioDialogueLine => ({ speaker: '系统提示', line, tone: 'system' })

  const scenes: Record<string, {
    sceneMood: string
    narration: string
    dialogue: ScenarioDialogueLine[]
    choicePrompt: string
  }> = {
    'C-S01': {
      sceneMood: moodByScene[1],
      narration: `${product}的初始异常结果刚被打印出来，批次状态还未改变。张雨辰拿着复测记录快步走进办公室。`,
      dialogue: [
        narrator(`检验记录显示：${carrier.anomaly}。走廊里已经传来生产催单的声音。`),
        npc('复测结果已经合格了，车间那边等着下道工序，要不这次先按复测值走？'),
        player('我先按 OOS 调查 SOP 控制批次，不能让未经判定的结果继续流转。'),
        system('你需要在压力下完成第一道动作：报告、隔离、通知。'),
      ],
      choicePrompt: '你在检查表上写下的第一项行动是？',
    },
    'C-S02': {
      sceneMood: moodByScene[1],
      narration: 'QA 负责人林严谨把一张空白资料清单推到你面前，要求先把能还原事件的材料封存。',
      dialogue: [
        npc('不要先讨论谁的责任。先确认哪些证据能证明发生了什么。'),
        player('我会把原始记录、批次状态和通知记录一起归档。'),
        system('档案缺一项，后续调查就可能无法复核。'),
      ],
      choicePrompt: '请把必须进入偏差档案的材料选出来。',
    },
    'C-S03': {
      sceneMood: moodByScene[2],
      narration: '你进入 QC 实验室，顾航调出 HPLC 使用记录。屏幕右上角的审计追踪状态显示为关闭。',
      dialogue: [
        npc('这里不只是一条异常曲线。账号、审计追踪、计算录入都留下了风险信号。', PROJECT7_NPCS.data),
        player('我先识别能被记录为实验室偏差的事实。'),
        system('注意：不是所有现场信息都构成 GMP 偏差。'),
      ],
      choicePrompt: '哪些线索应被记录为实验室偏差？',
    },
    'C-S04': {
      sceneMood: moodByScene[2],
      narration: '更换色谱柱后，张雨辰重新进样得到合格结果，但最早的异常序列仍在系统里。',
      dialogue: [
        npc('如果异常序列影响报告呈现，我能不能把它删掉，只保留新的合格结果？'),
        player('原始数据必须保留。合格结果不能抹掉异常发生过的事实。'),
        system('数据完整性不是让报告更好看，而是让过程能被重建。'),
      ],
      choicePrompt: '面对异常原始数据，你应如何执行？',
    },
    'C-S05': {
      sceneMood: moodByScene[3],
      narration: `你和李强站在${processPoint}外，设备日志显示关键参数实际运行时间超出规程。`,
      dialogue: [
        npc('当时快到饭点，我想着机器多转一会儿也没事，之前也这么干过。', PROJECT7_NPCS.operator),
        player('我先记录事实：人、时间、标准、实际参数和报告延迟。'),
        system('专科线路重在客观记录，不提前替调查组写主观结论。'),
      ],
      choicePrompt: '现场访谈记录最先应该锁定什么？',
    },
    'C-S06': {
      sceneMood: moodByScene[3],
      narration: '王海承认自己知道参数超限，但没有叫停，也没有第一时间通知 QA。',
      dialogue: [
        npc('停下来就要写偏差、等审批，今天这一批肯定交不出去。', PROJECT7_NPCS.foreman),
        player('我需要把已确认的不符合项列清楚，再交给调查组长。'),
        system('事实清单将成为后续 5-Why 和 CAPA 的入口。'),
      ],
      choicePrompt: '哪些不符合项已经可以确认？',
    },
    'C-S07': {
      sceneMood: moodByScene[4],
      narration: `苏妍发来物料追溯表，线索指向：${carrier.materialClue}。`,
      dialogue: [
        npc('这不是单一检验结果的问题，可能还有相同暴露条件的批次。', PROJECT7_NPCS.supplier),
        player('我会按物料和变更条件检索批次，而不是只看当前报警批。'),
        system('同源风险必须按暴露范围追溯。'),
      ],
      choicePrompt: '你应按什么范围检索受影响批次？',
    },
    'C-S08': {
      sceneMood: moodByScene[4],
      narration: '扩展调查材料陆续送到，你负责把可支持结论的资料归入案卷。',
      dialogue: [
        npc('归档不是堆材料，而是证明批次、物料和质量结果之间的关系。'),
        player('我会把趋势、准入和批次处置证据对应起来。'),
        system('资料归档决定结论能否被第三方复核。'),
      ],
      choicePrompt: '哪些资料可以支持扩展调查归档？',
    },
    'C-S09': {
      sceneMood: moodByScene[5],
      narration: 'CAPA 计划已批准，轮到你确认执行证据是否真实、受控、可追溯。',
      dialogue: [
        npc('我们不能只说“已经通知大家注意”。要证明措施进入了系统。'),
        player('我会核对生效 SOP、培训执行和复核证据。'),
        system('执行记录是 CAPA 能否关闭的第一层证据。'),
      ],
      choicePrompt: '哪类记录能证明 CAPA 执行完成？',
    },
    'C-S10': {
      sceneMood: moodByScene[5],
      narration: '三个月有效性复核到期，QA 要求你按清单确认同类风险是否下降。',
      dialogue: [
        npc('如果只是做过培训，但同类偏差还在发生，这个 CAPA 就不能算有效。'),
        player('我会用后续趋势、报警执行和偏差复发情况支持关闭建议。'),
        system('有效性复核关注的是结果，而不只是活动。'),
      ],
      choicePrompt: '哪些结果足以支持提交关闭审批？',
    },
    'U-S01': {
      sceneMood: moodByScene[1],
      narration: `${product}异常报告刚到，生产负责人已经打来电话询问是否可以先放行。`,
      dialogue: [
        narrator(`初始结果显示：${carrier.anomaly}。复测合格的说法还没有经过调查。`),
        npc('组长，复测已经过了。要是再停，今天排产会被打乱。'),
        player('我需要先控制批次并组织调查，而不是让复测替代结论。'),
        system('本科线路的第一步是作出质量决策，并建立调查边界。'),
      ],
      choicePrompt: '你以调查组长身份作出的启动决策是？',
    },
    'U-S02': {
      sceneMood: moodByScene[1],
      narration: '林严谨召集临时会议，白板上只写了四个字：不要漏项。',
      dialogue: [
        npc('如果你只盯着实验室，可能漏掉工艺；只盯着当批，可能漏掉历史风险。'),
        player('我会同步分配实验室、生产、物料和扩展范围调查。'),
        system('调查计划决定后续证据链的完整程度。'),
      ],
      choicePrompt: '初始调查计划必须覆盖哪些路径？',
    },
    'U-S03': {
      sceneMood: moodByScene[2],
      narration: '顾航把审计追踪、账号权限和计算记录同时投到大屏，风险从一条数据扩展到一套系统。',
      dialogue: [
        npc('这不是“算错一次”这么简单。审计追踪关闭意味着历史数据也可能需要回顾。', PROJECT7_NPCS.data),
        player('我会把数据完整性作为专项风险，而不是只更正本次计算。'),
        system('本科任务要求把单点差错扩展到体系影响。'),
      ],
      choicePrompt: '哪些结论应进入数据可靠性专项调查？',
    },
    'U-S04': {
      sceneMood: moodByScene[2],
      narration: '实验室复测合格，但原始异常序列、柱效记录和审计追踪缺口仍摆在桌上。',
      dialogue: [
        npc('如果最终结果合格，我们是不是可以认为产品没问题？'),
        player('不能。我们必须解释原异常、保全原始序列，并评价历史影响。'),
        system('调查不是寻找一个合格数字，而是解释为什么出现异常。'),
      ],
      choicePrompt: '你会批准哪些调查组合动作？',
    },
    'U-S05': {
      sceneMood: moodByScene[3],
      narration: `你走进${processPoint}，李强低头看着设备日志，承认超时不是第一次。`,
      dialogue: [
        npc('以前多运行几分钟也没人说，王班长一般就是提醒一下。', PROJECT7_NPCS.operator),
        player('我要继续追问：为什么这种行为会被默许，为什么没有升级。'),
        system('真正的根因往往藏在“以前也这样”里面。'),
      ],
      choicePrompt: '第一轮追问后，最应验证哪一个管理性假设？',
    },
    'U-S06': {
      sceneMood: moodByScene[3],
      narration: '王海把排产表摊开，几条生产线的交付节点几乎没有缓冲。',
      dialogue: [
        npc('停线调查会影响奖金。说实话，质量指标没产量扣得那么直接。', PROJECT7_NPCS.foreman),
        player('这已经不是单个操作员问题，我需要把绩效、升级通道和技术防错纳入根因。'),
        system('系统根因要能被 CAPA 管理，而不是停留在责备。'),
      ],
      choicePrompt: '哪些判断可以作为可管理的系统根因？',
    },
    'U-S07': {
      sceneMood: moodByScene[4],
      narration: `苏妍的供应商变更记录显示：${carrier.materialClue}。风险从现场延伸到供应链。`,
      dialogue: [
        npc('同一批变更条件下，还有几个批次已经进入不同阶段。', PROJECT7_NPCS.supplier),
        player('我要把物料属性、暴露批次和产品结果放到同一张影响评价里。'),
        system('根因指向物料时，范围评价必须跟着暴露条件走。'),
      ],
      choicePrompt: `要评价对${product}的影响，应调取哪些内容？`,
    },
    'U-S08': {
      sceneMood: moodByScene[4],
      narration: '会议室里出现一个更难的问题：部分相关批次已经完成放行。',
      dialogue: [
        npc('如果风险涉及已放行产品，你的结论不能只写“当前批冻结”。'),
        player('我会追加趋势或必要检验，并形成已放行产品风险处置意见。'),
        system('批次决策必须覆盖患者和产品质量风险。'),
      ],
      choicePrompt: '哪些行动属于合理的影响评价方案？',
    },
    'U-S09': {
      sceneMood: moodByScene[5],
      narration: '调查白板上列出三条根因：物料准入不足、参数控制薄弱、异常上报被产量压力压住。',
      dialogue: [
        npc('如果 CAPA 只写“再培训”，下个月同类问题还会回来。'),
        player('我会把准入、小试评价、参数联锁和绩效机制一起纳入预防措施。'),
        system('预防性 CAPA 要改变系统控制，而不只是提醒人。'),
      ],
      choicePrompt: '哪些措施组成了可验证的预防性 CAPA？',
    },
    'U-S10': {
      sceneMood: moodByScene[5],
      narration: '质量负责人准备听取最终汇报，投影上停留在“CAPA 有效性验证”页面。',
      dialogue: [
        npc('你的结论能不能被批准，取决于你如何证明风险已经下降。'),
        player('我会给出周期、接受标准、复发率和关键趋势，而不是口头保证。'),
        system('本科结案要回答：为什么相信这个问题不会再发生。'),
      ],
      choicePrompt: '结案报告中必须给出哪些有效性验证内容？',
    },
  }

  const fallback = scenes[question.id] ?? {
    sceneMood: moodByScene[question.sceneNumber] ?? '调查现场',
    narration: question.context,
    dialogue: [npc(question.context), player('我会依据证据作出下一步处置。'), system(question.insight)],
    choicePrompt: '你下一步准备怎么做？',
  }

  return { ...question, ...fallback }
}

export function buildProject7StoryQuestions(track: EducationTrack, carrier: CarrierCase): ScenarioQuestion[] {
  const c = carrier
  const common: PromptSeed[] = track === 'college'
    ? [
        {
          id: 'C-S01', kind: 'single', chapter: '警报响起', sceneNumber: 1, speaker: PROJECT7_NPCS.qc, points: 10,
          context: `张雨辰递来${c.productName}的检验记录，并提出“复测合格就可以继续生产”。`,
          taskLabel: '按 SOP 处置', stem: `${c.anomaly}。你在检查表中首先记录并执行哪项动作？`,
          options: ['登记复测合格并放行', '登记 OOS、隔离批次并通知 QA', '先让下工序继续再补记录'],
          correct: [1], insight: '专科线路首先考查按规程完成报告、隔离和证据保全。',
          evidence: '证据：原始检验报告 / 批次状态标签', deliverable: 'OOS 调查启动检查表',
        },
        {
          id: 'C-S02', kind: 'multiple', chapter: '警报响起', sceneNumber: 1, speaker: PROJECT7_NPCS.qa, points: 10,
          context: '林严谨要求你提交第一阶段调查所需材料清单。',
          taskLabel: '整理材料', stem: '哪些材料必须立即纳入本次偏差档案？',
          options: ['原始图谱与计算记录', '样品/批次隔离记录', '交货催办聊天记录', 'OOS 报告与通知记录'],
          correct: [0, 1, 3], insight: '记录是调查可以被复核的基础。',
          evidence: '证据：QA 现场清单', deliverable: '档案资料目录',
        },
        {
          id: 'C-S03', kind: 'multiple', chapter: '实验室迷雾', sceneNumber: 2, speaker: PROJECT7_NPCS.data, points: 10,
          context: '顾航打开实验室状态看板：审计追踪关闭、共用账号、对照品计算录入异常。',
          taskLabel: '识别偏差', stem: '请勾选需要记录为实验室偏差的线索。',
          options: ['审计追踪被关闭', '检验账号共用', '计算录入错误', '检验员当天穿蓝色工服'],
          correct: [0, 1, 2], insight: '应准确识别可归属性、原始数据和计算可靠性问题。',
          evidence: '证据：HPLC 日志 / 称量计算表', deliverable: '实验室偏差记录单',
        },
        {
          id: 'C-S04', kind: 'single', chapter: '实验室迷雾', sceneNumber: 2, speaker: PROJECT7_NPCS.qc, points: 10,
          context: '张雨辰询问：既然找到计算错误，是否可以删除最早异常数据。',
          taskLabel: '规范操作', stem: '你应执行哪项规范动作？',
          options: ['删除异常数据并重新计算', '保留原始数据并记录差错处置', '把异常结果改写成合格'],
          correct: [1], insight: '任何异常原始记录都不能被选择性删除。',
          evidence: '证据：审计追踪与原始图谱', deliverable: '数据保全确认单',
        },
        {
          id: 'C-S05', kind: 'single', chapter: '深入车间', sceneNumber: 3, speaker: PROJECT7_NPCS.operator, points: 10,
          context: `李强承认在${c.process.includes('总混') ? '总混设备' : '关键设备'}运行期间离岗，实际时间超出工艺要求。`,
          taskLabel: '事实访谈', stem: '作为 GMP 合规员，你在访谈记录中应优先填写什么？',
          options: ['谁在何时操作、标准与实际参数以及报告时间', '推测李强态度不好', '直接写根因是公司文化'],
          correct: [0], insight: '专科任务首先要求客观、完整、可追溯地记录现场事实。',
          evidence: '证据：设备运行日志 / 批生产记录', deliverable: '偏差现场调查表',
        },
        {
          id: 'C-S06', kind: 'multiple', chapter: '深入车间', sceneNumber: 3, speaker: PROJECT7_NPCS.foreman, points: 10,
          context: '王海表示因为赶产量，只进行了口头提醒，未立即上报 QA。',
          taskLabel: '核对违规', stem: '请标注已确认的不符合项。',
          options: ['设备参数超出规程', '偏差未及时上报', '班组继续流转待判定批次', '员工午餐内容不合要求'],
          correct: [0, 1, 2], insight: '记录事实并依 SOP 升级，是后续调查的可靠基础。',
          evidence: '证据：访谈笔录 / 批次流转单', deliverable: '不符合项清单',
        },
        {
          id: 'C-S07', kind: 'single', chapter: '根因追踪', sceneNumber: 4, speaker: PROJECT7_NPCS.supplier, points: 10,
          context: `苏妍确认：${c.materialClue}。`,
          taskLabel: '批次追溯', stem: '你收到组长指令排查影响范围，正确的检索范围是？',
          options: ['仅当前报警批次', '全部使用相同异常物料或变更条件的批次', '只检索下一批'],
          correct: [1], insight: '相同暴露条件的批次都需被列入清单。',
          evidence: '证据：物料批号使用台账', deliverable: '受影响批次清单',
        },
        {
          id: 'C-S08', kind: 'multiple', chapter: '根因追踪', sceneNumber: 4, speaker: PROJECT7_NPCS.qa, points: 10,
          context: `QA 要求你协助归档${c.productName}的补充评价结果。`,
          taskLabel: '资料归档', stem: `本案例应归档哪些补充检验或趋势结果？`,
          options: [c.impactTests, '物料准入记录', '员工生日表', '相关批次处置结论'],
          correct: [0, 1, 3], insight: '批次、物料和质量结果必须相互关联。',
          evidence: '证据：趋势报表 / 物料准入资料', deliverable: '扩展调查归档包',
        },
        {
          id: 'C-S09', kind: 'single', chapter: 'CAPA 闭环', sceneNumber: 5, speaker: PROJECT7_NPCS.qa, points: 10,
          context: '调查组形成 CAPA：修订操作规程、增加参数报警并追踪后续批次。',
          taskLabel: '执行措施', stem: '你负责执行措施时，哪类记录能够证明任务已完成？',
          options: ['修订批准的 SOP、培训/执行证据与复核记录', '仅口头说已完成', '删除旧版记录'],
          correct: [0], insight: '执行型岗位以真实、受控、可追溯的证据支撑 CAPA。',
          evidence: '证据：变更批准单 / 生效 SOP', deliverable: 'CAPA 执行记录',
        },
        {
          id: 'C-S10', kind: 'case', chapter: 'CAPA 闭环', sceneNumber: 5, speaker: PROJECT7_NPCS.qa, points: 10,
          context: '三个月后 QA 发起有效性复核，你需要按清单完成检查。',
          taskLabel: '有效性复核', stem: '哪些结果支持本次 CAPA 可以提交关闭审批？',
          options: ['后续批次未再出现同类异常', '参数报警/记录按要求执行', '只完成一次签字培训', c.impactTests + '趋势稳定'],
          correct: [0, 1, 3], insight: '关闭前必须证实措施有效，而非只证实活动发生过。',
          evidence: '证据：复核周期内趋势与偏差统计', deliverable: '有效性复核表',
        },
      ]
    : [
        {
          id: 'U-S01', kind: 'single', chapter: '警报响起', sceneNumber: 1, speaker: PROJECT7_NPCS.qc, points: 10,
          context: `张雨辰报告${c.productName}异常并建议以复测结果替代初始 OOS。`,
          taskLabel: '质量决策', stem: `${c.anomaly}。作为调查组长，你应作出什么启动决策？`,
          options: ['接受复测并立即关闭', '隔离批次、启动 OOS 并制定调查分工', '在发运后追加解释'],
          correct: [1], insight: '本科线路首先考查风险判断与调查组织能力。',
          evidence: '证据：原始结果 / 批次状态 / 质量风险', deliverable: '调查启动决策书',
        },
        {
          id: 'U-S02', kind: 'multiple', chapter: '警报响起', sceneNumber: 1, speaker: PROJECT7_NPCS.qa, points: 10,
          context: '林严谨要求你提出初步风险边界与任务分配。',
          taskLabel: '分配调查', stem: '初始调查计划应同时涵盖哪些路径？',
          options: ['实验室数据可靠性', '生产工艺与物料变更', '只做复测', '受影响批次范围'],
          correct: [0, 1, 3], insight: '调查应覆盖可能影响产品质量的完整因果链。',
          evidence: '证据：调查任务分工表', deliverable: '风险边界与分工表',
        },
        {
          id: 'U-S03', kind: 'multiple', chapter: '实验室迷雾', sceneNumber: 2, speaker: PROJECT7_NPCS.data, points: 10,
          context: '顾航报告审计追踪关闭、共用账户及计算录入偏差同时存在。',
          taskLabel: '风险分级', stem: '哪些结论应进入数据可靠性专项调查？',
          options: ['原始数据可能无法完整重建', '相关历史放行批次需回顾', '只需更正本次计算', '账户权限和追踪配置需整改'],
          correct: [0, 1, 3], insight: '本科生需要从单点差错扩展到体系影响。',
          evidence: '证据：审计追踪配置 / 权限清单', deliverable: '数据完整性风险评价',
        },
        {
          id: 'U-S04', kind: 'case', chapter: '实验室迷雾', sceneNumber: 2, speaker: PROJECT7_NPCS.qc, points: 10,
          context: '更换色谱柱后复测合格，但原始异常和审计追踪问题仍存在。',
          taskLabel: '判断有效性', stem: '调查组长应批准哪些组合动作？',
          options: ['认定复测足够并关闭', '评价原测试有效性与数据可靠性', '保全全部原始序列', '启动受影响历史数据回顾'],
          correct: [1, 2, 3], insight: '复测不能替代对原异常和系统缺陷的解释。',
          evidence: '证据：原始序列 / 柱效记录 / 审核轨迹', deliverable: '第一阶段调查结论',
        },
        {
          id: 'U-S05', kind: 'single', chapter: '深入车间', sceneNumber: 3, speaker: PROJECT7_NPCS.operator, points: 10,
          context: `李强说明${c.process.includes('总混') ? '总混' : '关键工序'}超时源于设备运行时离岗，“以前也这样做过”。`,
          taskLabel: '5-Why 访谈', stem: '第一轮追问之后，最应继续验证哪一个管理性假设？',
          options: ['是否存在默许超限且不报告的班组惯例', '李强午餐口味', '是否把记录改短即可'],
          correct: [0], insight: '从人员行为追溯到管理机制，是根因分析的关键。',
          evidence: '证据：设备日志 / 历史偏差 / 访谈', deliverable: '5-Why 分析记录',
        },
        {
          id: 'U-S06', kind: 'case', chapter: '深入车间', sceneNumber: 3, speaker: PROJECT7_NPCS.foreman, points: 10,
          context: '王海承认产量奖金会因停线调查受到影响，因此以前也只做口头提醒。',
          taskLabel: '系统根因', stem: '哪些判断可以作为可管理的系统根因继续论证？',
          options: ['质量升级通道失效', '绩效只强调产量形成错误激励', '只需将责任归于李强', '关键参数缺少报警或联锁'],
          correct: [0, 1, 3], insight: 'CAPA 应指向制度与技术控制，而不是停在“人员培训”。',
          evidence: '证据：绩效制度 / 设备控制设计 / 访谈', deliverable: '系统根因假设清单',
        },
        {
          id: 'U-S07', kind: 'multiple', chapter: '根因追踪', sceneNumber: 4, speaker: PROJECT7_NPCS.supplier, points: 10,
          context: `供应商线索显示：${c.materialClue}。`,
          taskLabel: '影响评估', stem: `要评价对${c.productName}的影响，应调取哪些内容？`,
          options: ['相同物料暴露批次', c.impactTests, '供应商准入/变更证据', '仅当前复测结果'],
          correct: [0, 1, 2], insight: '物料变化需要以批次、属性与产品结果三条证据线交叉验证。',
          evidence: '证据：物料追溯表 / 趋势数据', deliverable: '扩展调查方案',
        },
        {
          id: 'U-S08', kind: 'case', chapter: '根因追踪', sceneNumber: 4, speaker: PROJECT7_NPCS.qa, points: 10,
          context: '部分相关批次已完成放行，林严谨要求给出患者与产品风险结论。',
          taskLabel: '批次决策', stem: '哪些行动属于合理的影响评价方案？',
          options: ['对暴露批次追加趋势和必要检验', '评估已放行产品风险并形成处置意见', '仅冻结当前批次后停止调查', '记录调查依据与质量批准'],
          correct: [0, 1, 3], insight: '已放行批次也不能脱离风险评价范围。',
          evidence: '证据：放行记录 / 补充检验 / 风险结论', deliverable: '批次影响评价报告',
        },
        {
          id: 'U-S09', kind: 'multiple', chapter: 'CAPA 闭环', sceneNumber: 5, speaker: PROJECT7_NPCS.qa, points: 10,
          context: '调查已锁定物料准入、参数控制与质量文化三类系统问题。',
          taskLabel: '设计 CAPA', stem: '哪些措施组成了可验证的预防性 CAPA？',
          options: ['增加供应商技术准入与小试评价', '建立关键参数报警/联锁', '调整异常上报与绩效质量权重', '仅对操作员再培训'],
          correct: [0, 1, 2], insight: '本科任务需要将根因转换为系统层面的预防措施。',
          evidence: '证据：根因与措施映射表', deliverable: 'CAPA 计划书',
        },
        {
          id: 'U-S10', kind: 'case', chapter: 'CAPA 闭环', sceneNumber: 5, speaker: PROJECT7_NPCS.qa, points: 10,
          context: '你将向质量负责人汇报，申请完成调查并进入终场答辩。',
          taskLabel: '有效性设计', stem: '结案报告中必须给出哪些有效性验证内容？',
          options: ['三个月或后续三批的观察周期', c.impactTests + '的接受标准', '同类偏差复发率与报警执行率', '“所有人已注意”口头结论'],
          correct: [0, 1, 2], insight: '只有设定指标、标准和周期，CAPA 才可能被证明有效。',
          evidence: '证据：有效性验证方案', deliverable: '调查结案及 CAPA 验证报告',
        },
      ]

  return common.map(makeQuestion).map(question => dramaForQuestion(question, c, track))
}

export function buildProject7BossQuestions(track: EducationTrack, carrier: CarrierCase): ScenarioQuestion[] {
  const rolePrefix = track === 'college' ? '合规审核' : '调查答辩'
  const questions: PromptSeed[] = track === 'college'
    ? [
        ['B01', 'single', '证据保全', `出现${carrier.productName} OOS 后，首要处置是？`, ['隔离批次并登记 OOS', '删除异常', '继续流转'], [0], '未判定批次应受控。'],
        ['B02', 'multiple', '证据保全', '可靠的原始证据包括？', ['原始图谱', '设备日志', '计算记录', '口头猜测'], [0, 1, 2], '证据必须可追溯。'],
        ['B03', 'sequence', '流程执行', '共用检验账号被发现后，合规员应按什么顺序处理？', ['登记数据可靠性偏差', '停用共享账号并保全日志', '复核受影响检验记录', '提交 QA 关闭确认'], [1, 0, 2, 3], '账号缺陷要先控制和保全，再进入偏差与影响复核。'],
        ['B04', 'multiple', '流程执行', '现场参数超限后需核对？', ['批记录', carrier.impactTests, '偏差报告', '餐饮订单'], [0, 1, 2], '按 SOP 完成事实和结果核对。'],
        ['B05', 'single', '批次追溯', '异常物料影响范围是？', ['所有同暴露批次', '仅当批', '不调查'], [0], '暴露范围决定检索范围。'],
        ['B06', 'multiple', '批次追溯', '可以归档为处置证据的是？', ['补充检验结果', 'QA 批准', '受影响清单', '未经确认口述'], [0, 1, 2], '结论需要材料支持。'],
        ['B07', 'sequence', '措施执行', 'CAPA 执行证据的归档顺序是？', ['完成有效性复核', '批准修订后的 SOP 或技术控制', '保存培训与执行记录', '提交关闭审批'], [1, 2, 0, 3], '执行需可审核，关闭前还要证明措施有效。'],
        ['B08', 'multiple', '措施执行', '有效性复核可查看？', ['后续批次趋势', '是否再发同类偏差', '参数报警执行', '页面颜色'], [0, 1, 2], '复核关注风险是否下降。'],
        ['B09', 'case', '结案审核', '复测合格但原 OOS 未调查完，应？', ['维持待判定并完成调查', '立即放行', '保留原数据', '通知 QA'], [0, 2, 3], '不能以复测取代流程。'],
        ['B10', 'case', '结案审核', '主管催促发货时，应执行？', ['按状态控制批次', '记录并升级', '先发货', '等待质量批准'], [0, 1, 3], '商业压力不能突破质量底线。'],
      ].map(([id, kind, chapter, stem, options, correct, insight]) => ({
        id: id as string, kind: kind as ScenarioQuestionKind, chapter: `${rolePrefix} / ${chapter}`, sceneNumber: 5,
        speaker: PROJECT7_NPCS.qa, points: 0, context: '终场核验进行中。', taskLabel: rolePrefix,
        stem: stem as string, options: options as string[], correct: correct as number[],
        insight: insight as string, evidence: '终场证据卷宗', deliverable: '审核结论',
      }))
    : [
        ['B01', 'single', '调查边界', `${carrier.productName}发生 OOS，调查策略首先应覆盖？`, ['实验室、工艺、物料及扩展范围', '只复测', '只处罚人员'], [0], '风险边界需要完整。'],
        ['B02', 'multiple', '数据可靠性', '审计追踪关闭会触发哪些行动？', ['保全数据', '回顾相关批次', '恢复并验证控制', '忽略过去'], [0, 1, 2], '系统缺陷需回溯。'],
        ['B03', 'sequence', '根因论证', '计算差错与参数超限同时存在，调查组长应按什么顺序建立结论？', ['区分实验室直接原因和生产系统原因', '保全并复核原始数据/设备日志', '验证工艺影响与物料线索', '形成根因、影响和 CAPA 映射'], [1, 0, 2, 3], '复杂偏差要先保全证据，再拆分原因并形成映射。'],
        ['B04', 'multiple', '5-Why', '王海访谈暴露的体系问题包括？', ['绩效导向', '升级通道', '参数联锁', '员工昵称'], [0, 1, 2], '管理与技术共同致因。'],
        ['B05', 'single', '影响评价', `针对${carrier.materialClue}，应扩大到？`, ['同暴露批次和相关放行产品', '当前样品', '不需扩大'], [0], '产品风险不能被遗漏。'],
        ['B06', 'multiple', '影响评价', '支持放行/处置结论的证据包括？', [carrier.impactTests, '质量批准', '物料变更评价', '销售需求'], [0, 1, 2], '决策依据是质量证据。'],
        ['B07', 'multiple', 'CAPA 设计', '预防复发的系统措施是？', ['准入评估', '参数联锁', '质量绩效权重', '单次口头警告'], [0, 1, 2], '措施需改变控制机制。'],
        ['B08', 'sequence', 'CAPA 验证', 'CAPA 可关闭前的验证顺序是？', ['对照预设接受标准', '收集后续批次和复发趋势', '确认报警/联锁持续执行', '形成关闭建议'], [1, 2, 0, 3], '有效性决定是否关闭，且必须用趋势和标准证明。'],
        ['B09', 'case', '放行答辩', '已放行批次被纳入影响调查，正确处置组合为？', ['开展风险评价', '必要时升级召回评估', '形成批准结论', '隐去异常'], [0, 1, 2], '已上市风险也需管理。'],
        ['B10', 'case', '最终结论', '如何证明风险已真正受控？', ['根因有证据', '措施有效性达标', '趋势无复发', '只呈现成功动画'], [0, 1, 2], '产品与体系都需闭环。'],
      ].map(([id, kind, chapter, stem, options, correct, insight]) => ({
        id: id as string, kind: kind as ScenarioQuestionKind, chapter: `${rolePrefix} / ${chapter}`, sceneNumber: 5,
        speaker: PROJECT7_NPCS.qa, points: 0, context: '质量负责人正在审阅你的调查报告。', taskLabel: rolePrefix,
        stem: stem as string, options: options as string[], correct: correct as number[],
        insight: insight as string, evidence: '终场答辩材料', deliverable: '放行与 CAPA 决策',
      }))

  return questions.map(makeQuestion).map(question => ({
    ...question,
    sceneMood: track === 'college' ? '终场合规审核台' : '质量负责人答辩席',
    narration: track === 'college'
      ? `你带着${carrier.productName}的调查案卷进入终场审核，系统将逐项核对流程、记录和证据。`
      : `质量负责人翻开${carrier.productName}调查报告，要求你用证据证明根因、影响和 CAPA 已经闭环。`,
    dialogue: [
      { speaker: '旁白', line: '终场灯光压低，偏差实体在证据链的空隙中凝聚成形。', tone: 'narrator' },
      { speaker: PROJECT7_NPCS.qa.name, title: PROJECT7_NPCS.qa.title, line: track === 'college' ? '按审核清单回答，不要跳过任何记录。' : '请用调查逻辑回答，而不是只给结论。', tone: 'npc' },
      { speaker: assignedRoleLabel(track), line: track === 'college' ? '我会逐项核对证据是否完整。' : '我会说明证据如何支持根因和 CAPA。', tone: 'player' },
    ],
    choicePrompt: track === 'college' ? '合规审核要求你选择正确处置。' : '调查答辩要求你选择可被批准的论证组合。',
  }))
}
