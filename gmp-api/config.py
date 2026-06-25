"""全局配置：从环境变量读取，提供默认值。"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

BASE_DIR = Path(__file__).parent.parent

# MySQL 连接（Python RAG 检索器）
MYSQL_HOST     = os.getenv("MYSQL_HOST",     "localhost")
MYSQL_PORT     = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_USER     = os.getenv("MYSQL_USER",     "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "gmp")

# 统一使用通义千问（DashScope）——LLM和Embedding共用同一个Key和BaseURL
DASHSCOPE_BASE_URL = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
DASHSCOPE_API_KEY  = os.getenv("DASHSCOPE_API_KEY",  "")

# LLM（OpenAI兼容协议）
LLM_BASE_URL       = os.getenv("LLM_BASE_URL",       DASHSCOPE_BASE_URL)
LLM_API_KEY        = os.getenv("LLM_API_KEY",        DASHSCOPE_API_KEY)
LLM_MODEL          = os.getenv("LLM_MODEL",          "qwen3-max-2026-01-23")
LLM_ENABLE_THINKING = os.getenv("LLM_ENABLE_THINKING", "false").lower() == "true"

# Embedding（text-embedding-v3，OpenAI兼容）
EMB_BASE_URL  = os.getenv("EMB_BASE_URL",  DASHSCOPE_BASE_URL)
EMB_API_KEY   = os.getenv("EMB_API_KEY",   DASHSCOPE_API_KEY)
EMB_MODEL     = os.getenv("EMB_MODEL",     "text-embedding-v3")
EMB_DIM       = int(os.getenv("EMB_DIM",   "1024"))

# RAG参数
RAG_TOP_K        = int(os.getenv("RAG_TOP_K",        "10"))    # 向量初检条数（作为图遍历起点）
RAG_GRAPH_HOP    = int(os.getenv("RAG_GRAPH_HOP",    "1"))     # 图遍历跳数
RAG_THRESHOLD    = float(os.getenv("RAG_THRESHOLD",  "0.45"))  # 向量检索最低相似度阈值
RAG_GRAPH_THRESHOLD = float(os.getenv("RAG_GRAPH_THRESHOLD", "0.35"))  # 图遍历候选的最低阈值（略宽松）
RAG_FINAL_TOP_N  = int(os.getenv("RAG_FINAL_TOP_N",  "15"))    # 最终输出给LLM的条数
HISTORY_TURNS    = int(os.getenv("HISTORY_TURNS",    "3"))     # 带入LLM的对话轮数（1轮=1问+1答）

# small-to-big 分块（01-vector-engine）
CHUNK_SMALL      = int(os.getenv("CHUNK_SMALL",   "300"))   # 小块目标字数（精准检索）
CHUNK_BIG        = int(os.getenv("CHUNK_BIG",     "1800"))  # 大块目标字数（充分生成）
CHUNK_OVERLAP    = int(os.getenv("CHUNK_OVERLAP", "60"))    # 相邻小块重叠字数

# re-rank（01-vector-engine 步骤6）
RAG_RERANK_ENABLED    = os.getenv("RAG_RERANK_ENABLED",    "true").lower() == "true"
RAG_RERANK_MODEL      = os.getenv("RAG_RERANK_MODEL",      "gte-rerank-v2")
RAG_RERANK_TOP_BEFORE = int(os.getenv("RAG_RERANK_TOP_BEFORE", "50"))  # rerank 前最多传入条数

# 上下文压缩（02-context-perf）
CTX_COMPRESS_ENABLED = os.getenv("CTX_COMPRESS_ENABLED", "true").lower() == "true"
CTX_COMPRESS_RATIO   = float(os.getenv("CTX_COMPRESS_RATIO", "0.5"))

# 语义缓存（02-context-perf）
SEMANTIC_CACHE_ENABLED  = os.getenv("SEMANTIC_CACHE_ENABLED",  "true").lower()  == "true"
SEMANTIC_CACHE_SIM_THRESHOLD = float(os.getenv("SEMANTIC_CACHE_SIM_THRESHOLD", "0.92"))
SEMANTIC_CACHE_MAX      = int(os.getenv("SEMANTIC_CACHE_MAX",   "2000"))   # LRU 容量
SEMANTIC_CACHE_TTL      = int(os.getenv("SEMANTIC_CACHE_TTL",   "3600"))   # 秒

# 模型路由（02-context-perf）
LLM_MODEL_SMALL = os.getenv("LLM_MODEL_SMALL", "qwen-turbo")   # 轻量任务
LLM_MODEL_HEAVY = os.getenv("LLM_MODEL_HEAVY", LLM_MODEL)      # 重推理/critique

# 并行检索（02-context-perf）
RAG_PARALLEL_RETRIEVE = os.getenv("RAG_PARALLEL_RETRIEVE", "true").lower() == "true"

# Agent 推理步骤上限（02-context-perf）
MAX_REASONING_STEPS = int(os.getenv("MAX_REASONING_STEPS", "5"))

# HyDE（01-vector-engine 步骤7，默认关）
RAG_HYDE_ENABLED   = os.getenv("RAG_HYDE_ENABLED",   "false").lower() == "true"
HYDE_LLM_MODEL     = os.getenv("HYDE_LLM_MODEL",     "qwen-turbo")  # HyDE 生成假设答案用轻量模型，与主 LLM 分开

# 四层记忆（03-memory）
MEMORY_ENABLED        = os.getenv("MEMORY_ENABLED",        "true").lower() == "true"
SUMMARY_TRIGGER_TURNS = int(os.getenv("SUMMARY_TRIGGER_TURNS", "6"))
PROFILE_ASYNC         = os.getenv("PROFILE_ASYNC",         "true").lower() == "true"

# 评估闭环（04-eval-loop）
EVAL_GOLDEN_PATH   = os.getenv("EVAL_GOLDEN_PATH",   "eval/golden_set.jsonl")
SELFCHECK_SAMPLES  = int(os.getenv("SELFCHECK_SAMPLES",  "5"))
COVE_ENABLED       = os.getenv("COVE_ENABLED",       "true").lower() == "true"
RAGAS_JUDGE_MODEL  = os.getenv("RAGAS_JUDGE_MODEL",  "qwen3-max-2026-01-23")

# 工具化 agent（05-function-calling）
TOOLS_ENABLED      = os.getenv("TOOLS_ENABLED",      "true").lower() == "true"
TOOL_ARG_RETRY     = int(os.getenv("TOOL_ARG_RETRY", "2"))   # InvalidArgs 自修正最大次数
GMP_WEB_BASE_URL   = os.getenv("GMP_WEB_BASE_URL",   "http://localhost:3000")

# 防死循环护栏（06-mcp-loop-guard）
GUARD_MAX_STEPS    = int(os.getenv("GUARD_MAX_STEPS",   "8"))
GUARD_MAX_TOKENS   = int(os.getenv("GUARD_MAX_TOKENS",  "12000"))
GUARD_REPEAT_LIMIT = int(os.getenv("GUARD_REPEAT_LIMIT","3"))
TOOL_TIMEOUT_SEC   = int(os.getenv("TOOL_TIMEOUT_SEC",  "15"))
TOOL_RETRY_MAX     = int(os.getenv("TOOL_RETRY_MAX",    "3"))
HITL_ENABLED       = os.getenv("HITL_ENABLED",       "true").lower() == "true"
MCP_ENABLED        = os.getenv("MCP_ENABLED",        "false").lower() == "true"

# ── 案例库目录（工业规程文件所在位置）─────────────────────────────────────────
CASE_LIB_DIR = str(BASE_DIR / "工业规程")

# ── 个性化学习方案：专业-剂型映射 ─────────────────────────────────────────────
# primary_category : case_library.dosage_category 对应值
# primary_forms    : 1-2个主剂型，贯穿教学始终
# primary_products : 主剂型对应的具体产品名（与 case_library.product_name 严格一致）
# auxiliary_categories : 辅助剂型大类，按需随机选取
MAJOR_DOSAGE_FORM_MAP: dict[str, dict] = {
    # ── 专科独有 ──────────────────────────────────────────────────────────────
    "药品生产技术": {
        "primary_category":      "化学药制剂",
        "primary_forms":         ["片剂", "颗粒剂"],
        "primary_products":      ["卡马西平片", "硫酸锌颗粒"],
        "auxiliary_categories":  ["化学药制剂"],
    },
    # ── 专科/本科共有 ─────────────────────────────────────────────────────────
    "药学": {
        "primary_category":      "化学药制剂",
        "primary_forms":         ["片剂", "胶囊剂"],
        "primary_products":      ["卡马西平片", "对乙酰氨基酚胶囊"],
        "auxiliary_categories":  ["化学药制剂"],
    },
    "药物制剂": {
        "primary_category":      "化学药制剂",
        "primary_forms":         ["片剂", "胶囊剂"],
        "primary_products":      ["卡马西平片", "对乙酰氨基酚胶囊"],
        "auxiliary_categories":  ["化学药制剂"],
    },
    "中药学": {
        "primary_category":      "中成药",
        "primary_forms":         ["中成药胶囊", "中药饮片"],
        "primary_products":      ["玄麦甘桔胶囊", "三七片"],
        "auxiliary_categories":  ["中成药", "中药饮片"],
    },
    "中药制药": {
        "primary_category":      "中成药",
        "primary_forms":         ["中成药胶囊", "中成药合剂"],
        "primary_products":      ["玄麦甘桔胶囊", "银翘合剂"],
        "auxiliary_categories":  ["中药饮片"],
    },
    "化学制药": {
        "primary_category":      "化学原料药",
        "primary_forms":         ["原料药"],
        "primary_products":      ["头孢曲松钠原料药", "卡马西平原料药"],
        "auxiliary_categories":  ["化学药制剂"],
    },
    "生物制药": {
        "primary_category":      "生物制品",
        "primary_forms":         ["冻干疫苗"],
        "primary_products":      ["冻干人用狂犬病疫苗"],
        "auxiliary_categories":  ["化学药制剂"],
    },
    "制药设备": {
        "primary_category":      "化学药制剂",
        "primary_forms":         ["片剂", "颗粒剂"],
        "primary_products":      ["卡马西平片", "硫酸锌颗粒"],
        "auxiliary_categories":  ["化学药制剂"],
    },
    "药事管理": {
        "primary_category":      "化学药制剂",
        "primary_forms":         ["片剂", "注射剂"],
        "primary_products":      ["卡马西平片", "注射用头孢曲松钠"],
        "auxiliary_categories":  ["化学药制剂", "化学原料药"],
    },
    "食品药品监督管理": {
        "primary_category":      "化学药制剂",
        "primary_forms":         ["片剂", "注射剂"],
        "primary_products":      ["卡马西平片", "注射用头孢曲松钠"],
        "auxiliary_categories":  ["化学药制剂", "化学原料药"],
    },
    # ── 本科独有 ──────────────────────────────────────────────────────────────
    "药品质量管理": {
        "primary_category":      "化学药制剂",
        "primary_forms":         ["片剂", "注射剂"],
        "primary_products":      ["卡马西平片", "注射用头孢曲松钠"],
        "auxiliary_categories":  ["化学药制剂", "化学原料药"],
    },
    "药事管理与服务": {
        "primary_category":      "化学药制剂",
        "primary_forms":         ["片剂", "注射剂"],
        "primary_products":      ["卡马西平片", "注射用头孢曲松钠"],
        "auxiliary_categories":  ["化学药制剂", "化学原料药"],
    },
}
