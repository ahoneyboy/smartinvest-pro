"""板块路由：板块列表/成分股/轮动路径。"""
from fastapi import APIRouter

from ..cache import cache
from ..config import REFRESH_FLOW_TTL
from ..sources import eastmoney as em
from ..services.review import build_review

router = APIRouter(prefix="/api/sector", tags=["sector"])


@router.get("/boards")
async def boards(type: str = "industry", sort: str = "inflow"):
    key = f"boards_{type}_{sort}"
    cached = cache.get_fresh(key, REFRESH_FLOW_TTL)
    if cached:
        return cached
    fid = "f62" if sort == "inflow" else "f3"
    items = await em.fetch_board_flow(type, pz=80, fid=fid)
    payload = {"type": type, "items": items}
    cache.set(key, payload)
    return payload


@router.get("/{bk_code}/stocks")
async def board_stocks(bk_code: str):
    return {"items": await em.fetch_board_stocks(bk_code, pz=60)}


@router.get("/rotation")
async def rotation():
    """AI 识别的板块轮动路径：基于最新复盘的主线/活口标注 + 历史标签。"""
    p = await build_review()
    path = [s["name"] for s in p["sectors"] if s["label"] in ("主线", "次主线", "活口")]
    return {
        "date": p["date"],
        "path": path,
        "text": " → ".join(path) if path else "暂无明确轮动路径",
        "sectors": p["sectors"],
    }
