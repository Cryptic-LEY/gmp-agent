import { sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  userId: text('user_id').primaryKey(),
  orgId: text('org_id').notNull().default('default'),
  groupId: text('group_id'),
  role: text('role').notNull().default('student'),
  persona: text('persona').notNull().default('student'),
  displayName: text('display_name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  // 学生个人信息
  realName:  text('real_name'),
  school:    text('school'),
  major:     text('major'),
  className: text('class_name'),
  studentId: text('student_id'),
  idCard:    text('id_card'),
  phone:     text('phone'),
})

export const knowledgePoints = sqliteTable('knowledge_points', {
  kpId: text('kp_id').primaryKey(),
  conceptId: text('concept_id'),           // 同一概念跨edu_level的关联ID
  serialCode: text('serial_code'),         // 表格展示编号（K001/T0101/P01）
  granularity: text('granularity'),        // 项目级 | 任务级 | 点级
  eduLevel: text('edu_level'),             // 专科 | 本科
  projectName: text('project_name'),       // 所属项目
  taskName: text('task_name'),             // 所属任务
  title: text('title').notNull(),          // 知识点名称（概念标签）
  content: text('content'),               // 教材内容说明
  gmpArticles: text('gmp_articles'),       // 对应GMP条款（原始文本，用于解析kp_reg_links）
  sourceType: text('source_type').notNull().default('教材'),
  difficulty: integer('difficulty').notNull().default(3),
  pointType: text('point_type').notNull().default('知识点'),  // 知识点 | 技能点
  masteryRequirement: text('mastery_requirement'),
  embedding: text('embedding'),            // JSON序列化的float数组，用于向量检索
  status: text('status').notNull().default('active'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const kpDependencies = sqliteTable('kp_dependencies', {
  fromKpId: text('from_kp_id').notNull().references(() => knowledgePoints.kpId),
  toKpId: text('to_kp_id').notNull().references(() => knowledgePoints.kpId),
})

export const kpMastery = sqliteTable('kp_mastery', {
  userId: text('user_id').notNull().references(() => users.userId),
  kpId: text('kp_id').notNull().references(() => knowledgePoints.kpId),
  confidence: real('confidence').notNull().default(0),
  attemptCount: integer('attempt_count').notNull().default(0),
  correctCount: integer('correct_count').notNull().default(0),
  lastTestedAt: text('last_tested_at'),
})

export const userGameState = sqliteTable('user_game_state', {
  userId: text('user_id').primaryKey().references(() => users.userId),
  xp: integer('xp').notNull().default(0),
  points: integer('points').notNull().default(0), // 积分：游戏货币，与 XP 互不换算
  rankLevel: integer('rank_level').notNull().default(1),
  rankTitle: text('rank_title').notNull().default('GMP新人'),
  streakDays: integer('streak_days').notNull().default(0),
  maxStreak: integer('max_streak').notNull().default(0),
  punishUntil: text('punish_until'),
  lastLoginDate: text('last_login_date'),
})

export const checkinLog = sqliteTable('checkin_log', {
  userId: text('user_id').notNull().references(() => users.userId),
  date: text('date').notNull(), // YYYY-MM-DD
})

export const regLibrary = sqliteTable('reg_library', {
  regId: text('reg_id').primaryKey(),
  docType: text('doc_type').notNull(),       // GMP正文 | GMP附录 | 法律 | 规章
  regDoc: text('reg_doc').notNull(),          // 文件全称
  appendixName: text('appendix_name'),        // 附录名称（非附录为空）
  chapterName: text('chapter_name'),          // 所在章
  sectionName: text('section_name'),          // 所在节
  articleNum: text('article_num'),            // 条款编号（如"一"、"42"）
  content: text('content'),                   // 条款正文
  effectiveDate: text('effective_date'),      // 施行日期
  issuingOrg: text('issuing_org'),            // 发布机构
  embedding: text('embedding'),               // JSON序列化的float数组，用于向量检索
})

export const kpRegLinks = sqliteTable('kp_reg_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kpId: text('kp_id').notNull().references(() => knowledgePoints.kpId),
  regId: text('reg_id').notNull().references(() => regLibrary.regId),
})

export const caseLibrary = sqliteTable('case_library', {
  caseId: text('case_id').primaryKey(),              // CASE-CHM-001-001
  productName: text('product_name').notNull(),       // 卡马西平片
  dosageForm: text('dosage_form').notNull(),          // 片剂
  dosageCategory: text('dosage_category').notNull(), // 化学药制剂 | 化学原料药 | 中成药 | 中药饮片 | 生物制品
  sectionType: text('section_type').notNull(),       // 产品概述 | 处方依据 | 工艺操作 | 质量监控 | 质量标准 | 主要设备 | 工艺卫生 | 其他
  sectionName: text('section_name'),                 // 原始章节标题
  content: text('content'),
  sourceFile: text('source_file'),                   // 来源文件名
  embedding: text('embedding'),                      // JSON序列化float数组，用于向量检索
})

export const caseKpLinks = sqliteTable('case_kp_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  caseId: text('case_id').notNull().references(() => caseLibrary.caseId),
  kpId: text('kp_id').notNull().references(() => knowledgePoints.kpId),
})

// 前测结果 & 个性化学习方案
export const learningPlans = sqliteTable('learning_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.userId),
  eduLevel: text('edu_level').notNull(),      // college | undergraduate
  major: text('major').notNull(),
  score: integer('score').notNull(),           // 0-100
  wrongCount: integer('wrong_count').notNull().default(0),
  planData: text('plan_data').notNull(),       // JSON: PlanItem[]
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const simulationSessions = sqliteTable('simulation_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.userId),
  productName: text('product_name').notNull(),
  dosageCategory: text('dosage_category').notNull(),
  score: integer('score').notNull().default(0),
  maxScore: integer('max_score').notNull().default(0),
  answers: text('answers').notNull().default('[]'),  // JSON: AnswerRecord[]
  completedAt: text('completed_at').notNull().default(sql`(datetime('now'))`),
})

export const questionHistory = sqliteTable('question_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.userId),
  questionId: text('question_id').notNull(),   // 不 FK 约束，允许删题后历史仍存在
  userAnswer: text('user_answer').notNull(),    // 同 submit: 单选"A"，多选"ABD"
  isCorrect: integer('is_correct', { mode: 'boolean' }).notNull(),
  reviewed: integer('reviewed', { mode: 'boolean' }).notNull().default(false),
  answeredAt: text('answered_at').notNull().default(sql`(datetime('now'))`),
})

