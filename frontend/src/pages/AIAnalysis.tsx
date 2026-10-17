import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardTitle, Button, Badge, Skeleton, Empty } from "../components/ui";
import { KLineChart } from "../components/KLineChart";
import { StockSearch } from "../components/StockSearch";
import { pctColor, fmtPct, fmtNum, fmtYi, ACTION_STYLE, MACD_LABEL } from "../lib/format";

const RATINGS: Record<string, string> = {
  强烈推荐: "bg-up/20 text-up border-up/50",
  推荐: "bg-up/10 text-up/90 border-up/30",
  中性: "bg-gold/15 text-gold border-gold/40",
  回避: "bg-down/15 text-down border-down/40",
};

const AIAnalysis: React.FC = () => {
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const code = (sp.get("code") || "").trim();
  const [input, setInput] = useState(code);
  const [tab, setTab] = useState<"deep" | "chat" | "screener">("deep");

  useEffect(() => setInput(code), [code]);

  const analyze = () => {
    const c = input.trim();
    if (c) setSp({ code: c });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold">AI 分析中心</h1>
        <div className="flex items-center gap-2">
          <StockSearch
            className="w-60"
            placeholder="名称 / 拼音 / 代码，如 平安 或 601318"
            onSelect={(c) => setSp({ code: c })}
          />
        </div>
        <div className="ml-auto flex rounded-md border border-line p-0.5">
          {(["deep", "chat", "screener"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1 text-xs ${tab === t ? "bg-accent/20 text-accent" : "text-mut"}`}
            >
              {t === "deep" ? "个股深度" : t === "chat" ? "AI 对话" : "策略选股"}
            </button>
          ))}
        </div>
      </div>

      {tab === "deep" && (code ? <DeepAnalysis code={code} /> : <Empty text="输入股票代码开始深度分析：技术面 + 资金面 + 基本面 + AI 综合评分" />)}
      {tab === "chat" && <Chat />}
      {tab === "screener" && <StrategyScreener />}
    </div>
  );
};

/** 策略选股（借鉴 InStock/qstock）：放量上涨 / 均线多头 / 超跌反弹 / 强势突破 / 主力抢筹 */
const StrategyScreener: React.FC = () => {
  const { data: meta } = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });
  const [active, setActive] = useState("volume_up");
  const navigate = useNavigate();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["strategy", active],
    queryFn: () => api.runStrategy(active),
    staleTime: 600000,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(meta?.strategies ?? []).map((s) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
              active === s.key ? "border-accent/50 bg-accent/20 text-accent" : "border-line bg-card text-mut hover:text-fg"
            }`}
          >
            {s.name}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-mut">{isFetching ? "计算中…" : data?.note}</span>
      </div>
      {isLoading ? (
        <Card className="p-4"><Skeleton className="h-64" /></Card>
      ) : (data?.items?.length ?? 0) === 0 ? (
        <Empty text={`「${data?.name ?? (meta?.strategies ?? []).find((s) => s.key === active)?.name ?? active}」当前无命中标的（条件较严或数据源降级中，详见右上角说明）`} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-mut">
                  <th className="px-4 py-2.5 font-normal">#</th>
                  <th className="px-4 py-2.5 font-normal">名称 / 代码</th>
                  <th className="px-4 py-2.5 text-right font-normal">现价</th>
                  <th className="px-4 py-2.5 text-right font-normal">涨跌幅</th>
                  <th className="px-4 py-2.5 font-normal">命中依据</th>
                </tr>
              </thead>
              <tbody>
                {data!.items.map((x, i) => (
                  <tr key={x.code} className="cursor-pointer border-b border-line/40 hover:bg-card2" onClick={() => navigate(`/ai-analysis?code=${x.code}`)}>
                    <td className="num px-4 py-2.5 text-mut">{i + 1}</td>
                    <td className="px-4 py-2.5">{x.name}<span className="num ml-2 text-mut">{x.code}</span></td>
                    <td className="num px-4 py-2.5 text-right">{x.price}</td>
                    <td className={`num px-4 py-2.5 text-right ${pctColor(x.change_pct)}`}>{fmtPct(x.change_pct)}</td>
                    <td className="px-4 py-2.5 text-fg/80">{x.evidence.join("；")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

const DeepAnalysis: React.FC<{ code: string }> = ({ code }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stockAnalysis", code],
    queryFn: () => api.stockAnalysis(code),
    refetchInterval: 30000,
  });

  if (isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-lg" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      </div>
    );
  if (error || !data?.available)
    return <Empty text={`「${code}」分析失败：${(error as Error)?.message || "未获取到数据"}。请确认代码正确（如 600519 / 000001 / 300750）。`} />;

  const t = data.technical;
  const adv = data.advice;

  return (
    <div className="space-y-4">
      {/* 头部 + 评分 */}
      <Card>
        <div className="flex flex-wrap items-center gap-6 p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{data.name}</span>
              <span className="num text-mut">{code}</span>
            </div>
            <div className="num mt-1 flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${pctColor(data.change_pct)}`}>{fmtNum(data.price)}</span>
              <span className={`text-sm ${pctColor(data.change_pct)}`}>{fmtPct(data.change_pct)}</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="num text-3xl font-bold text-accent">{data.score}</div>
              <div className="text-[11px] text-mut">AI 综合评分</div>
            </div>
            <Badge className={`px-3 py-1 text-sm ${RATINGS[data.rating] ?? ""}`}>{data.rating}</Badge>
            <Badge className={ACTION_STYLE[adv.action] ?? ""}>{adv.action} · 置信度 {adv.confidence}%</Badge>
          </div>
          <div className="grid w-full grid-cols-3 gap-3 text-center sm:ml-auto sm:w-auto">
            <div><div className="text-[11px] text-mut">买入参考</div><div className="num text-down">{fmtNum(adv.buy_price)}</div></div>
            <div><div className="text-[11px] text-mut">止损位</div><div className="num text-gold">{fmtNum(adv.stop_loss)}</div></div>
            <div><div className="text-[11px] text-mut">目标价</div><div className="num text-up">{fmtNum(adv.target_price)}</div></div>
          </div>
        </div>
        <div className="border-t border-line px-4 py-2.5 text-[12px] text-fg/85">
          <span className="text-mut">依据：</span>{adv.reasons.join("；") || "—"}
          <span className="ml-3 text-mut">风险：</span><span className="text-down/90">{adv.risk}</span>
        </div>
        {data.llm_comment && (
          <div className="border-t border-line bg-accent/5 px-4 py-2.5 text-[12.5px] leading-6 text-fg/90">
            🤖 {data.llm_comment}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 技术面 */}
        <Card>
          <CardTitle icon="📈" extra={
            <span className="text-[11px] text-mut">
              均线{t.ma_alignment === "bull" ? "多头" : t.ma_alignment === "bear" ? "空头" : "纠缠"} ·
              MACD {MACD_LABEL[t.macd?.trend] ?? "—"}{t.macd?.cross ? `（${t.macd.cross === "golden" ? "金" : "死"}叉）` : ""} ·
              KDJ{kDJ(t.kdj)} · RSI6 {t.rsi6 ?? "—"} · BOLL 位置 {t.boll?.position ?? "—"}%
            </span>
          }>
            技术面（最长 {t.kline?.length ?? 0} 个交易日）
          </CardTitle>
          <div className="p-2">
            <KLineChart
              bars={t.kline}
              height={460}
              macd={t.macd}
              kdj={t.kdj}
              rsiSeries={t.rsi6_series}
              bollSeries={t.boll_series}
            />
          </div>
          <div className="grid grid-cols-4 gap-2 border-t border-line px-4 py-3 text-center text-[11px]">
            {["ma5", "ma10", "ma20", "ma60"].map((k) => (
              <div key={k}>
                <span className="text-mut">{k.toUpperCase()}</span>
                <div className="num">{fmtNum(t.ma?.[k] ?? null)}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          {/* 资金面 */}
          <Card>
            <CardTitle icon="💵" extra={<span className="text-[11px] text-mut">{data.capital.note} · 大单占比 {data.capital.large_single_pct}%</span>}>
              资金面（近 5 日主力）
            </CardTitle>
            <CapitalBars rows={data.capital.flow_days} />
          </Card>

          {/* 基本面 */}
          <Card>
            <CardTitle icon="🏭">基本面</CardTitle>
            <div className="grid grid-cols-3 gap-3 p-4 text-center text-[12px]">
              <div><div className="text-mut">PE(TTM)</div><div className="num text-base">{data.fundamental.pe_ttm ?? "—"}</div></div>
              <div><div className="text-mut">市净率</div><div className="num text-base">{data.fundamental.pb ?? "—"}</div></div>
              <div><div className="text-mut">毛利率</div><div className="num text-base">{pctOrNull(data.fundamental.gross_margin)}</div></div>
              <div><div className="text-mut">营收同比</div><div className={`num ${pctColor(numOrNull(data.fundamental.revenue_yoy))}`}>{pctOrNull(data.fundamental.revenue_yoy)}</div></div>
              <div><div className="text-mut">净利同比</div><div className={`num ${pctColor(numOrNull(data.fundamental.profit_yoy))}`}>{pctOrNull(data.fundamental.profit_yoy)}</div></div>
              <div><div className="text-mut">净利率</div><div className="num">{pctOrNull(data.fundamental.net_margin)}</div></div>
            </div>
          </Card>

          {/* 风险提示 */}
          <Card className="border-down/30">
            <CardTitle icon="🚨">风险提示</CardTitle>
            <div className="space-y-1.5 px-4 py-3 text-[12px]">
              <div>关键压力位：<span className="num text-up">{fmtNum(data.risk.pressure)}</span></div>
              <div>支撑 / 止损位：<span className="num text-down">{fmtNum(data.risk.support)}</span> / <span className="num text-down">{fmtNum(data.risk.stop_loss)}</span></div>
              <div className="text-mut">最大不确定性：{data.risk.top_risk}</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

const kDJ = (k: any) => (!k?.k ? "—" : k.cross === "golden" ? "金叉" : k.cross === "dead" ? "死叉" : `K${k.k}`);

const numOrNull = (v: any) => (typeof v === "number" ? v : v && !isNaN(+v) ? +v : null);
const pctOrNull = (v: any) => (numOrNull(v) == null ? "—" : `${numOrNull(v)}%`);

const CapitalBars: React.FC<{ rows: { date: string; main: number }[] }> = ({ rows }) => {
  if (!rows?.length) return <Empty text="暂无资金流数据" />;
  const max = Math.max(1e7, ...rows.map((r) => Math.abs(r.main)));
  return (
    <div className="flex items-end justify-between gap-2 px-4 py-4" style={{ height: 150 }}>
      {rows.map((r) => {
        const h = (Math.abs(r.main) / max) * 90;
        const up = r.main >= 0;
        return (
          <div key={r.date} className="flex flex-1 flex-col items-center gap-1" title={`${r.date} 主力 ${fmtYi(r.main)}`}>
            <span className={`num text-[10px] ${pctColor(r.main)}`}>{(r.main / 1e8).toFixed(2)}亿</span>
            <div className="flex h-[90px] w-full items-end">
              <div className={`w-full rounded-t ${up ? "bg-up/70" : "bg-down/70"}`} style={{ height: `${Math.max(4, h)}%` }} />
            </div>
            <span className="text-[10px] text-mut">{r.date.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
};

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const { data: llm } = useQuery({ queryKey: ["llm"], queryFn: api.llmInfo });

  useEffect(() => {
    api.chatHistory().then((r) => setMessages(r.items.map((x) => ({ role: x.role, content: x.content }))));
  }, []);
  useEffect(() => {
    boxRef.current?.scrollTo({ top: 1e9 });
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput("");
    setBusy(true);
    const history = messages.slice(-10);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    try {
      const r = await api.aiChat(msg, history);
      setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `请求失败：${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex h-[calc(100vh-190px)] flex-col">
      <CardTitle icon="💬" extra={
        <div className="flex items-center gap-2">
          <Badge className={llm?.available ? "border-up/40 bg-up/10 text-up" : "border-gold/40 bg-gold/10 text-gold"}>
            {llm?.available ? `LLM · ${llm.model}` : "本地规则引擎"}
          </Badge>
          <button className="text-[11px] text-mut hover:text-down" onClick={() => { api.clearChat(); setMessages([]); }}>清空</button>
        </div>
      }>
        AI 对话式分析（结合实时行情回答，可问：「这只股票能不能买？」「今天为什么跌？」）
      </CardTitle>
      <div ref={boxRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-2 text-[12px] text-mut">
            <p>试试这样问：</p>
            <p>· 今天大盘怎么样？情绪处于什么阶段？</p>
            <p>· 600519 现在能不能买？</p>
            <p>· 当前主线板块是什么？风险在哪里？</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-[13px] leading-6 ${
                m.role === "user" ? "bg-accent/15 text-fg" : "border border-line bg-card2 text-fg/90"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div className="text-[12px] text-mut">AI 正在结合实时数据分析…</div>}
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="输入你的问题…"
          className="flex-1 rounded-md border border-line bg-bg px-3 py-2 text-xs outline-none focus:border-accent/60"
          disabled={busy}
        />
        <Button variant="primary" onClick={send} disabled={busy}>发送</Button>
      </div>
    </Card>
  );
};

export default AIAnalysis;
