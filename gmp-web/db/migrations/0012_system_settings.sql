CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT,
  category TEXT NOT NULL DEFAULT 'system',
  label TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO system_settings (key, value, category, label, updated_at) VALUES
  ('llmModel', 'qwen-plus', 'ai', '大模型配置', datetime('now')),
  ('embeddingModel', 'text-embedding-v4', 'ai', 'Embedding 模型配置', datetime('now')),
  ('ragTopK', '8', 'ai', 'RAG 返回条数', datetime('now')),
  ('ragScoreThreshold', '0.35', 'ai', 'RAG 相似度阈值', datetime('now')),
  ('promptTemplate', '你是 GMP 智能体助学平台的教学助手，请结合知识库、学生画像和当前任务给出准确、可操作的回答。', 'ai', '提示词模板', datetime('now')),
  ('knowledgeUpdatedAt', '', 'ai', '知识库更新时间', datetime('now'));