export const questions = sqliteTable('questions', {
  questionId: text('question_id').primaryKey(),
  kpId: text('kp_id'),
  questionType: text('question_type').notNull(), // 单选题 多选题 判断题 简答题 案例题
  stem: text('stem').notNull(),
  correctAnswer: text('correct_answer').notNull(),
  difficulty: text('difficulty').notNull().default('中'), // 易 中 难
  optionCount: integer('option_count'),
  optionA: text('option_a'),
  optionB: text('option_b'),
  optionC: text('option_c'),
  optionD: text('option_d'),
  optionE: text('option_e'),
  optionF: text('option_f'),
  optionG: text('option_g'),
  explanation: text('explanation'),
  projectName: text('project_name'),   // 所属项目名（由 extract 脚本写入）
  eduLevel: text('edu_level'),         // college | undergraduate
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── 技能库 ──────────────────────────────────────────────────────────────────

export const skillLibrary = sqliteTable('skill_library', {
  skillId:           text('skill_id').primaryKey(),           // SK-001 …
  skillName:         text('skill_name').notNull(),            // 技能点名称（概念标签）
  skillCategory:     text('skill_category').notNull(),        // 工具应用/操作执行/分析判断/文件编制/沟通应对
  eduLevel:          text('edu_level').notNull().default('通用'), // 专科/本科/通用
  difficulty:        integer('difficulty').notNull().default(3),  // 1-5
  description:       text('description'),                     // 技能点详细说明
  masteryStdCollege: text('mastery_std_college'),             // 专科达标标准
  masteryStdUg:      text('mastery_std_ug'),                  // 本科达标标准
  defectSource:      text('defect_source'),                   // 触发该技能的典型缺陷场景
  toolName:          text('tool_name'),                       // 主要依赖工具名称
  embedding:         text('embedding'),                       // JSON float 数组，向量检索用
  status:            text('status').notNull().default('active'),
})

// 技能 → 法规条款（多对多）
export const skillRegLinks = sqliteTable('skill_reg_links', {
  id:      integer('id').primaryKey({ autoIncrement: true }),
  skillId: text('skill_id').notNull().references(() => skillLibrary.skillId),
  regId:   text('reg_id').notNull().references(() => regLibrary.regId),
})

// 技能 → 实训项目（多对多）
export const skillTrainingLinks = sqliteTable('skill_training_links', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  skillId:    text('skill_id').notNull().references(() => skillLibrary.skillId),
  trainingId: text('training_id').notNull(),   // T01 ~ T11，外键由应用层保证（training_projects）
  isPrimary:  integer('is_primary', { mode: 'boolean' }).notNull().default(true),
})

// 实训项目主表
export const trainingProjects = sqliteTable('training_projects', {
  trainingId:   text('training_id').primaryKey(),        // T01 ~ T11
  displayName:  text('display_name').notNull(),          // 项目简称
  kpProjUg:     text('kp_proj_ug'),                      // 本科KP表中的project_name精确值
  kpProjCol:    text('kp_proj_col'),                     // 专科KP表中的project_name精确值
  hoursCollege: integer('hours_college'),                // 专科学时
  hoursUg:      integer('hours_ug'),                     // 本科学时
  seqOrder:     integer('seq_order').notNull(),          // 显示排序 1~11
})

// ── 模块课时分 ──────────────────────────────────────────────────────────────
// 记录学生完成各实训项目模块测试的成绩与换算后的课时分
// earned_hours = (project_hours / total_project_hours) × target_hours(48/54) × (score/100)
export const moduleScores = sqliteTable('module_scores', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  userId:      text('user_id').notNull().references(() => users.userId),
  trainingId:  text('training_id').notNull(),    // T01 ~ T11
  eduLevel:    text('edu_level').notNull(),       // college | undergraduate
  score:       integer('score').notNull(),        // 0-100
  earnedHours: real('earned_hours').notNull(),    // 换算后课时分（保留2位小数）
  completedAt: text('completed_at').notNull().default(sql`(datetime('now'))`),
})

