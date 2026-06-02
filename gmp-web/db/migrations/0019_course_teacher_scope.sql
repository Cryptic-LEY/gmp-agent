ALTER TABLE course_lessons ADD COLUMN teacher_id VARCHAR(191) NULL AFTER training_id;
CREATE INDEX idx_course_lessons_teacher ON course_lessons (teacher_id);
ALTER TABLE course_lessons
  ADD CONSTRAINT fk_course_lessons_teacher
  FOREIGN KEY (teacher_id) REFERENCES users(user_id);

UPDATE course_lessons
SET teacher_id = (
  SELECT user_id FROM users WHERE email = '111@qq.com' AND role = 'teacher' LIMIT 1
)
WHERE teacher_id IS NULL
  AND EXISTS (SELECT 1 FROM users WHERE email = '111@qq.com' AND role = 'teacher');

UPDATE course_assignments
SET teacher_id = (
  SELECT user_id FROM users WHERE email = '111@qq.com' AND role = 'teacher' LIMIT 1
)
WHERE (teacher_id IS NULL OR teacher_id = '')
  AND EXISTS (SELECT 1 FROM users WHERE email = '111@qq.com' AND role = 'teacher');

UPDATE course_chapter_quizzes
SET teacher_id = (
  SELECT user_id FROM users WHERE email = '111@qq.com' AND role = 'teacher' LIMIT 1
)
WHERE (teacher_id IS NULL OR teacher_id = '')
  AND EXISTS (SELECT 1 FROM users WHERE email = '111@qq.com' AND role = 'teacher');

CREATE INDEX idx_course_chapter_quizzes_training ON course_chapter_quizzes (training_id);
ALTER TABLE course_chapter_quizzes DROP PRIMARY KEY;
ALTER TABLE course_chapter_quizzes ADD PRIMARY KEY (training_id, teacher_id);
