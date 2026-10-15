import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardTitle, Button, Badge, Empty, Stat } from "../components/ui";
import { pctColor, fmtPct, fmtNum, fmtYi, ACTION_STYLE } from "../lib/format";
import { useAppStore } from "../lib/store";

const Watchlist: React.FC = () => {
  const qc = useQueryClient();
  const [batch, setBatch] = useState("");
  const [group, setGroup] = useState("全部");
  const [filter, setFilter] = useState("全部");
  const [toast, setToast] = useState<string | null>(null);
  const { watchInterval, setWatchInterval, notifyEnabled, setNotifyEnabled } = useAppStore();
  const lastPrices = useRef<Record<string, number>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["monitor"],
    queryFn: api.monitor,
    refetchInterval: Math.max(2, watchInterval) * 1000,
  });
  const { data: paper, refetch: refetchPaper } = useQuery({
    queryKey: ["paperSummary"],
    queryFn: api.paperSummary,
    refetchInterval: 10000,
  });

  // 价格闪烁 + 浏览器通知
  useEffect(() => {
    data?.items.forEach((it) => {
      const p = it.quote?.price;
      const prev = lastPrices.current[it.code];
      if (p && prev && p !== prev) {
        const el = document.getElementById(`row-${it.code}`);
        if (el) {
          el.classList.remove("flash-up", "flash-down");
          void el.offsetWidth;
          el.classList.add(p > prev ? "flash-up" : "flash-down");
        }
      }
      if (p) lastPrices.current[it.code] = p;
    });
    if (notifyEnabled && "Notification" in window && Notification.permission === "granted") {
      data?.alerts?.forEach((a) => {
        if (!seen.has(a.id)) {
          new Notification("SmartInvest Pro 提醒", { body: a.message });
          seen.add(a.id);
        }
      });
    }
  }, [data, notifyEnabled]);

  const enableNotify = async () => {
    if (!("Notification" in window)) return setToast("浏览器不支持通知");
    const p = await Notification.requestPermission();
    setNotifyEnabled(p === "granted");
    setToast(p === "granted" ? "浏览器通知已开启" : "通知权限被拒绝");
  };

  const addBatch = async () => {
    const codes = batch.split(/[\n,;\s]+/).filter(Boolean);
    if (!codes.length) return;
    const r = await api.watchBatch(codes, group);
    setBatch("");
    setToast(`已添加 ${r.added.length} 只${(r as any).invalid?.length ? `，无效：${(r as any).invalid.join(",")}` : ""}`);
    qc.invalidateQueries({ queryKey: ["monitor"] });
  };

  const groups = ["全部", "持仓", "今日热点"];
  const items = (data?.items ?? []).filter((i) => filter === "全部" || i.group_name === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold">自选盯盘</h1>
        <div className="flex gap-1">
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setFilter(g)}
              className={`rounded px-2.5 py-1 text-xs ${filter === g ? "bg-accent/20 text-accent" : "text-mut hover:text-fg"}`}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-mut">
          <label className="flex items-center gap-1">
            刷新间隔
            <select
              value={watchInterval}
              onChange={(e) => setWatchInterval(+e.target.value)}
              className="rounded border border-line bg-card px-1.5 py-0.5 text-xs"
            >
              {[3, 5, 10, 30].map((s) => <option key={s} value={s}>{s} 秒</option>)}
            </select>
          </label>
          {!notifyEnabled ? (
            <Button onClick={enableNotify}>开启浏览器通知</Button>
          ) : (
            <Badge className="border-up/40 bg-up/10 text-up">通知已开启</Badge>
          )}
        </div>
      </div>

      {toast && <div className="rounded border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">{toast}</div>}
      {(data?.paper_triggers?.length ?? 0) > 0 && (
        <div className="space-y-1 rounded border border-up/40 bg-up/10 p-3">
          {data!.paper_triggers!.slice(0, 3).map((t, i) => (
            <div key={i} className="text-xs text-up">🎮 {t.message} {t.executed ? <Badge className="border-up/40 text-up">已模拟成交</Badge> : <Badge className="border-gold/40 text-gold">仅记录信号</Badge>}</div>
          ))}
        </div>
      )}
      {(data?.alerts?.length ?? 0) > 0 && (
        <div className="space-y-1 rounded border border-gold/40 bg-gold/10 p-3">
          {data!.alerts.slice(0, 3).map((a) => (
            <div key={a.id} className="text-xs text-gold">🔔 {a.message} <span className="text-mut">{a.created_at.slice(11)}</span></div>
          ))}
        </div>
      )}

      {/* 账户仓位 */}
      {data?.portfolio && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="持仓市值" value={<span className="num">{fmtNum(data.portfolio.total_mv)}</span>} />
          <Stat label="投入成本" value={<span className="num">{fmtNum(data.portfolio.total_cost)}</span>} />
          <Stat label="总盈亏" value={<span className={`num ${pctColor(data.portfolio.profit)}`}>{fmtNum(data.portfolio.profit)}</span>}
                sub={`${data.portfolio.profit_pct}%`} />
          <Stat label="监控标的" value={data.items.length} sub={`每 ${watchInterval}s 刷新`} />
        </div>
      )}

      {/* 模拟交易面板（纸面盘） */}
      <Card className={paper?.enabled ? "border-up/40" : ""}>
        <CardTitle
          icon="🎮"
          extra={
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const r = await api.paperToggle(!paper?.enabled);
                  setToast(r.enabled ? "模拟自动交易已开启：信号触发将自动虚拟成交" : "模拟自动交易已暂停：仅记录信号，不成交");
                  refetchPaper();
                  qc.invalidateQueries({ queryKey: ["monitor"] });
                }}
                className={`relative h-5 w-10 rounded-full transition-colors ${paper?.enabled ? "bg-up/70" : "bg-line"}`}
                title="模拟自动交易开关"
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${paper?.enabled ? "left-5" : "left-0.5"}`} />
              </button>
              <Badge className={paper?.enabled ? "border-up/40 bg-up/10 text-up" : "border-line bg-card2 text-mut"}>
                模拟自动交易 {paper?.enabled ? "运行中" : "关闭"}
              </Badge>
              <button className="text-[11px] text-mut hover:text-down" onClick={async () => { await api.paperReset(); refetchPaper(); qc.invalidateQueries({ queryKey: ["monitor"] }); setToast("模拟账户已重置为初始资金 100 万"); }}>重置</button>
            </div>
          }
        >
          模拟交易（纸面盘 · 初始资金 100 万 · 止盈止损/买点信号自动触发）
        </CardTitle>
        {paper && (
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="总资产" value={<span className="num">{fmtNum(paper.account.total)}</span>} />
              <Stat label="可用资金" value={<span className="num">{fmtNum(paper.account.cash)}</span>} />
              <Stat label="持仓市值" value={<span className="num">{fmtNum(paper.account.market_value)}</span>} />
              <Stat label="总盈亏" value={<span className={`num ${pctColor(paper.account.profit)}`}>{fmtNum(paper.account.profit)}</span>} sub={`${paper.account.profit_pct}%`} />
              <Stat label="持仓数 / 成交笔数" value={`${paper.positions.length} / ${paper.trades.length}`} />
            </div>
            <div className="rounded-md border border-line bg-card2 px-3 py-2 text-[11px] leading-5 text-mut">
              规则：无持仓且 AI 建议「增持」时，价格进入建议买点附近 → 自动买入现金的 20%（100 股取整）；有持仓且价格触及上限价（止盈）或下限价（止损）→ 自动清仓。
              上限/下限价在下方股票池表格中设置，未设置时使用 AI 建议的目标价/止损价。纯模拟盘，不涉及真实资金，不构成投资建议。
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-md border border-line">
                <div className="border-b border-line px-3 py-1.5 text-[11px] text-mut">交易记录（最近）</div>
                <div className="max-h-40 overflow-y-auto">
                  {paper.trades.length === 0 ? (
                    <div className="px-3 py-3 text-[11px] text-mut">暂无成交——开启模拟自动交易后，信号触发即成交</div>
                  ) : (
                    <table className="w-full text-[11px]">
                      <tbody>
                        {paper.trades.slice(0, 10).map((t) => (
                          <tr key={t.id} className="border-b border-line/40">
                            <td className="num px-2 py-1.5 text-mut">{t.created_at.slice(5, 16)}</td>
                            <td className="px-2 py-1.5">{t.name}</td>
                            <td className={`px-2 py-1.5 font-medium ${t.direction === "BUY" ? "text-up" : "text-down"}`}>
                              {t.direction === "BUY" ? "买入" : "卖出"}
                            </td>
                            <td className="num px-2 py-1.5 text-right">{t.price}</td>
                            <td className="num px-2 py-1.5 text-right text-mut">{t.shares}股</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              <div className="rounded-md border border-line">
                <div className="border-b border-line px-3 py-1.5 text-[11px] text-mut">信号历史（含未成交提示）</div>
                <div className="max-h-40 overflow-y-auto">
                  {paper.signals.length === 0 ? (
                    <div className="px-3 py-3 text-[11px] text-mut">暂无信号触发——设置上下限价并等待行情触及</div>
                  ) : (
                    <table className="w-full text-[11px]">
                      <tbody>
                        {paper.signals.slice(0, 10).map((s) => (
                          <tr key={s.id} className="border-b border-line/40">
                            <td className="num px-2 py-1.5 text-mut">{s.created_at.slice(5, 16)}</td>
                            <td className="px-2 py-1.5" title={s.message}>{s.message.slice(0, 32)}</td>
                            <td className="px-2 py-1.5 text-right">
                              {s.executed ? <span className="text-up">已成交</span> : <span className="text-gold">未执行</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* 批量添加 */}
      <Card>
        <CardTitle icon="➕">批量添加股票池（每行一个代码，支持 6 位代码）</CardTitle>
        <div className="flex gap-2 p-3">
          <textarea
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            rows={2}
            placeholder={"600519\n000001\n300750"}
            className="num min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-2 text-xs outline-none focus:border-accent/60"
          />
          <div className="flex flex-col justify-between">
            <select value={group} onChange={(e) => setGroup(e.target.value)} className="rounded border border-line bg-card px-2 py-1 text-xs">
              {groups.map((g) => <option key={g}>{g}</option>)}
            </select>
            <Button variant="primary" onClick={addBatch}>添加</Button>
          </div>
        </div>
      </Card>

      {/* 持仓表 */}
      <Card>
        <CardTitle icon="👁" extra={<span className="text-[11px] text-mut">设置成本/持股数与上下限价后启用盈亏与突破提醒</span>}>
          股票池（{items.length}）
        </CardTitle>
        {isLoading ? (
          <div className="p-4 text-sm text-mut">加载中…</div>
        ) : items.length === 0 ? (
          <Empty text="股票池为空，使用上方批量添加" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-mut">
                  {["代码", "名称", "现价", "涨跌幅", "成本", "持股", "盈亏", "下限", "上限", "建议", "操作"].map((h) => (
                    <th key={h} className="px-3 py-2 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const q = it.quote ?? ({} as any);
                  const profit = it.cost && it.shares ? (q.price - it.cost) * it.shares : null;
                  return (
                    <tr key={it.code} id={`row-${it.code}`} className="border-b border-line/40 transition-colors">
                      <td className="num px-3 py-2 text-mut">{it.code}</td>
                      <td className="px-3 py-2">{it.name || q.name}</td>
                      <td className="num px-3 py-2 font-medium">{fmtNum(q.price)}</td>
                      <td className={`num px-3 py-2 ${pctColor(q.change_pct)}`}>{fmtPct(q.change_pct)}</td>
                      <td className="num px-3 py-2 text-mut">{it.cost || "—"}</td>
                      <td className="num px-3 py-2 text-mut">{it.shares || "—"}</td>
                      <td className={`num px-3 py-2 ${profit == null ? "text-mut" : pctColor(profit)}`}>
                        {profit == null ? "—" : fmtNum(profit)}
                      </td>
                      <td className="num px-3 py-2 text-down/80">{it.lower_price || "—"}</td>
                      <td className="num px-3 py-2 text-up/80">{it.upper_price || "—"}</td>
                      <td className="px-3 py-2">
                        {it.signal?.advice && (
                          <Badge className={ACTION_STYLE[it.signal.advice.action] ?? ""}>
                            {it.signal.advice.action} {it.signal.advice.confidence}%
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          className="text-[11px] text-mut hover:text-down"
                          onClick={async () => { await api.watchDelete(it.code); qc.invalidateQueries({ queryKey: ["monitor"] }); }}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

const seen = new Set<number>();
export default Watchlist;