// 技能 → 知识点（多对多，带置信度）
export const skillKpLinks = sqliteTable('skill_kp_links', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  skillId:    text('skill_id').notNull().references(() => skillLibrary.skillId),
  kpId:       text('kp_id').notNull().references(() => knowledgePoints.kpId),
  linkType:   text('link_type').notNull().default('reg_shared'),
  // project_reg: 同项目+共reg (1.0) | reg_shared: 跨项目共reg (0.7) | embedding: 向量匹配
  confidence: real('confidence').notNull().default(0.7),
})

// ── 课程学习模块 ───────────────────────────────────────────────────────────

// 章节讨论区主题
export const courseDiscussions = sqliteTable('course_discussions', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  trainingId: text('training_id').notNull(),                       // T01 ~ T11
  userId:     text('user_id').notNull().references(() => users.userId),
  title:      text('title').notNull(),
  content:    text('content').notNull(),
  tag:        text('tag').default('提问'),                          // 提问 | 心得 | 讨论 | 答疑
  pinned:     integer('pinned', { mode: 'boolean' }).notNull().default(false),
  viewCount:  integer('view_count').notNull().default(0),
  replyCount: integer('reply_count').notNull().default(0),
  createdAt:  text('created_at').notNull().default(sql`(datetime('now'))`),
})

// 讨论区回复
export const courseDiscussionReplies = sqliteTable('course_discussion_replies', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  discussionId: integer('discussion_id').notNull().references(() => courseDiscussions.id, { onDelete: 'cascade' }),
  userId:       text('user_id').notNull().references(() => users.userId),
  content:      text('content').notNull(),
  isAi:         integer('is_ai', { mode: 'boolean' }).notNull().default(false),
  createdAt:    text('created_at').notNull().default(sql`(datetime('now'))`),
})

// 教师布置的章节作业
export const courseAssignments = sqliteTable('course_assignments', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  trainingId:     text('training_id').notNull(),
  teacherId:      text('teacher_id').notNull().references(() => users.userId),
  title:          text('title').notNull(),
  description:    text('description').notNull(),
  assignmentType: text('assignment_type').notNull().default('案例分析'), // 案例分析 | 简答 | 文件编写
  maxScore:       integer('max_score').notNull().default(100),
  dueDate:        text('due_date'),
  createdAt:      text('created_at').notNull().default(sql`(datetime('now'))`),
})

// 学生作业提交
export const courseAssignmentSubmissions = sqliteTable('course_assignment_submissions', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  assignmentId: integer('assignment_id').notNull().references(() => courseAssignments.id, { onDelete: 'cascade' }),
  userId:       text('user_id').notNull().references(() => users.userId),
  content:      text('content').notNull(),
  score:        integer('score'),
  feedback:     text('feedback'),
  submittedAt:  text('submitted_at').notNull().default(sql`(datetime('now'))`),
  gradedAt:     text('graded_at'),
})

// 学习时长日志（按章节）
export const courseStudyLogs = sqliteTable('course_study_logs', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  userId:     text('user_id').notNull().references(() => users.userId),
  trainingId: text('training_id').notNull(),
  seconds:    integer('seconds').notNull(),
  activity:   text('activity').default('reading'),                  // reading | quiz | video | discussion
  loggedAt:   text('logged_at').notNull().default(sql`(datetime('now'))`),
})
