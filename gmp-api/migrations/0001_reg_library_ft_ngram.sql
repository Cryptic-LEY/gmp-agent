-- 01-vector-engine：修复 reg_library 全文索引缺少 ngram 解析器的问题。
-- 原 ft_content 用默认空白解析器，对无空格中文几乎全部 0 命中（'质量'/'生产' 都查不到），
-- 导致混合检索的 BM25 半边对中文失效。改用 ngram 解析器（ngram_token_size 默认 2）。
--
-- 应用方式（本机 MySQL portable）：
--   & "C:\Users\Eryao\mysql-9.6.0-winx64\bin\mysql.exe" -u root gmp < gmp-api/migrations/0001_reg_library_ft_ngram.sql
--
-- 验证：MATCH(content) AGAINST('质量' IN BOOLEAN MODE) 应从 0 命中变为数百命中。

ALTER TABLE reg_library DROP INDEX ft_content;
ALTER TABLE reg_library ADD FULLTEXT INDEX ft_content (content) WITH PARSER ngram;
