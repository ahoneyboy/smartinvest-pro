"""全局配置：环境变量优先，默认值兜底。"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("SI_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "smartinvest.db"

# ---- 服务 ----
HOST = os.getenv("SI_HOST", "0.0.0.0")
PORT = int(os.getenv("SI_PORT", "8000"))
CORS_ORIGINS = os.getenv(
    "SI_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")

# ---- LLM（OpenAI 兼容接口：DeepSeek/豆包/GPT 等）----
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1").strip().rstrip("/")
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat").strip()
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "60"))

# ---- 数据源 ----
HTTP_TIMEOUT = float(os.getenv("SI_HTTP_TIMEOUT", "4.0"))
CROSS_CHECK_THRESHOLD = 0.005  # 腾讯/新浪价格偏差 0.5% 触发告警

# ---- 刷新节奏（秒）----
REFRESH_QUOTE_TTL = 3.0      # 自选股行情
REFRESH_INDEX_TTL = 5.0      # 指数行情
REFRESH_FLOW_TTL = 60.0      # 资金流
REFRESH_REVIEW_TTL = 300.0   # 复盘聚合（盘中）
WATCH_INTERVAL_DEFAULT = 3.0  # 前端轮询默认间隔

# ---- A-RISK 宏观风险（a-share-monitor 项目集成）----
ARISK_DATA_PATH = os.getenv(
    "ARISK_DATA_PATH", str(BASE_DIR.parent.parent / "a-share-monitor" / "arisk_data.json")
)

# ---- 指标参数 ----
MA_PERIODS = (5, 10, 20, 60)
