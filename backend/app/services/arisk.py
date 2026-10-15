"""A-RISK 宏观风险服务：读取 a-share-monitor 项目生成的 arisk_data.json，
移植其「两层漏斗决策模型」（L1 信用脉冲 × L2 安全边际 → 仓位建议），
并聚合 ERP / 破净率 / 两融 / 成交 / 申万热力图 / ETF 流向等宏观指标。

数据仍由外部项目 update_arisk_data.py 每交易日收盘后更新；本服务支持一键触发该脚本。
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
from datetime import datetime

from .. import config
from ..cache import cache

ARISK_PATH = getattr(config, "ARISK_DATA_PATH", "")


def _load_raw() -> dict | None:
    path = ARISK_PATH
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def _age_hours(generated_at: str) -> float:
    try:
        dt = datetime.fromisoformat(generated_at)
        return (datetime.now() - dt).total_seconds() / 3600
    except Exception:
        return 999.0


def _impulse(credit_rows: list[dict]) -> list[float]:
    """社融存量同比一阶导 Δ（环比变化）。"""
    gs = [float(r.get("g") or 0) for r in credit_rows]
    return [round(gs[i] - gs[i - 1], 2) for i in range(1, len(gs))]


def _position_decision(credit_neg: bool, credit_pos: bool, crowding: int) -> dict:
    """两层漏斗 → 仓位建议（移植自 arisk_monitor_local.html，回测口径 2016-01~2026-07）。"""
    if credit_neg and crowding >= 80:
        return {"pct": "35–50%", "scheme": "danger",
                "desc": "信用收缩确认＋极度拥挤：未来 6-12 月承压且当下估值透支 → 主动降至 35–50%。"}
    if credit_neg and crowding >= 60:
        return {"pct": "50–65%", "scheme": "warn",
                "desc": "信用收缩确认（连续2月Δ<0）＋估值偏贵：第一层指向 6-12 月偏空，安全垫不厚 → 降至 50–65%，留加仓空间。"}
    if credit_neg:
        return {"pct": "50–65%", "scheme": "warn",
                "desc": "信用收缩已确认（回测：此状态后 6 月平均 -2.02%，胜率 36.8%）→ 降至 50–65%，规避中期下行。"}
    if credit_pos and crowding >= 80:
        return {"pct": "55–70%", "scheme": "warn",
                "desc": "信用扩张确认但估值/换手已极端 → 参与但控制风险，持仓 55–70%。"}
    if credit_pos and crowding >= 60:
        return {"pct": "70–85%", "scheme": "ok",
                "desc": "信用扩张确认、估值偏贵但未极端 → 持仓 70–85%，跟随中期向上。"}
    if credit_pos:
        return {"pct": "80–95%", "scheme": "ok",
                "desc": "信用扩张已确认（回测：此状态后 6 月平均 +6.24%，胜率 72.7%）＋估值合理 → 保持高仓位。"}
    if crowding >= 80:
        return {"pct": "45–60%", "scheme": "warn",
                "desc": "第一层未确认方向，但估值极低＋换手极高 → 安全垫太薄，主动降至 45–60%。"}
    if crowding >= 60:
        return {"pct": "60–75%", "scheme": "warn",
                "desc": "第一层未确认方向，估值偏贵 → 持仓 60–75%，设好止损。"}
    return {"pct": "70–85%", "scheme": "ok",
            "desc": "第一层未确认方向、估值合理 → 持仓 70–85%，等待 Δ 连续同号确认信用方向。"}


def _meta(block: dict) -> dict:
    """提取统一字段的元信息（来源/日期/是否估算/陈旧）。"""
    return {
        "source": block.get("source"),
        "date": block.get("date"),
        "stale": bool(block.get("stale")),
        "is_estimate": bool(block.get("is_estimate")),
    }


def build_payload(raw: dict) -> dict:
    v = {k: b.get("value") for k, b in raw.items() if isinstance(b, dict)}
    meta = {k: _meta(b) for k, b in raw.items() if isinstance(b, dict)}

    # ---- 决策模型输入 ----
    pe300 = float(v.get("pe_300") or 0)
    bond10y = float((v.get("bond10y") or {}).get("latest") or 0)
    erp = round(1 / pe300 * 100 - bond10y, 2) if pe300 > 0 else None  # 百分数
    erp_pct = round(min(100, max(0, ((erp - 2.0) / 5.0) * 100))) if erp is not None else None

    turnover = v.get("turnover") or {}
    turn_raw = turnover.get("avg_pct") or turnover.get("pct")
    turnover_pct = min(99, round(turn_raw / 3.5 * 100)) if turn_raw else 43

    imp = _impulse(v.get("credit_yoy") or [])
    expansion = len(imp) >= 2 and imp[-1] > 0 and imp[-2] > 0
    contraction = len(imp) >= 2 and imp[-1] < 0 and imp[-2] < 0
    credit_state = "expansion" if expansion else "contraction" if contraction else "neutral"

    crowding = round((100 - (erp_pct or 43)) * 0.55 + turnover_pct * 0.45)
    position = _position_decision(contraction, expansion, crowding)

    data_ok = pe300 > 0 and bond10y > 0 and bool(imp) and bool(turn_raw)
    decision = {
        "available": data_ok,
        "l1": {
            "name": "信用脉冲（社融存量同比 Δ）",
            "state": credit_state,
            "label": {"expansion": "扩张确认", "contraction": "收缩确认", "neutral": "未确认方向"}[credit_state],
            "impulse": imp[-10:],
            "months": [r.get("m") for r in (v.get("credit_yoy") or [])][-10:],
            "latest_yoy": (v.get("credit_yoy") or [{}])[-1].get("g"),
        },
        "l2": {
            "name": "安全边际（拥挤度）",
            "score": crowding,
            "label": "极度拥挤" if crowding >= 80 else "偏贵" if crowding >= 60 else "合理",
            "erp_position": erp_pct,
            "turnover_position": turnover_pct,
        },
        "position": position,
        "inputs_missing": [] if data_ok else ["pe_300/bond10y/credit_yoy/turnover 存在缺失"],
    }

    # ---- 展示字段 ----
    margin = v.get("margin") or {}
    margin_daily = margin.get("daily") or []
    bna = v.get("below_net_asset") or {}
    hv = v.get("hv30") or {}
    erp_hist = v.get("erp_history") or {}
    etf_cat = v.get("etf_categories") or {}

    def stale_of(key: str) -> bool:
        return bool(meta.get(key, {}).get("stale"))

    return {
        "generated_at": raw.get("generated_at"),
        "generated_date": raw.get("generated_date"),
        "age_hours": round(_age_hours(raw.get("generated_at") or ""), 1),
        "meta": meta,
        "decision": decision,
        "cards": {
            "erp": {"value": erp, "pct_mapped": erp_pct, "pct_5y": erp_hist.get("pct"),
                    "series": (erp_hist.get("series") or [])[-61:], "stale": stale_of("pe_300") or stale_of("bond10y")},
            "pe300": {"value": pe300, "stale": stale_of("pe_300")},
            "bond10y": {"value": bond10y, "hist": (v.get("bond10y") or {}).get("hist") or [], "stale": stale_of("bond10y")},
            "below_net": {"ratio": bna.get("ratio"), "count": bna.get("count"), "total": bna.get("total"),
                          "pct5y": bna.get("pct5y"), "series": (bna.get("series") or [])[-61:], "stale": stale_of("below_net_asset")},
            "hv30": {"value": hv.get("latest"), "pct": hv.get("pct"),
                     "hist": (hv.get("hist") or [])[-61:], "stale": stale_of("hv30")},
            "margin": {"latest": margin_daily[-1]["v"] if margin_daily else None,
                       "prev": margin_daily[-2]["v"] if len(margin_daily) >= 2 else None,
                       "daily": margin_daily[-61:], "stale": stale_of("margin")},
            "turnover": {"amount_yi": turnover.get("amount_yi"), "pct": turnover.get("pct"),
                         "series": (turnover.get("series") or [])[-21:], "stale": stale_of("turnover")},
            "credit": {"rows": (v.get("credit_yoy") or [])[-13:], "impulse": imp[-12:], "stale": stale_of("credit_yoy")},
        },
        "sector_live": v.get("sector_live") or [],
        "etf_categories": {"latest_date": etf_cat.get("latest_date"), "prev_date": etf_cat.get("prev_date"),
                           "categories": etf_cat.get("categories") or []},
        "fund_issuance": v.get("fund_issuance") or [],
        "limit_7d": v.get("limit_7d") or [],
    }


async def get_arisk(refresh_file: bool = False) -> dict:
    if refresh_file:
        cache.delete("arisk_payload")
    cached = cache.get_fresh("arisk_payload", 600)
    if cached:
        return cached
    raw = _load_raw()
    if not raw:
        return {"available": False, "reason": f"未找到 A-RISK 数据文件（{ARISK_PATH or '未配置 ARISK_DATA_PATH'}）",
                "hint": "请先在 a-share-monitor 项目运行 update_arisk_data.py，或设置 ARISK_DATA_PATH 环境变量"}
    payload = build_payload(raw)
    payload["available"] = True
    cache.set("arisk_payload", payload)
    return payload


_update_task: asyncio.Task | None = None


async def trigger_update() -> dict:
    """触发外部 a-share-monitor 项目更新（run_arisk_update.sh / update_arisk_data.py）。"""
    global _update_task
    if _update_task and not _update_task.done():
        return {"started": False, "reason": "已有更新任务在执行中"}

    arisk_dir = os.path.dirname(ARISK_PATH) if ARISK_PATH else ""
    if not arisk_dir or not os.path.isdir(arisk_dir):
        return {"started": False, "reason": "未找到 a-share-monitor 目录"}

    script = os.path.join(arisk_dir, "run_arisk_update.sh")
    if os.path.isfile(script):
        cmd = ["/bin/bash", script]
    else:
        py = os.path.join(arisk_dir, "venv", "bin", "python")
        updater = os.path.join(arisk_dir, "update_arisk_data.py")
        if not (os.path.isfile(py) and os.path.isfile(updater)):
            return {"started": False, "reason": "目录内未找到 run_arisk_update.sh 或 venv/bin/python + update_arisk_data.py"}
        cmd = [py, updater]

    log_path = os.path.join(config.DATA_DIR, "arisk_update.log")

    async def _run():
        def _blocking():
            with open(log_path, "w") as log:
                subprocess.Popen(cmd, cwd=arisk_dir, stdout=log, stderr=subprocess.STDOUT,
                                 start_new_session=True)

        await asyncio.get_event_loop().run_in_executor(None, _blocking)

    _update_task = asyncio.create_task(_run())
    return {"started": True, "log": log_path, "note": "全量抓取约 2–3 分钟，完成后点击刷新读取新数据"}
