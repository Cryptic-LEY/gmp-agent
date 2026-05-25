-- kp_mastery 加 (user_id, kp_id) 唯一约束，支持 upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_kp_mastery_user_kp
  ON kp_mastery (user_id, kp_id);
