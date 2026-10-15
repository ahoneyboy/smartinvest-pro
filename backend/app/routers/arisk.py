"""A-RISK 路由：宏观风险快照 + 触发外部数据更新。"""
from fastapi import APIRouter

from ..cache import cache
from ..services import arisk

router = APIRouter(prefix="/api/arisk", tags=["arisk"])


@router.get("")
async def arisk_snapshot():
    return await arisk.get_arisk()


@router.get("/refresh")
async def arisk_refresh():
    """重读 arisk_data.json（外部项目更新完成后调用）。"""
    payload = await arisk.get_arisk(refresh_file=True)
    return payload


@router.post("/update")
async def arisk_update():
    """触发 a-share-monitor 项目抓取最新数据（约 2–3 分钟）。"""
    return await arisk.trigger_update()
