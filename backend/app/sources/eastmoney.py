"""东方财富：指数、资金流向、板块、涨停/炸板/跌停池、龙虎榜（资金面证据源）。"""
from __future__ import annotations

from .registry import registry
from . import symbols

SRC = "东方财富"
PUSH2_HOSTS = [
    "https://push2.eastmoney.com",
    "https://push2delay.eastmoney.com",   # 延时镜像，主站限流时自动切换
    "https://90.push2.eastmoney.com",
]
PUSH2 = "{host}/api/qt"
PUSH2EX = "https://push2ex.eastmoney.com"
UT = "7eea3edcaed734bea9cbfc24409ed989"


async def _get(url_tpl: str, role: str) -> dict:
    """多主机轮换：url_tpl 中含 {host} 占位符，任一主机成功即返回。"""
    last: Exception | None = None
    for h in PUSH2_HOSTS:
        try:
            return await registry.get_json(SRC, role, url_tpl.format(host=h))
        except Exception as e:  # noqa: BLE001
            last = e
    assert last is not None
    raise last


def _push2_path(url_tpl: str) -> str:
    return url_tpl

INDEX_SECIDS = {
    "1.000001": "上证指数",
    "0.399001": "深证成指",
    "0.399006": "创业板指",
    "1.000300": "沪深300",
    "1.000688": "科创50",
    "100.HSI": "恒生指数",
    "100.NDX": "纳斯达克100",
}


OVERSEAS_SECIDS = [
    "100.HSI", "124.HSTECH", "100.N225", "100.KS11",
    "100.DJIA", "100.SPX", "100.NDX",
    "100.UDI", "101.GC00Y", "102.CL00Y",
]
OVERSEAS_TAG = {
    "HSI": "指数", "HSTECH": "指数", "N225": "指数", "KS11": "指数",
    "DJIA": "指数", "SPX": "指数", "NDX": "指数",
    "UDI": "汇率", "GC00Y": "商品", "CL00Y": "商品",
}


async def fetch_overseas_snapshot() -> list[dict]:
    """全球市场：海外指数 + 美元指数 + COMEX 黄金 + NYMEX 原油。"""
    url = (
        f"{PUSH2}/ulist.np/get?fltt=2&invt=2&fields=f2,f3,f4,f12,f13,f14"
        f"&secids={','.join(OVERSEAS_SECIDS)}"
    )
    data = await _get(url, "全球市场行情")
    out = []
    for d in (data.get("data") or {}).get("diff") or []:
        code = str(d.get("f12") or "")
        if not code or d.get("f2") == "-":
            continue
        out.append({
            "secid": f"{d.get('f13')}.{code}",
            "code": code,
            "name": d.get("f14"),
            "kind": OVERSEAS_TAG.get(code, "指数"),
            "price": _num(d.get("f2")),
            "change_pct": _num(d.get("f3")),
            "change": _num(d.get("f4")),
        })
    return out


async def fetch_etf_board(fid: str = "f3", po: int = 1, pz: int = 30) -> list[dict]:
    """场内基金（ETF/LOF）榜单。fid=f3 涨幅榜 / f62 主力净流入榜。"""
    url = (
        f"{PUSH2}/clist/get?fid={fid}&po={po}&pz={pz}&pn=1&np=1&fltt=2&invt=2"
        f"&fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024,b:MK0025"
        f"&fields=f2,f3,f5,f8,f12,f14,f62"
    )
    data = await _get(url, "ETF 基金榜单")
    out = []
    for d in (data.get("data") or {}).get("diff") or []:
        if d.get("f2") in ("-", None):
            continue
        out.append({
            "code": d.get("f12"),
            "name": d.get("f14"),
            "price": _num(d.get("f2")),
            "change_pct": _num(d.get("f3")) if d.get("f3") != "-" else 0.0,
            "volume": _num(d.get("f5")),
            "turnover_rate": _num(d.get("f8")),
            "main_inflow": _num(d.get("f62")),
        })
    return out


