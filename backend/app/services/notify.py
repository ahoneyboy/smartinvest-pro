"""消息推送：钉钉群机器人 webhook（借鉴 InStock 订阅通知 / Ai_StockBot 推送思路）。"""
from __future__ import annotations

import httpx

from .. import db

KEY = "dingtalk_webhook"


def get_webhook() -> str:
    rows = db.query("SELECT value FROM settings WHERE key=?", (KEY,))
    return rows[0]["value"] if rows and rows[0]["value"] else ""


def set_webhook(url: str) -> None:
    db.execute("INSERT INTO settings(key,value) VALUES(?,?) "
               "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (KEY, url.strip()))


async def send_markdown(title: str, text: str) -> dict:
    """推送到钉钉群机器人。未配置时静默跳过。"""
    webhook = get_webhook()
    if not webhook:
        return {"sent": False, "reason": "未配置 webhook"}
    body = {
        "msgtype": "markdown",
        "markdown": {"title": title, "text": f"### {title}\n\n{text}\n\n> SmartInvest Pro 推送"},
    }
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.post(webhook, json=body)
            ok = r.status_code == 200 and r.json().get("errcode") == 0
            return {"sent": ok, "detail": r.text[:200] if not ok else ""}
    except Exception as e:  # noqa: BLE001
        return {"sent": False, "reason": str(e)[:150]}


async def push_alerts(alerts: list[dict]) -> None:
    """把告警批量推送为一条消息（有配置且消息非空时）。"""
    if not get_webhook() or not alerts:
        return
    lines = "\n".join(f"- **{a.get('name') or a.get('code', '')}** {a.get('message', '')}" for a in alerts[:10])
    await send_markdown("SmartInvest Pro 盯盘提醒", lines)
