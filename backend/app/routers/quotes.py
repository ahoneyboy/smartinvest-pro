"""行情路由：实时报价（多源交叉）、指数、K 线+指标、分时。"""
from fastapi import APIRouter, HTTPException, Query

from ..cache import cache
from ..config import REFRESH_QUOTE_TTL
from ..sources import eastmoney as em
from ..sources.symbols import full
from ..services import quotes as quotes_svc
from ..services import indicators as ind
from ..services import kline as kline_svc

router = APIRouter(prefix="/api", tags=["quotes"])


@router.get("/quotes")
async def quotes(codes: str = Query(..., description="逗号分隔，如 600519,000001")):
    code_list = [c.strip() for c in codes.split(",") if c.strip()][:80]
    return await quotes_svc.get_quotes(code_list)


@router.get("/quotes/indexes")
async def indexes():
    return {"indexes": await quotes_svc.get_index_quotes()}


@router.get("/kline/{code}")
async def kline(code: str, period: str = "day", limit: int = 120, with_indicators: bool = True):
    try:
        bars = await kline_svc.get_kline(code, period, limit)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not bars:
        raise HTTPException(404, "K线数据缺失")
    payload: dict = {"code": full(code), "period": period, "bars": bars}
    if with_indicators and period == "day":
        payload["indicators"] = ind.compute_all(bars)
    return payload


@router.get("/trends/{code}")
async def trends(code: str):
    try:
        rows = await em.fetch_trends(code, 1)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"code": full(code), "trends": rows}
