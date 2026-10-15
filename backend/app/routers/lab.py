"""研究与工具路由：策略选股、财经事件日历、钉钉推送配置。"""
from fastapi import APIRouter

from ..services import lab, notify

router = APIRouter(prefix="/api", tags=["lab"])


@router.get("/strategies")
async def strategies():
    return {"strategies": [{"key": k, "name": v} for k, v in lab.STRATEGIES.items()]}


@router.get("/screener/strategy/{key}")
async def strategy(key: str):
    return await lab.run_strategy(key)


@router.get("/calendar")
async def calendar():
    return await lab.event_calendar()


@router.get("/search/suggest")
async def search_suggest(q: str, count: int = 8):
    return {"items": await lab.search_suggest(q.strip(), count)}


@router.get("/news")
async def live_news():
    from ..sources import news
    return {"items": await news.fetch_live_news()}


# ---- 钉钉推送 ----

@router.get("/notify/config")
async def notify_config():
    webhook = notify.get_webhook()
    return {"configured": bool(webhook), "webhook_masked": (webhook[:34] + "…") if webhook else ""}


@router.post("/notify/config")
async def set_notify(body: dict):
    url = (body.get("webhook") or "").strip()
    if url and not url.startswith(("https://oapi.dingtalk.com", "http://oapi.dingtalk.com")):
        return {"ok": False, "reason": "请填写钉钉群机器人 webhook 地址（oapi.dingtalk.com 开头）"}
    notify.set_webhook(url)
    return {"ok": True, "configured": bool(url)}


@router.post("/notify/test")
async def notify_test():
    return await notify.send_markdown("SmartInvest Pro 测试", "这是一条测试消息——盯盘告警与模拟交易触发将推送到本群。")
