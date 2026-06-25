-- 老师审核版缺陷模板库（GMP缺陷模板核对结果0612.xlsx → 核对总表）
-- 对照参考表：忠实保存 229 行审核数据，不参与 skill_library / RAG / embedding。
-- defect_code 非唯一（T-0x 教材类缺陷存在重复行），故用自增 id 作主键。
CREATE TABLE IF NOT EXISTS defect_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  seq_no VARCHAR(16),                          -- 总序号
  topic VARCHAR(128),                          -- 模板主题
  source_file VARCHAR(255),                    -- 模板文件
  defect_code VARCHAR(64),                     -- 缺陷编号（如 MAH-01，非唯一）
  defect_title VARCHAR(255),                   -- 缺陷标题
  defect_description TEXT,                      -- 缺陷描述
  template_risk_level VARCHAR(128),            -- 模板风险等级
  suggested_risk_level VARCHAR(128),           -- 建议核对等级
  risk_check_result VARCHAR(128),              -- 风险等级核对结果
  risk_reason TEXT,                            -- 风险判断理由
  legal_basis TEXT,                            -- 模板法条依据
  legal_locate_result VARCHAR(64),             -- 法条定位结果
  legal_locate_detail TEXT,                    -- 法条定位明细
  legal_excerpt LONGTEXT,                      -- 法条摘录
  source_ids TEXT,                             -- 公开来源ID
  source_names TEXT,                           -- 公开来源名称
  source_urls TEXT,                            -- 公开来源URL
  common_scenarios TEXT,                       -- 常见场景
  visible_evidence TEXT,                       -- 可见证据
  hidden_evidence TEXT,                        -- 隐藏证据
  correct_actions TEXT,                        -- 正确闭环动作
  remarks TEXT,                                -- 备注
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_defect_templates_code (defect_code),
  KEY idx_defect_templates_topic (topic)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
