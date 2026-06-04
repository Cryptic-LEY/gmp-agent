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
