import { sql } from 'drizzle-orm'
import { bigint, boolean, date, datetime, double, int, mysqlTable, primaryKey, serial, text, varchar } from 'drizzle-orm/mysql-core'

const now = sql`CURRENT_TIMESTAMP(3)`

export const users = mysqlTable('users', {
  userId: varchar('user_id', { length: 191 }).primaryKey(),
  orgId: varchar('org_id', { length: 191 }).notNull().default('default'),
  groupId: varchar('group_id', { length: 191 }),
  role: varchar('role', { length: 32 }).notNull().default('student'),
  persona: varchar('persona', { length: 32 }).notNull().default('student'),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(now),
  realName: varchar('real_name', { length: 255 }),
  school: varchar('school', { length: 255 }),
  major: varchar('major', { length: 255 }),
  className: varchar('class_name', { length: 255 }),
  teacherUserId: varchar('teacher_user_id', { length: 191 }),
  studentId: varchar('student_id', { length: 191 }),
  idCard: varchar('id_card', { length: 64 }),
  phone: varchar('phone', { length: 64 }),
  avatarUrl: text('avatar_url'),
})

export const schoolProfiles = mysqlTable('school_profiles', {
  schoolId: varchar('school_id', { length: 191 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  code: varchar('code', { length: 64 }),
  region: varchar('region', { length: 255 }),
  contactPerson: varchar('contact_person', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 64 }),
  packageName: varchar('package_name', { length: 255 }).notNull().default('高校实训标准版'),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  openedAt: date('opened_at', { mode: 'string' }),
  expiresAt: date('expires_at', { mode: 'string' }),
  notes: text('notes'),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(now),
  updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const schoolClasses = mysqlTable('school_classes', {
  classId: varchar('class_id', { length: 191 }).primaryKey(),
  schoolId: varchar('school_id', { length: 191 }).notNull().references(() => schoolProfiles.schoolId),
  className: varchar('class_name', { length: 255 }).notNull(),
  major: varchar('major', { length: 255 }),
  educationLevel: varchar('education_level', { length: 64 }).notNull().default('本科'),
  gradeYear: varchar('grade_year', { length: 64 }),
  teacherUserId: varchar('teacher_user_id', { length: 191 }).references(() => users.userId),
  studentCapacity: int('student_capacity').notNull().default(0),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(now),
  updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const systemSettings = mysqlTable('system_settings', {
  key: varchar('key', { length: 191 }).primaryKey(),
  value: text('value'),
  category: varchar('category', { length: 64 }).notNull().default('system'),
  label: varchar('label', { length: 255 }),
  updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const knowledgePoints = mysqlTable('knowledge_points', {
  kpId: varchar('kp_id', { length: 191 }).primaryKey(),
  conceptId: varchar('concept_id', { length: 191 }),
  serialCode: varchar('serial_code', { length: 64 }),
  granularity: varchar('granularity', { length: 64 }),
  eduLevel: varchar('edu_level', { length: 64 }),
  projectName: varchar('project_name', { length: 255 }),
  taskName: varchar('task_name', { length: 255 }),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content'),
  gmpArticles: text('gmp_articles'),
  sourceType: varchar('source_type', { length: 64 }).notNull().default('教材'),
  difficulty: int('difficulty').notNull().default(3),
  pointType: varchar('point_type', { length: 64 }).notNull().default('知识点'),
  masteryRequirement: text('mastery_requirement'),
  embedding: text('embedding'),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const kpDependencies = mysqlTable('kp_dependencies', {
  fromKpId: varchar('from_kp_id', { length: 191 }).notNull().references(() => knowledgePoints.kpId),
  toKpId: varchar('to_kp_id', { length: 191 }).notNull().references(() => knowledgePoints.kpId),
})

export const kpMastery = mysqlTable('kp_mastery', {
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  kpId: varchar('kp_id', { length: 191 }).notNull().references(() => knowledgePoints.kpId),
  confidence: double('confidence').notNull().default(0),
  attemptCount: int('attempt_count').notNull().default(0),
  correctCount: int('correct_count').notNull().default(0),
  lastTestedAt: datetime('last_tested_at', { mode: 'string', fsp: 3 }),
})

export const userGameState = mysqlTable('user_game_state', {
  userId: varchar('user_id', { length: 191 }).primaryKey().references(() => users.userId),
  xp: int('xp').notNull().default(0),
  points: int('points').notNull().default(0),
  rankLevel: int('rank_level').notNull().default(1),
  rankTitle: varchar('rank_title', { length: 255 }).notNull().default('GMP新人'),
  streakDays: int('streak_days').notNull().default(0),
  maxStreak: int('max_streak').notNull().default(0),
  punishUntil: datetime('punish_until', { mode: 'string', fsp: 3 }),
  lastLoginDate: date('last_login_date', { mode: 'string' }),
})

export const checkinLog = mysqlTable('checkin_log', {
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  date: date('date', { mode: 'string' }).notNull(),
})

export const gameRewardClaims = mysqlTable('game_reward_claims', {
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  rewardKey: varchar('reward_key', { length: 191 }).notNull(),
  xp: int('xp').notNull().default(0),
  points: int('points').notNull().default(0),
  claimedAt: datetime('claimed_at', { mode: 'string', fsp: 3 }).notNull().default(now),
}, table => [
  primaryKey({ columns: [table.userId, table.rewardKey] }),
])

export const regLibrary = mysqlTable('reg_library', {
  regId: varchar('reg_id', { length: 191 }).primaryKey(),
  docType: varchar('doc_type', { length: 128 }).notNull(),
  regDoc: varchar('reg_doc', { length: 500 }).notNull(),
  appendixName: text('appendix_name'),
  chapterName: text('chapter_name'),
  sectionName: text('section_name'),
  articleNum: varchar('article_num', { length: 64 }),
  content: text('content'),
  effectiveDate: varchar('effective_date', { length: 64 }),
  issuingOrg: varchar('issuing_org', { length: 255 }),
  embedding: text('embedding'),
})

export const kpRegLinks = mysqlTable('kp_reg_links', {
  id: serial('id').primaryKey(),
  kpId: varchar('kp_id', { length: 191 }).notNull().references(() => knowledgePoints.kpId),
  regId: varchar('reg_id', { length: 191 }).notNull().references(() => regLibrary.regId),
})

export const caseLibrary = mysqlTable('case_library', {
  caseId: varchar('case_id', { length: 191 }).primaryKey(),
  productName: varchar('product_name', { length: 255 }).notNull(),
  dosageForm: varchar('dosage_form', { length: 128 }).notNull(),
  dosageCategory: varchar('dosage_category', { length: 128 }).notNull(),
  sectionType: varchar('section_type', { length: 128 }).notNull(),
  sectionName: varchar('section_name', { length: 255 }),
  content: text('content'),
  sourceFile: varchar('source_file', { length: 500 }),
  embedding: text('embedding'),
})

export const caseKpLinks = mysqlTable('case_kp_links', {
  id: serial('id').primaryKey(),
  caseId: varchar('case_id', { length: 191 }).notNull().references(() => caseLibrary.caseId),
  kpId: varchar('kp_id', { length: 191 }).notNull().references(() => knowledgePoints.kpId),
})

export const learningPlans = mysqlTable('learning_plans', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  eduLevel: varchar('edu_level', { length: 64 }).notNull(),
  major: varchar('major', { length: 255 }).notNull(),
  score: int('score').notNull(),
  wrongCount: int('wrong_count').notNull().default(0),
  planData: text('plan_data').notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const simulationSessions = mysqlTable('simulation_sessions', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  productName: varchar('product_name', { length: 255 }).notNull(),
  dosageCategory: varchar('dosage_category', { length: 128 }).notNull(),
  score: int('score').notNull().default(0),
  maxScore: int('max_score').notNull().default(0),
  answers: text('answers').notNull().default('[]'),
  completedAt: datetime('completed_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const questionHistory = mysqlTable('question_history', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  questionId: varchar('question_id', { length: 191 }).notNull(),
  userAnswer: text('user_answer').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  reviewed: boolean('reviewed').notNull().default(false),
  answeredAt: datetime('answered_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const questions = mysqlTable('questions', {
  questionId: varchar('question_id', { length: 191 }).primaryKey(),
  kpId: varchar('kp_id', { length: 191 }),
  questionType: varchar('question_type', { length: 64 }).notNull(),
  stem: text('stem').notNull(),
  correctAnswer: text('correct_answer').notNull(),
  difficulty: varchar('difficulty', { length: 32 }).notNull().default('中'),
  optionCount: int('option_count'),
  optionA: text('option_a'),
  optionB: text('option_b'),
  optionC: text('option_c'),
  optionD: text('option_d'),
  optionE: text('option_e'),
  optionF: text('option_f'),
  optionG: text('option_g'),
  explanation: text('explanation'),
  projectName: varchar('project_name', { length: 255 }),
  eduLevel: varchar('edu_level', { length: 64 }),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const skillLibrary = mysqlTable('skill_library', {
  skillId: varchar('skill_id', { length: 191 }).primaryKey(),
  skillName: varchar('skill_name', { length: 255 }).notNull(),
  skillCategory: varchar('skill_category', { length: 128 }).notNull(),
  eduLevel: varchar('edu_level', { length: 64 }).notNull().default('通用'),
  difficulty: int('difficulty').notNull().default(3),
  description: text('description'),
  masteryStdCollege: text('mastery_std_college'),
  masteryStdUg: text('mastery_std_ug'),
  defectSource: text('defect_source'),
  toolName: varchar('tool_name', { length: 255 }),
  embedding: text('embedding'),
  status: varchar('status', { length: 32 }).notNull().default('active'),
})

export const skillRegLinks = mysqlTable('skill_reg_links', {
  id: serial('id').primaryKey(),
  skillId: varchar('skill_id', { length: 191 }).notNull().references(() => skillLibrary.skillId),
  regId: varchar('reg_id', { length: 191 }).notNull().references(() => regLibrary.regId),
})

export const trainingProjects = mysqlTable('training_projects', {
  trainingId: varchar('training_id', { length: 191 }).primaryKey(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  kpProjUg: varchar('kp_proj_ug', { length: 255 }),
  kpProjCol: varchar('kp_proj_col', { length: 255 }),
  hoursCollege: int('hours_college'),
  hoursUg: int('hours_ug'),
  seqOrder: int('seq_order').notNull(),
})

export const skillTrainingLinks = mysqlTable('skill_training_links', {
  id: serial('id').primaryKey(),
  skillId: varchar('skill_id', { length: 191 }).notNull().references(() => skillLibrary.skillId),
  trainingId: varchar('training_id', { length: 191 }).notNull().references(() => trainingProjects.trainingId),
  isPrimary: boolean('is_primary').notNull().default(true),
})

export const moduleScores = mysqlTable('module_scores', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  trainingId: varchar('training_id', { length: 191 }).notNull().references(() => trainingProjects.trainingId),
  eduLevel: varchar('edu_level', { length: 64 }).notNull(),
  score: int('score').notNull(),
  earnedHours: double('earned_hours').notNull(),
  completedAt: datetime('completed_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const skillKpLinks = mysqlTable('skill_kp_links', {
  id: serial('id').primaryKey(),
  skillId: varchar('skill_id', { length: 191 }).notNull().references(() => skillLibrary.skillId),
  kpId: varchar('kp_id', { length: 191 }).notNull().references(() => knowledgePoints.kpId),
  linkType: varchar('link_type', { length: 64 }).notNull().default('reg_shared'),
  confidence: double('confidence').notNull().default(0.7),
})

export const courseDiscussions = mysqlTable('course_discussions', {
  id: serial('id').primaryKey(),
  trainingId: varchar('training_id', { length: 191 }).notNull().references(() => trainingProjects.trainingId),
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  tag: varchar('tag', { length: 64 }).notNull().default('提问'),
  pinned: boolean('pinned').notNull().default(false),
  viewCount: int('view_count').notNull().default(0),
  replyCount: int('reply_count').notNull().default(0),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const courseDiscussionReplies = mysqlTable('course_discussion_replies', {
  id: serial('id').primaryKey(),
  discussionId: bigint('discussion_id', { mode: 'number', unsigned: true }).notNull().references(() => courseDiscussions.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  content: text('content').notNull(),
  isAi: boolean('is_ai').notNull().default(false),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const courseAssignments = mysqlTable('course_assignments', {
  id: serial('id').primaryKey(),
  trainingId: varchar('training_id', { length: 191 }).notNull().references(() => trainingProjects.trainingId),
  teacherId: varchar('teacher_id', { length: 191 }).notNull().references(() => users.userId),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  assignmentType: varchar('assignment_type', { length: 128 }).notNull().default('案例分析'),
  maxScore: int('max_score').notNull().default(100),
  dueDate: datetime('due_date', { mode: 'string', fsp: 3 }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const courseAssignmentSubmissions = mysqlTable('course_assignment_submissions', {
  id: serial('id').primaryKey(),
  assignmentId: bigint('assignment_id', { mode: 'number', unsigned: true }).notNull().references(() => courseAssignments.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  content: text('content').notNull(),
  score: int('score'),
  feedback: text('feedback'),
  submittedAt: datetime('submitted_at', { mode: 'string', fsp: 3 }).notNull().default(now),
  gradedAt: datetime('graded_at', { mode: 'string', fsp: 3 }),
})

export const courseChapterQuizzes = mysqlTable('course_chapter_quizzes', {
  trainingId: varchar('training_id', { length: 191 }).notNull().references(() => trainingProjects.trainingId, { onDelete: 'cascade' }),
  teacherId: varchar('teacher_id', { length: 191 }).notNull().references(() => users.userId),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  questionCount: int('question_count').notNull().default(10),
  passScore: int('pass_score').notNull().default(60),
  durationMinutes: int('duration_minutes').notNull().default(30),
  status: varchar('status', { length: 32 }).notNull().default('draft'),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(now),
  updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull().default(now),
}, table => [
  primaryKey({ columns: [table.trainingId, table.teacherId] }),
])

export const courseStudyLogs = mysqlTable('course_study_logs', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  trainingId: varchar('training_id', { length: 191 }).notNull().references(() => trainingProjects.trainingId),
  seconds: int('seconds').notNull(),
  activity: varchar('activity', { length: 64 }).notNull().default('reading'),
  loggedAt: datetime('logged_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const courseLessons = mysqlTable('course_lessons', {
  lessonId: varchar('lesson_id', { length: 191 }).primaryKey(),
  trainingId: varchar('training_id', { length: 191 }).references(() => trainingProjects.trainingId),
  teacherId: varchar('teacher_id', { length: 191 }).references(() => users.userId),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  sortOrder: int('sort_order').notNull().default(0),
  pptUrl: text('ppt_url'),
  pptPageCount: int('ppt_page_count').notNull().default(0),
  videoUrl: text('video_url'),
  videoDuration: int('video_duration').notNull().default(0),
  testQuestions: text('test_questions').notNull().default('[]'),
  passScore: int('pass_score').notNull().default(60),
  status: varchar('status', { length: 32 }).notNull().default('draft'),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(now),
  updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const courseLessonProgress = mysqlTable('course_lesson_progress', {
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  lessonId: varchar('lesson_id', { length: 191 }).notNull().references(() => courseLessons.lessonId),
  pptViewedPages: text('ppt_viewed_pages').notNull().default('[]'),
  pptCompleted: boolean('ppt_completed').notNull().default(false),
  videoWatchedSeconds: int('video_watched_seconds').notNull().default(0),
  videoMaxPosition: int('video_max_position').notNull().default(0),
  videoCompleted: boolean('video_completed').notNull().default(false),
  testScore: double('test_score'),
  testPassed: boolean('test_passed').notNull().default(false),
  testCompleted: boolean('test_completed').notNull().default(false),
  noteContent: text('note_content'),
  annotationCount: int('annotation_count').notNull().default(0),
  lessonScore: double('lesson_score').notNull().default(0),
  completed: boolean('completed').notNull().default(false),
  updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull().default(now),
  completedAt: datetime('completed_at', { mode: 'string', fsp: 3 }),
}, table => [
  primaryKey({ columns: [table.userId, table.lessonId] }),
])

export const courseLessonAnnotations = mysqlTable('course_lesson_annotations', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 191 }).notNull().references(() => users.userId),
  lessonId: varchar('lesson_id', { length: 191 }).notNull().references(() => courseLessons.lessonId, { onDelete: 'cascade' }),
  resource: varchar('resource', { length: 32 }).notNull().default('ppt'),
  pageNumber: int('page_number'),
  videoTime: int('video_time'),
  text: text('text').notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})

export const courseFinalTests = mysqlTable('course_final_tests', {
  userId: varchar('user_id', { length: 191 }).primaryKey().references(() => users.userId),
  score: double('score').notNull().default(0),
  classHourScore: double('class_hour_score').notNull().default(0),
  completedAt: datetime('completed_at', { mode: 'string', fsp: 3 }).notNull().default(now),
})
