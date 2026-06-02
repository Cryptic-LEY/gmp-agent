ALTER TABLE users ADD COLUMN teacher_user_id VARCHAR(191) NULL;
CREATE INDEX idx_users_teacher ON users (teacher_user_id);
ALTER TABLE users
  ADD CONSTRAINT fk_users_teacher
  FOREIGN KEY (teacher_user_id) REFERENCES users(user_id);

UPDATE users AS student
JOIN users AS teacher ON teacher.email = '111@qq.com'
SET student.teacher_user_id = teacher.user_id
WHERE student.email = '123@qq.com';
