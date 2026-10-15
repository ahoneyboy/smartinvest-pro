import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardTitle, Button, Badge, Empty, Skeleton } from "../components/ui";
import { pctColor, fmtPct, fmtYi, LABEL_STYLE } from "../lib/format";

/** 板块中心：资金流排行 + 景气热力图 + ETF 监控 */
const Sector: React.FC = () => {
  const [type, setType] = useState<"industry" | "concept">("industry");
  const [sort, setSort] = useState<"inflow" | "pct">("inflow");
  const [view, setView] = useState<"list" | "heat">("list");
  const [tab, setTab] = useState<"board" | "etf">("board");
  const [selected, setSelected] = useState<string | null>(null);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["boards", type, sort],
    queryFn: () => api.boards(type, sort),
    refetchInterval: 60000,
  });
  const { data: rot } = useQuery({ queryKey: ["rotation"], queryFn: api.rotation });
  const { data: stocks } = useQuery({
    queryKey: ["boardStocks", selected],
    queryFn: () => api.boardStocks(selected!),
    enabled: !!selected,
  });
  const { data: etf } = useQuery({
    queryKey: ["etfBoard"],
    queryFn: api.etfBoard,
    refetchInterval: 60000,
    enabled: tab === "etf",
  });

  const items = data?.items ?? [];
  const maxAbs = Math.max(1e8, ...items.map((i) => Math.abs(i.main_inflow)));

  // 景气分（0-100）：资金净流入强度 45% + 板块涨幅 35% + 上涨家数占比 20%
  const heatScore = (b: any) => {
    const f = Math.max(0, Math.min(1, b.main_inflow / 4e9)) * 45;
    const p = Math.max(0, Math.min(1, b.change_pct / 4)) * 35;
    const w = b.up_count + b.down_count > 0 ? (b.up_count / (b.up_count + b.down_count)) * 20 : 10;
    return Math.round(f + p + w);
  };
  const heatColor = (s: number) =>
    s >= 70 ? "#ef4444" : s >= 55 ? "#e36248" : s >= 45 ? "#e3b341" : s >= 30 ? "#3f7d4e" : "#22c55e";

  const EtfTable: React.FC<{ rows: any[]; inflow?: boolean }> = ({ rows, inflow }) => (
    <table className="w-full text-[12px]">
      <thead className="sticky top-0 bg-card">
        <tr className="border-b border-line text-left text-mut">
          <th className="px-3 py-2 font-normal">名称</th>
          <th className="px-3 py-2 text-right font-normal">现价</th>
          <th className="px-3 py-2 text-right font-normal">涨跌幅</th>
          <th className="px-3 py-2 text-right font-normal">{inflow ? "主力净流入" : "换手率"}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s: any) => (
          <tr key={s.code} className="border-b border-line/40 hover:bg-card2">
            <td className="px-3 py-2">{s.name}<span className="num ml-1.5 text-mut">{s.code}</span></td>
            <td className="num px-3 py-2 text-right">{s.price}</td>
            <td className={`num px-3 py-2 text-right ${pctColor(s.change_pct)}`}>{fmtPct(s.change_pct)}</td>
            <td className={`num px-3 py-2 text-right ${inflow ? pctColor(s.main_inflow) : "text-mut"}`}>
              {inflow ? fmtYi(s.main_inflow, 2) : `${s.turnover_rate}%`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold">板块中心</h1>
        <div className="flex rounded-md border border-line p-0.5">
          {(["board", "etf"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded px-3 py-1 text-xs ${tab === t ? "bg-accent/20 text-accent" : "text-mut"}`}>
              {t === "board" ? "行业/概念" : "ETF 监控"}
            </button>
          ))}
        </div>
        {tab === "board" && (
          <>
            <div className="flex rounded-md border border-line p-0.5">
              {(["industry", "concept"] as const).map((t) => (
                <button key={t} onClick={() => setType(t)}
                  className={`rounded px-3 py-1 text-xs ${type === t ? "bg-accent/20 text-accent" : "text-mut"}`}>
                  {t === "industry" ? "行业板块" : "概念板块"}
                </button>
              ))}
            </div>
            <div className="flex rounded-md border border-line p-0.5">
              {(["inflow", "pct"] as const).map((s) => (
                <button key={s} onClick={() => setSort(s)}
                  className={`rounded px-3 py-1 text-xs ${sort === s ? "bg-accent/20 text-accent" : "text-mut"}`}>
                  {s === "inflow" ? "按主力净流入" : "按涨跌幅"}
                </button>
              ))}
            </div>
            <div className="flex rounded-md border border-line p-0.5">
              {(["list", "heat"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`rounded px-3 py-1 text-xs ${view === v ? "bg-accent/20 text-accent" : "text-mut"}`}>
                  {v === "list" ? "列表" : "景气热力图"}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {tab === "etf" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardTitle icon="📈">ETF 涨幅榜 TOP20</CardTitle>
            <div className="max-h-[560px] overflow-y-auto">
              {!etf && <div className="p-4"><Skeleton className="h-64" /></div>}
              {etf && <EtfTable rows={etf.gainers} />}
            </div>
          </Card>
          <Card>
            <CardTitle icon="💰">ETF 主力净流入 TOP20</CardTitle>
            <div className="max-h-[560px] overflow-y-auto">
              {!etf && <div className="p-4"><Skeleton className="h-64" /></div>}
              {etf && <EtfTable rows={etf.inflow} inflow />}
            </div>
          </Card>
        </div>
      ) : (
        <>
          {/* AI 轮动路径 */}
          <Card className="border-accent/30">
            <CardTitle icon="🔄">AI 板块轮动路径（{rot?.date}）</CardTitle>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-[13px]">
              {rot?.path?.length ? (
                rot.path.map((p, i) => (
                  <React.Fragment key={p}>
                    {i > 0 && <span className="text-mut">→</span>}
                    <span className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5">{p}</span>
                  </React.Fragment>
                ))
              ) : (
                <span className="text-mut">暂无明确轮动路径</span>
              )}
            </div>
          </Card>

          {view === "heat" ? (
            /* 景气热力图：格子大小按资金流，颜色按景气分 */
            <Card>
              <CardTitle icon="🔥" extra={<span className="text-[11px] text-mut">颜色=景气分（资金45%+涨幅35%+广度20%）· 格子按净流入排序</span>}>
                行业景气热力图
              </CardTitle>
              {isLoading ? (
                <div className="p-4"><Skeleton className="h-72" /></div>
              ) : (
                <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-6">
                  {items.slice(0, 24).map((b) => {
                    const score = heatScore(b);
                    return (
                      <button
                        key={b.bk_code}
                        onClick={() => setSelected(b.bk_code)}
                        className="rounded-lg border p-3 text-left transition-transform hover:scale-[1.03]"
                        style={{ backgroundColor: `${heatColor(score)}22`, borderColor: `${heatColor(score)}55` }}
                      >
                        <div className="truncate text-[13px] font-semibold" style={{ color: heatColor(score) }}>{b.name}</div>
                        <div className="num mt-1 text-lg font-bold" style={{ color: heatColor(score) }}>{score}</div>
                        <div className={`num text-[11px] ${pctColor(b.change_pct)}`}>{fmtPct(b.change_pct)}</div>
                        <div className="num text-[10px] text-mut">{fmtYi(b.main_inflow, 1)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-2 border-t border-line px-4 py-2 text-[10px] text-mut">
                景气度
                <span className="h-2 w-24 rounded" style={{ background: "linear-gradient(90deg,#22c55e,#e3b341,#ef4444)" }} />
                活跃
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {/* 板块排行 */}
              <Card>
                <CardTitle icon="🏭" extra={<span className="text-[11px] text-mut">点击行查看成分股</span>}>
                  {type === "industry" ? "行业" : "概念"}板块资金流排行
                </CardTitle>
                <div className="max-h-[560px] overflow-y-auto">
                  {isLoading && <div className="p-4"><Skeleton className="h-64" /></div>}
                  {!isLoading && items.length === 0 && <Empty text="数据源暂不可用" />}
                  {items.map((b) => (
                    <button
                      key={b.bk_code}
                      onClick={() => setSelected(b.bk_code)}
                      className={`flex w-full items-center gap-3 border-b border-line/40 px-4 py-2 text-left text-[12px] hover:bg-card2 ${selected === b.bk_code ? "bg-card2" : ""}`}
                    >
                      <span className="w-24 shrink-0 truncate font-medium">{b.name}</span>
                      <div className="h-3.5 flex-1 overflow-hidden rounded bg-card2">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${(Math.abs(b.main_inflow) / maxAbs) * 100}%`,
                            backgroundColor: b.main_inflow >= 0 ? "#ef4444" : "#22c55e",
                            opacity: 0.7,
                          }}
                        />
                      </div>
                      <span className={`num w-20 shrink-0 text-right ${pctColor(b.main_inflow)}`}>{fmtYi(b.main_inflow, 1)}</span>
                      <span className={`num w-16 shrink-0 text-right ${pctColor(b.change_pct)}`}>{fmtPct(b.change_pct)}</span>
                      <span className="hidden w-20 shrink-0 truncate text-right text-mut sm:block" title={b.leader || ""}>{b.leader || "—"}</span>
                    </button>
                  ))}
                </div>
              </Card>

              {/* 成分股 */}
              <Card>
                <CardTitle icon="🔎" extra={selected ? <Button onClick={() => navigate(`/ai-analysis`)}>去深度分析</Button> : undefined}>
                  板块成分股 {selected ? "" : "（点击左侧板块）"}
                </CardTitle>
                {!selected && <Empty text="选择左侧任一板块查看成分股涨跌分布" />}
                {selected && (
                  <div className="max-h-[560px] overflow-y-auto">
                    <table className="w-full text-[12px]">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-line text-left text-mut">
                          <th className="px-4 py-2 font-normal">名称</th>
                          <th className="px-4 py-2 text-right font-normal">现价</th>
                          <th className="px-4 py-2 text-right font-normal">涨跌幅</th>
                          <th className="px-4 py-2 text-right font-normal">主力净流入</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(stocks?.items ?? []).map((s) => (
                          <tr key={s.code} className="cursor-pointer border-b border-line/40 hover:bg-card2"
                              onClick={() => navigate(`/ai-analysis?code=${s.code}`)}>
                            <td className="px-4 py-2">{s.name}<span className="num ml-1.5 text-mut">{s.code}</span></td>
                            <td className="num px-4 py-2 text-right">{s.price}</td>
                            <td className={`num px-4 py-2 text-right ${pctColor(s.change_pct)}`}>{fmtPct(s.change_pct)}</td>
                            <td className={`num px-4 py-2 text-right ${pctColor(s.main_inflow)}`}>{fmtYi(s.main_inflow, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* 当日方向标注 */}
          {rot?.sectors && (
            <Card>
              <CardTitle icon="🏷">今日方向定位</CardTitle>
              <div className="flex flex-wrap gap-2 p-4">
                {rot.sectors.map((s) => (
                  <Badge key={s.name} className={`${LABEL_STYLE[s.label] ?? ""} px-2 py-1 text-[12px]`}>
                    {s.name} · {s.label}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default Sector;