async def fetch_popularity(pz: int = 10) -> list[dict]:
    """东方财富人气榜（正在热议个股排名）。返回 [{code, rank}]。"""
    url = "https://emappdata.eastmoney.com/stockrank/getAllCurrentList"
    body = {"appId": "appId01", "globalId": "786e4c21-70dc-435a-93bb-38",
            "marketType": "", "pageIdx": 1, "pageSize": pz}
    data = await registry.post_json(SRC, "个股人气榜", url, json=body)
    out = []
    for x in (data.get("data") or []):
        sc = str(x.get("sc") or "")
        if len(sc) > 2:
            out.append({"code": sc[2:], "rank": x.get("rk")})
    return out


def _num(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


INDEX_SECID_BY_CODE = {
    "000001": "1.000001", "399001": "0.399001", "399006": "0.399006",
    "000300": "1.000300", "000688": "1.000688",
    "HSI": "100.HSI", "NDX": "100.NDX",
}


async def fetch_index_snapshot() -> list[dict]:
    url = (
        f"{PUSH2}/ulist.np/get?fltt=2&invt=2&fields=f2,f3,f4,f12,f14,f104,f105"
        f"&secids={','.join(INDEX_SECIDS)}"
    )
    data = await _get(url, "指数行情/市场广度")
    out = []
    for d in (data.get("data") or {}).get("diff") or []:
        code = str(d.get("f12") or "")
        secid = INDEX_SECID_BY_CODE.get(code) or _guess_secid(code)
        if not secid:
            continue
        out.append({
            "secid": secid,
            "code": code,
            "name": d.get("f14"),
            "price": _num(d.get("f2")),
            "change_pct": _num(d.get("f3")),
            "change": _num(d.get("f4")),
            "up_count": d.get("f104"),
            "down_count": d.get("f105"),
        })
    return out


def _guess_secid(code: str) -> str:
    try:
        return symbols.em_secid(code)
    except ValueError:
        return code


async def fetch_trends(code: str, ndays: int = 1) -> list[list]:
    """分时：[[time, price, avg_price, volume], ...]。接受六位代码或 secid（含 .）。"""
    secid = code if "." in code else symbols.em_secid(code)
    url = (
        f"https://push2his.eastmoney.com/api/qt/stock/trends2/get"
        f"?secid={secid}&ndays={ndays}&iscr=0"
        f"&fields1=f1,f2,f3,f7,f8&fields2=f51,f53,f56,f58"
    )
    data = await registry.get_json(SRC, "分时走势", url)
    return [
        [k.split(",")[0], _num(k.split(",")[1]), _num(k.split(",")[2]), _num(k.split(",")[3])]
        for k in (data.get("data") or {}).get("trends") or []
    ]


async def fetch_kline_em(code: str, klt: int = 101, lmt: int = 120) -> list[list]:
    """东财 K 线（备用源）：[date, open, close, high, low, volume, amount, pct]"""
    url = (
        f"https://push2his.eastmoney.com/api/qt/stock/kline/get"
        f"?secid={symbols.em_secid(code)}&klt={klt}&fqt=1&lmt={lmt}&end=20500101"
        f"&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57"
    )
    data = await registry.get_json(SRC, "K 线历史(备用)", url)
    rows = []
    for k in (data.get("data") or {}).get("klines") or []:
        p = k.split(",")
        rows.append([p[0], _num(p[1]), _num(p[2]), _num(p[3]), _num(p[4]), _num(p[5])])
    return rows


async def fetch_board_flow(kind: str = "industry", pn: int = 1, pz: int = 100, fid: str = "f62") -> list[dict]:
    """板块资金流 + 涨跌幅 + 上涨/下跌家数。kind: industry|concept"""
    fs = "m:90+t:2" if kind == "industry" else "m:90+t:3"
    url = (
        f"{PUSH2}/clist/get?fid={fid}&po=1&pz={pz}&pn={pn}&np=1&fltt=2&invt=2"
        f"&fs={fs}&fields=f3,f12,f14,f62,f66,f69,f72,f104,f105,f128,f136"
    )
    role = "行业板块资金流" if kind == "industry" else "概念板块资金流"
    data = await _get(url, role)
    out = []
    for d in (data.get("data") or {}).get("diff") or []:
        out.append({
            "bk_code": d.get("f12"),
            "name": d.get("f14"),
            "change_pct": _num(d.get("f3"), 0.0) if d.get("f3") != "-" else 0.0,
            "main_inflow": _num(d.get("f62")),       # 主力净流入（元）
            "super_inflow": _num(d.get("f66")),
            "up_count": d.get("f104"),
            "down_count": d.get("f105"),
            "leader": d.get("f128"),
            "leader_pct": _num(d.get("f136")) if d.get("f136") not in ("-", None) else 0.0,
        })
    return out


async def fetch_board_stocks(bk_code: str, pz: int = 50, fid: str = "f3") -> list[dict]:
    url = (
        f"{PUSH2}/clist/get?fid={fid}&po=1&pz={pz}&pn=1&np=1&fltt=2&invt=2"
        f"&fs=b:{bk_code}&fields=f2,f3,f5,f8,f12,f14,f62"
    )
    data = await _get(url, "板块成分股")
    out = []
    for d in (data.get("data") or {}).get("diff") or []:
        out.append({
            "code": d.get("f12"),
            "name": d.get("f14"),
            "price": _num(d.get("f2")),
            "change_pct": _num(d.get("f3")) if d.get("f3") != "-" else 0.0,
            "volume": _num(d.get("f5")),
            "turnover_rate": _num(d.get("f8")),
            "main_inflow": _num(d.get("f62")),
        })
    return out


async def fetch_stock_flow_rank(pn: int = 1, pz: int = 50, po: int = 1) -> list[dict]:
    """全 A 个股主力净流入排行。po=1 降序（净流入），po=0 升序（净流出）。"""
    url = (
        f"{PUSH2}/clist/get?fid=f62&po={po}&pz={pz}&pn={pn}&np=1&fltt=2&invt=2"
        f"&fs=m:0+t:6+f:!2,m:0+t:13+f:!2,m:0+t:80+f:!2,m:1+t:2+f:!2,m:1+t:23+f:!2"
        f"&fields=f2,f3,f5,f8,f12,f14,f62,f184"
    )
    data = await _get(url, "个股资金流排行")
    out = []
    for d in (data.get("data") or {}).get("diff") or []:
        out.append({
            "code": d.get("f12"),
            "name": d.get("f14"),
            "price": _num(d.get("f2")),
            "change_pct": _num(d.get("f3")) if d.get("f3") != "-" else 0.0,
            "main_inflow": _num(d.get("f62")),
            "inflow_pct": _num(d.get("f184")) if d.get("f184") not in ("-", None) else 0.0,
        })
    return out


async def fetch_stock_fflow_days(code: str, days: int = 5) -> list[dict]:
    """个股近 N 日主力资金（元）：main/super/large/medium/small 净额。"""
    url = (
        f"{PUSH2}/stock/fflow/daykline/get?lmt={days}&klt=101"
        f"&secid={symbols.em_secid(code)}&fields1=f1,f2,f3,f7"
        f"&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65"
    )
    data = await _get(url, "个股资金流")
    out = []
    for k in (data.get("data") or {}).get("klines") or []:
        p = k.split(",")
        out.append({
            "date": p[0],
            "main": _num(p[1]), "super": _num(p[2]), "large": _num(p[3]),
            "medium": _num(p[4]), "small": _num(p[5]),
            "main_pct": _num(p[6]),
        })
    return out


def _parse_pool(data: dict) -> dict:
    d = data.get("data") or {}
    pool = []
    for x in d.get("pool") or []:
        pool.append({
            "code": x.get("c"),
            "name": x.get("n"),
            "market": x.get("m"),
            "price": _num(x.get("p")) / 1000,
            "change_pct": _num(x.get("zdp")),
            "lbc": _num(x.get("lbc")),                 # 连板数
            "fbt": x.get("fbt"),                        # 首次封板时间 HHMMSS
            "lbt": x.get("lbt"),                        # 最后封板时间
            "fund": _num(x.get("fund")),                # 封板资金（元）
            "zbc": _num(x.get("zbc")),                  # 炸板次数
            "hs": _num(x.get("hs")),                    # 换手率
            "ltsz": _num(x.get("ltsz")),                # 流通市值
            "hybk": x.get("hybk") or "其他",
            "zt_stats": x.get("zttj") or {},            # {"days":x,"ct":y} -> x天y板
        })
    return {"count": d.get("tc", len(pool)), "date": d.get("qdate"), "pool": pool}


async def fetch_zt_pool(date: str) -> dict:
    """涨停池。date: YYYYMMDD"""
    url = f"{PUSH2EX}/getTopicZTPool?ut={UT}&dpt=wz.ztzt&Pageindex=0&pagesize=500&sort=fbt%3Aasc&date={date}"
    return _parse_pool(await registry.get_json(SRC, "涨停板数据", url))


async def fetch_zb_pool(date: str) -> dict:
    url = f"{PUSH2EX}/getTopicZBPool?ut={UT}&dpt=wz.ztzt&Pageindex=0&pagesize=500&sort=fbt%3Aasc&date={date}"
    return _parse_pool(await registry.get_json(SRC, "炸板数据", url))


async def fetch_dt_pool(date: str) -> dict:
    url = f"{PUSH2EX}/getTopicDTPool?ut={UT}&dpt=wz.ztzt&Pageindex=0&pagesize=500&sort=fund%3Aasc&date={date}"
    return _parse_pool(await registry.get_json(SRC, "跌停数据", url))


async def fetch_lhb(date: str, pz: int = 30) -> list[dict]:
    """龙虎榜（数据中心 API）。date: YYYY-MM-DD"""
    url = (
        "https://datacenter-web.eastmoney.com/api/data/v1/get"
        "?reportName=RPT_DAILYBILLBOARD_DETAILSNEW&columns=ALL&source=WEB"
        f"&sortColumns=BILLBOARD_NET_AMT&sortTypes=-1&pageSize={pz}&pageNumber=1"
        f"&filter=(TRADE_DATE%3D%27{date}%27)"
    )
    data = await registry.get_json(SRC, "龙虎榜", url)
    out = []
    for d in (data.get("result") or {}).get("data") or []:
        out.append({
            "code": d.get("SECURITY_CODE"),
            "name": d.get("SECURITY_NAME_ABBR"),
            "change_pct": _num(d.get("CHANGE_RATE")),
            "net_buy": _num(d.get("BILLBOARD_NET_AMT")),
            "buy": _num(d.get("BILLBOARD_BUY_AMT")),
            "sell": _num(d.get("BILLBOARD_SELL_AMT")),
            "reason": d.get("EXPLANATION"),
            "deal_amt": _num(d.get("ACCUM_AMOUNT")),
        })
    return out


async def fetch_all_market_snapshot(pz: int = 60) -> dict:
    """全市场概览：涨跌家数 + 平均涨幅（用于大盘强弱判断）。"""
    url = (
        f"{PUSH2}/clist/get?fid=f3&po=1&pz=1&pn=1&np=1&fltt=2&invt=2"
        f"&fs=m:0+t:6,m:0+t:13,m:0+t:80,m:1+t:2,m:1+t:23&fields=f105,f106"
    )
    data = await _get(url, "市场概览")
    total = (data.get("data") or {}).get("total") or 0
    return {"total": total}
