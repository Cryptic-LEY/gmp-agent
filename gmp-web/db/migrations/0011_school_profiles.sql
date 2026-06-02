CREATE TABLE IF NOT EXISTS school_profiles (
  school_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  region TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  package_name TEXT NOT NULL DEFAULT '高校实训标准版',
  status TEXT NOT NULL DEFAULT 'active',
  opened_at TEXT,
  expires_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS school_classes (
  class_id TEXT PRIMARY KEY NOT NULL,
  school_id TEXT NOT NULL REFERENCES school_profiles(school_id),
  class_name TEXT NOT NULL,
  major TEXT,
  education_level TEXT NOT NULL DEFAULT '本科',
  grade_year TEXT,
  teacher_user_id TEXT REFERENCES users(user_id),
  student_capacity INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_school_classes_school_id ON school_classes(school_id);
CREATE INDEX IF NOT EXISTS idx_school_classes_teacher ON school_classes(teacher_user_id);

INSERT OR IGNORE INTO school_profiles (
  school_id,
  name,
  code,
  package_name,
  status,
  opened_at,
  created_at,
  updated_at
)
SELECT
  'school-' || lower(hex(randomblob(8))),
  trimmed_school,
  '',
  '高校实训标准版',
  'active',
  date('now'),
  datetime('now'),
  datetime('now')
FROM (
  SELECT DISTINCT trim(school) AS trimmed_school
  FROM users
  WHERE trim(coalesce(school, '')) <> ''
);

INSERT OR IGNORE INTO school_classes (
  class_id,
  school_id,
  class_name,
  major,
  education_level,
  student_capacity,
  status,
  created_at,
  updated_at
)
SELECT
  'class-' || lower(hex(randomblob(8))),
  school_profiles.school_id,
  user_classes.class_name,
  user_classes.major,
  '本科',
  0,
  'active',
  datetime('now'),
  datetime('now')
FROM (
  SELECT DISTINCT
    trim(school) AS school_name,
    trim(coalesce(class_name, group_id, '默认班级')) AS class_name,
    trim(coalesce(major, '')) AS major
  FROM users
  WHERE role = 'student'
    AND trim(coalesce(school, '')) <> ''
    AND trim(coalesce(class_name, group_id, '')) <> ''
) AS user_classes
JOIN school_profiles ON school_profiles.name = user_classes.school_name
WHERE NOT EXISTS (
  SELECT 1
  FROM school_classes
  WHERE school_classes.school_id = school_profiles.school_id
    AND school_classes.class_name = user_classes.class_name
    AND coalesce(school_classes.major, '') = user_classes.major
);
