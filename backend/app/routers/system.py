"""系统路由：数据源健康、LLM 状态。"""
from fastapi import APIRouter

from ..services.llm import llm_info
from ..services.quotes import get_source_status

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/sources")
async def sources():
    return {"sources": await get_source_status()}


@router.get("/llm")
async def llm():
    return llm_info()
