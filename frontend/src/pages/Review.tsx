import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardTitle, Button, Badge, Skeleton, Empty } from "../components/ui";
import { GaugeChart } from "../components/Gauge";
import { Sparkline } from "../components/Sparkline";
import { pctColor, fmtPct, fmtNum, fmtYi, LABEL_STYLE, STAGE_COLORS, downloadText } from "../lib/format";
import type { ReviewData } from "../lib/api";

const Review: React.FC = () => {
  const params = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [date, setDate] = useState<string>("");
  const targetDate = params.date || date || undefined;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["review", targetDate],
    queryFn: () => api.review(targetDate),
  });
  const { data: datesData } = useQuery({ queryKey: ["reviewDates"], queryFn: api.reviewDates });

  const generate = async () => {
    const latest = await api.review(undefined, true);
    qc.setQueryData(["review", undefined], latest);
    qc.invalidateQueries({ queryKey: ["reviewDates"] });
  };

  useEffect(() => {
    if (data && !date) setDate(data.date);
  }, [data]);

  const d = data;

  const exportPdf = () => window.print();
  const exportMd = () => {
    if (!d) return;
    const lines = [
      `# SmartInvest Pro 复盘 · ${d.date}`, "",
      `## 一句话总收口\n${d.summary}`, "",
      `## 涨跌停\n涨停 ${d.limit_stats.zt_total}（非ST ${d.limit_stats.zt_non_st} / ST ${d.limit_stats.zt_st}），炸板 ${d.limit_stats.zb_count}（炸板率 ${(d.limit_stats.zb_rate * 100).toFixed(0)}%），跌停 ${d.limit_stats.dt_count}，最高连板 ${d.limit_stats.max_lb} 板`, "",
      `## 资金流向`,
      ...d.capital.industry_in_top5.map((x) => `- 净流入 ${x.name} ${fmtYi(x.main_inflow)}`),
      ...d.capital.industry_out_top5.map((x) => `- 净流出 ${x.name} ${fmtYi(x.main_inflow)}`), "",
      `## 主线板块`,
      ...d.sectors.map((s) => `- [${s.label}] ${s.name}（${s.verdict}）：${s.analysis}`), "",
      `## 风险提示\n${d.risk}`, "",
      `## 情绪阶段\n${d.sentiment.stage}（${d.sentiment.gauge}/100，${d.sentiment.position_text}）\n${d.sentiment.assist}`, "",
      "---\n*仅供参考，不构成投资建议。*",
    ];
    downloadText(`review_${d.date}.md`, lines.join("\n"), "text/markdown;charset=utf-8");
  };
  const exportCsv = () => {
    if (!d) return;
    window.open(`/api/review/${d.date}/export.csv`, "_blank");
  };

  return (
    <div className="space-y-4">
      {/* 工具条 */}
      <div className="no-print flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold">复盘大师</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            navigate(`/review/${e.target.value}`);
          }}
          list="review-dates"
          className="num rounded-md border border-line bg-card px-2 py-1.5 text-xs [color-scheme:dark]"
        />
        <datalist id="review-dates">
          {datesData?.dates.map((x) => <option key={x} value={x} />)}
        </datalist>
        <Button variant="primary" onClick={generate} disabled={isFetching}>
          {isFetching ? "生成中…" : "生成复盘"}
        </Button>
        <div className="ml-auto flex gap-2">
          <Button onClick={exportPdf}>导出 PDF</Button>
          <Button onClick={exportMd}>Markdown</Button>
          <Button onClick={exportCsv}>CSV</Button>
        </div>
      </div>

      {!d && isLoading && <ReviewSkeleton />}
      {d && (
        <>
          {/* 3.1 一句话总收口 */}
          <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-transparent">
            <CardTitle icon="🎯" extra={<Badge className={d.engine === "llm" ? "border-up/40 bg-up/10 text-up" : "border-gold/40 bg-gold/10 text-gold"}>{d.engine === "llm" ? "LLM 生成" : "规则引擎"}</Badge>}>
              一句话总收口 · {d.date} {d.status === "intraday" && <span className="text-gold">（盘中未收盘）</span>}
            </CardTitle>
            <div className="px-4 py-3 text-[13.5px] leading-7">{d.summary}</div>
          </Card>

          {/* 今日核心判断（编号化结论） */}
          {d.judgments && d.judgments.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {d.judgments.map((j) => (
                <Card key={j.no} className="flex gap-3 p-4">
                  <span className="num text-2xl font-bold text-accent/70">{String(j.no).padStart(2, "0")}</span>
                  <div>
                    <Badge className="border-accent/40 bg-accent/10 text-accent">{j.tag}</Badge>
                    <div className="mt-1.5 text-[12.5px] leading-6 text-fg/90">{j.text}</div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* 下一步观察 */}
          {d.next_watch && d.next_watch.length > 0 && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardTitle icon="🔭">下一步观察（次日关键观察点）</CardTitle>
                <div className="space-y-1.5 px-4 py-3">
                  {d.next_watch.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12.5px] leading-6 text-fg/85">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                      {w.text}
                    </div>
                  ))}
                </div>
              </Card>
              <EventCalendarMini />
            </div>
          )}

          {/* 3.2 盘型 / 环境区 */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card>
              <CardTitle icon="📐">盘型环境</CardTitle>
              <div className="space-y-3 px-4 py-3">
                {d.market.indexes.map((i) => (
                  <div key={i.name} className="flex items-center justify-between">
                    <div>
                      <span className="text-[12px] text-mut">{i.name}</span>
                      <div className={`num text-base font-semibold ${pctColor(i.change_pct)}`}>{fmtNum(i.price)}</div>
                      <div className={`num text-[11px] ${pctColor(i.change_pct)}`}>{fmtPct(i.change_pct)}</div>
                    </div>
                    <Sparkline data={i.sparkline} up={i.change_pct >= 0} width={110} height={32} />
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardTitle icon="🧭">市场方向性广度</CardTitle>
              <GaugeChart
                value={d.market.breadth.gauge}
                label={d.market.breadth.label}
                sublabel={`上涨 ${d.market.breadth.up} 家 / 下跌 ${d.market.breadth.down} 家`}
                stages={[
                  { name: "偏弱收敛", color: "#22c55e" },
                  { name: "多空均衡", color: "#e3b341" },
                  { name: "偏强扩散", color: "#ef4444" },
                ]}
              />
            </Card>
            <Card>
              <CardTitle icon="📊">市场涨跌分布</CardTitle>
              <UpdownBars up={d.market.breadth.up} down={d.market.breadth.down} />
            </Card>
          </div>

          {/* 3.3 涨跌停 + 3.7 情绪 */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
            <LimitStats d={d} className="xl:col-span-3" />
            <Card className="xl:col-span-2">
              <CardTitle icon="🌡">情绪运行阶段</CardTitle>
              <GaugeChart
                value={d.sentiment.gauge}
                label={d.sentiment.stage}
                sublabel={d.sentiment.position_text}
              />
              <div className="px-4 pb-3 text-[11px] leading-5 text-mut">{d.sentiment.assist}</div>
            </Card>
          </div>

          {/* 3.4 资金流向证据区 */}
          <Card>
            <CardTitle icon="💰">资金流向证据</CardTitle>
            <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
              <FlowBars title="行业净流入 TOP5" rows={d.capital.industry_in_top5} color="#ef4444" />
              <FlowBars title="行业净流出 TOP5" rows={d.capital.industry_out_top5} color="#22c55e" />
              <StockFlowTable title="个股净流入 TOP5" rows={d.capital.stock_in_top5} />
              <StockFlowTable title="个股净流出 TOP5" rows={d.capital.stock_out_top5} />
            </div>
          </Card>

          {/* 3.5 主线 & 观察板块 */}
          <Card>
            <CardTitle icon="🔥" extra={<span className="text-[11px] text-mut">共 {d.sectors.length} 个方向</span>}>
              主线 & 观察板块
            </CardTitle>
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {d.sectors.map((s) => (
                <div key={s.name} className="rounded-lg border border-line bg-card2/50 p-3">
                  <div className="flex items-center justify-between">
                    <Badge className={LABEL_STYLE[s.label] ?? ""}>{s.label}</Badge>
                    <span className="text-[11px] text-mut">{s.verdict}</span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-sm font-semibold">{s.name}</span>
                    <span className={`num text-[11px] ${pctColor(s.change_pct)}`}>{fmtPct(s.change_pct)}</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-[11px] text-mut">
                    <span>净流入 <span className="num text-fg">{fmtYi(s.main_inflow)}</span></span>
                    <span>涨停 <span className="num text-up">{s.zt_count}</span></span>
                    <span>最高 <span className="num text-gold">{s.max_lbc} 板</span></span>
                  </div>
                  <div className="mt-2 text-[11.5px] leading-5 text-fg/80">{s.analysis}</div>
                  {s.members.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.members.map((m) => (
                        <button
                          key={m.code}
                          onClick={() => navigate(`/ai-analysis?code=${m.code}`)}
                          className={`num rounded border border-line bg-card px-1.5 py-0.5 text-[11px] hover:border-accent/50 ${pctColor(m.change_pct)}`}
                        >
                          {m.name} {fmtPct(m.change_pct)}
                          {m.lbc > 1 && <span className="ml-0.5 text-gold">{m.lbc}板</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {s.layers && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] text-accent">四分层分析</summary>
                      <div className="mt-1.5 space-y-1 text-[11px]">
                        {Object.entries(s.layers).map(([layer, list]) => (
                          <div key={layer} className="flex gap-1.5">
                            <span className="w-12 shrink-0 text-mut">{layer}</span>
                            <span className="text-fg/85">
                              {list.length ? list.map((m) => `${m.name}${m.change_pct != null ? `(${fmtPct(m.change_pct)})` : ""}`).join("、") : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* 3.6 风险边界 */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <Card className="border-down/40 bg-down/5 xl:col-span-2">
              <CardTitle icon="🚨">风险 / 风险边界</CardTitle>
              <div className="px-4 py-3 text-[13px] leading-6 text-fg/95">{d.risk}</div>
              {d.limit_stats.warning && (
                <div className="border-t border-down/20 px-4 py-2 text-[12px] text-up">
                  ⚠ {d.limit_stats.warning}（炸板率 {(d.limit_stats.zb_rate * 100).toFixed(0)}%）
                </div>
              )}
            </Card>
            <NewsCard />
          </div>

          {/* 3.8 方向轮动总表 */}
          <RotationTable d={d} />

          {/* 龙虎榜 */}
          {d.lhb.length > 0 && (
            <Card>
              <CardTitle icon="🐉">龙虎榜（机构 / 游资动向）</CardTitle>
              <div className="overflow-x-auto p-1">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-mut">
                      <th className="px-3 py-2 font-normal">股票</th>
                      <th className="px-3 py-2 font-normal">涨跌幅</th>
                      <th className="px-3 py-2 font-normal">龙虎榜净买入</th>
                      <th className="px-3 py-2 font-normal">上榜原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.lhb.map((x, i) => (
                      <tr key={i} className="border-t border-line/60">
                        <td className="px-3 py-2">{x.name}<span className="num ml-1 text-mut">{x.code}</span></td>
                        <td className={`num px-3 py-2 ${pctColor(x.change_pct)}`}>{fmtPct(x.change_pct)}</td>
                        <td className={`num px-3 py-2 ${pctColor(x.net_buy)}`}>{fmtYi(x.net_buy)}</td>
                        <td className="px-3 py-2 text-mut">{x.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {d.warnings.length > 0 && (
            <Card className="border-gold/40">
              <CardTitle icon="⚠️">数据降级说明</CardTitle>
              <ul className="list-inside list-disc px-4 py-3 text-[12px] text-gold">
                {d.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

/** 新浪财经 7x24 市场资讯（滚动直播流） */
const NewsCard: React.FC = () => {
  const { data } = useQuery({
    queryKey: ["liveNews"],
    queryFn: api.liveNews,
    refetchInterval: 120000,
  });
  return (
    <Card>
      <CardTitle icon="📰" extra={<span className="text-[11px] text-mut">新浪财经 7x24 · 每 2 分钟刷新</span>}>
        市场资讯
      </CardTitle>
      <div className="max-h-[300px] space-y-2 overflow-y-auto px-4 py-3">
        {(data?.items ?? []).length === 0 && (
          <div className="text-[12px] text-mut">资讯加载中…</div>
        )}
        {(data?.items ?? []).map((n) => (
          <div key={n.id} className="flex gap-2.5 text-[12px] leading-5">
            <span className="num shrink-0 text-accent/80">{n.time}</span>
            <span className="text-fg/85">{n.text}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

/** 近期事件日历：限售解禁 + 新股申购（东财数据中心） */
const EventCalendarMini: React.FC = () => {
  const { data } = useQuery({ queryKey: ["calendar"], queryFn: api.calendar, staleTime: 3600000 });
  return (
    <Card>
      <CardTitle icon="📅" extra={<span className="text-[11px] text-mut">解禁 {data?.lift_count ?? 0} · 新股 {data?.ipo_count ?? 0}</span>}>
        近期事件日历
      </CardTitle>
      <div className="max-h-[240px] divide-y divide-line/40 overflow-y-auto">
        {(data?.events ?? []).length === 0 && (
          <div className="px-4 py-3 text-[12px] text-mut">近期待披露事件较少</div>
        )}
        {(data?.events ?? []).map((e, i) => (
          <div key={i} className="flex items-center gap-2 px-4 py-2 text-[12px]">
            <span className="num shrink-0 text-mut">{e.date.slice(5)}</span>
            <Badge className={e.kind === "解禁" ? "border-gold/40 bg-gold/10 text-gold" : "border-accent/40 bg-accent/10 text-accent"}>{e.kind}</Badge>
            <span className="flex-1 truncate">{e.name}<span className="num ml-1 text-mut">{e.code}</span></span>
            <span className="num shrink-0 text-mut">
              {e.kind === "解禁" ? `${e.cap_yi ?? "—"} 亿` : e.price ? `发行价 ${e.price}` : "待定价"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};

const UpdownBars: React.FC<{ up: number; down: number }> = ({ up, down }) => {  const total = Math.max(1, up + down);
  const upPct = (up / total) * 100;
  return (
    <div className="space-y-3 px-4 py-5">
      <div className="flex h-8 overflow-hidden rounded-md">
        <div className="flex items-center justify-center bg-up/70 text-[11px] text-white" style={{ width: `${upPct}%` }}>
          涨 {up}
        </div>
        <div className="flex items-center justify-center bg-down/70 text-[11px] text-white" style={{ width: `${100 - upPct}%` }}>
          跌 {down}
        </div>
      </div>
      <div className="text-center text-[11px] text-mut">
        涨跌比 {up}:{down}（{upPct.toFixed(1)}% 上涨）
      </div>
    </div>
  );
};

const LimitStats: React.FC<{ d: ReviewData; className?: string }> = ({ d, className = "" }) => {
  const ls = d.limit_stats;
  return (
    <Card className={className}>
      <CardTitle icon="🚦">涨跌停情况</CardTitle>
      <div className="grid grid-cols-3 gap-3 p-4">
        {[
          { label: "正式封住涨停", value: ls.zt_total, color: "text-up", sub: `非ST ${ls.zt_non_st} · ST ${ls.zt_st}` },
          { label: "触及涨停（含炸板）", value: ls.zt_touched, color: "text-gold", sub: `炸板 ${ls.zb_count} 只` },
          { label: "跌停", value: ls.dt_count, color: "text-down", sub: `炸板率 ${(ls.zb_rate * 100).toFixed(0)}%` },
        ].map((x) => (
          <div key={x.label} className="rounded-lg border border-line bg-card2/40 px-3 py-4 text-center">
            <div className={`num text-3xl font-bold ${x.color}`}>{x.value}</div>
            <div className="mt-1 text-[11px] text-mut">{x.label}</div>
            <div className="text-[11px] text-mut/70">{x.sub}</div>
          </div>
        ))}
      </div>
      {ls.max_lb_stock && (
        <div className="border-t border-line px-4 py-2.5 text-[12px]">
          <span className="text-mut">连板高度：最高 </span>
          <span className="num font-semibold text-gold">{ls.max_lb} 板</span>
          <span className="text-mut"> — </span>
          <span>{ls.max_lb_stock.name}</span>
          <span className="num text-mut">（{ls.max_lb_stock.industry}）</span>
        </div>
      )}
      {ls.ladder.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-3">
          {ls.ladder.slice(0, 12).map((x) => (
            <span key={x.code} className={`num rounded border border-line bg-card px-1.5 py-0.5 text-[11px] ${x.is_st ? "text-purple-400" : "text-fg/85"}`}>
              {x.name}
              <span className="ml-1 text-gold">{x.lbc}板</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
};

const FlowBars: React.FC<{ title: string; rows: { name: string; main_inflow: number; change_pct: number }[]; color: string }> = ({ title, rows, color }) => {
  const max = Math.max(1e8, ...rows.map((r) => Math.abs(r.main_inflow)));
  return (
    <div>
      <div className="mb-2 text-[12px] font-medium text-fg/90">{title}</div>
      {rows.length === 0 && <Empty text="数据源降级，暂无资金流数据" />}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2 text-[12px]">
            <span className="w-24 shrink-0 truncate text-right text-mut">{r.name}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-card2">
              <div
                className="h-full rounded"
                style={{ width: `${(Math.abs(r.main_inflow) / max) * 100}%`, backgroundColor: color, opacity: 0.75 }}
              />
            </div>
            <span className="num w-20 shrink-0" style={{ color }}>{fmtYi(r.main_inflow, 1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const StockFlowTable: React.FC<{ title: string; rows: { code: string; name: string; change_pct: number; main_inflow: number }[] }> = ({ title, rows }) => {
  const navigate = useNavigate();
  return (
    <div>
      <div className="mb-2 text-[12px] font-medium text-fg/90">{title}</div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-mut">
            <th className="py-1 font-normal">排名</th>
            <th className="py-1 font-normal">名称</th>
            <th className="py-1 text-right font-normal">涨跌幅</th>
            <th className="py-1 text-right font-normal">净流入</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.code} className="cursor-pointer border-t border-line/50 hover:bg-card2" onClick={() => navigate(`/ai-analysis?code=${r.code}`)}>
              <td className="num py-1.5 text-mut">{i + 1}</td>
              <td className="py-1.5">{r.name}</td>
              <td className={`num py-1.5 text-right ${pctColor(r.change_pct)}`}>{fmtPct(r.change_pct)}</td>
              <td className={`num py-1.5 text-right ${pctColor(r.main_inflow)}`}>{fmtYi(r.main_inflow, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const RotationTable: React.FC<{ d: ReviewData }> = ({ d }) => {
  const [filter, setFilter] = useState<string>("全部");
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    d.rotation_table.forEach((r) => (m[r.position] = (m[r.position] || 0) + 1));
    return m;
  }, [d]);
  const rows = d.rotation_table.filter((r) => filter === "全部" || r.position === filter);

  return (
    <Card>
      <CardTitle icon="🔄" extra={
        <div className="flex gap-1">
          {["全部", "主线", "次主线", "活口", "情绪链", "失败轮动"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-0.5 text-[11px] ${filter === f ? "bg-accent/20 text-accent" : "text-mut hover:text-fg"}`}
            >
              {f}{f !== "全部" && counts[f] ? ` (${counts[f]})` : ""}
            </button>
          ))}
        </div>
      }>
        方向轮动总表
      </CardTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-mut">
              <th className="px-4 py-2 font-normal">方向</th>
              <th className="px-4 py-2 font-normal">定位</th>
              <th className="px-4 py-2 font-normal">板块量价</th>
              <th className="px-4 py-2 font-normal">方向成员池</th>
              <th className="px-4 py-2 font-normal">裁定</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.direction} className="border-b border-line/40 align-top">
                <td className="px-4 py-2.5 font-medium">{r.direction}</td>
                <td className="px-4 py-2.5"><Badge className={LABEL_STYLE[r.position] ?? ""}>{r.position}</Badge></td>
                <td className="num px-4 py-2.5 text-mut">{r.volume_price}</td>
                <td className="px-4 py-2.5 text-fg/80">{r.members}</td>
                <td className="px-4 py-2.5 text-mut">{r.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="该定位下暂无方向" />}
      </div>
    </Card>
  );
};

const ReviewSkeleton = () => (
  <div className="space-y-4">
    <Card className="p-4"><Skeleton className="h-5 w-1/4" /><Skeleton className="mt-3 h-12 w-full" /></Card>
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
    </div>
    <Skeleton className="h-40 rounded-lg" />
    <Skeleton className="h-64 rounded-lg" />
  </div>
);

export default Review;
