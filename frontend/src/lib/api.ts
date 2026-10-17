/** API 客户端与类型 */

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail || `HTTP ${r.status}`);
  return r.json();
}

async function post<T>(url: string, body?: any, method = "POST"): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail || `HTTP ${r.status}`);
  return r.json();
}

const del = <T,>(url: string) => post<T>(url, undefined, "DELETE");

// ---------- 类型 ----------
export interface Quote {
  code: string;
  name?: string;
  price: number;
  prev_close?: number;
  open?: number;
  high?: number;
  low?: number;
  change?: number;
  change_pct: number;
  volume?: number;
  amount?: number;
  turnover_rate?: number;
  pe?: number;
  pb?: number;
  volume_ratio?: number;
  total_mv?: number;
  time?: string;
  source?: string;
  cross_check_dev?: number;
}

export interface IndexRow {
  secid: string;
  code: string;
  name: string;
  kind?: string;
  price: number;
  change_pct: number;
  change: number;
  up_count: number;
  down_count: number;
  sparkline: number[];
  degraded_source?: string;
}

export interface Advice {
  action: string;
  confidence: number;
  reasons: string[];
  buy_price: number;
  stop_loss: number;
  target_price: number;
  support: number;
  pressure: number;
  risk: string;
}

export interface WatchItem {
  code: string;
  name: string;
  group_name: string;
  cost: number;
  shares: number;
  lower_price: number;
  upper_price: number;
  quote: Quote;
  signal: {
    short_comment?: string;
    ma?: Record<string, number | null>;
    ma_alignment?: string | null;
    rsi6?: number | null;
    macd_status?: string | null;
    advice?: Advice;
  };
}

export interface SectorCard {
  label: string;
  verdict: string;
  name: string;
  bk_code?: string;
  main_inflow: number;
  change_pct: number;
  zt_count: number;
  max_lbc: number;
  st_count?: number;
  members: { code: string; name: string; change_pct: number; lbc: number }[];
  analysis: string;
  layers?: Record<string, { name: string; change_pct?: number; lbc?: number }[]>;
}

export interface ReviewData {
  date: string;
  status: string;
  generated_at: string;
  engine: string;
  summary: string;
  risk: string;
  market: {
    indexes: { name: string; code: string; price: number; change_pct: number; sparkline: number[] }[];
    breadth: { gauge: number; label: string; up: number; down: number; ratio: number };
  };
  limit_stats: {
    zt_total: number;
    zt_non_st: number;
    zt_st: number;
    zb_count: number;
    zt_touched: number;
    zb_rate: number;
    dt_count: number;
    max_lb: number;
    max_lb_stock: { code: string; name: string; lbc: number; industry: string } | null;
    warning: string | null;
    ladder: { code: string; name: string; lbc: number; industry: string; fund: number; is_st: boolean }[];
  };
  capital: {
    industry_in_top5: { name: string; main_inflow: number; change_pct: number }[];
    industry_out_top5: { name: string; main_inflow: number; change_pct: number }[];
    stock_in_top5: { code: string; name: string; change_pct: number; main_inflow: number }[];
    stock_out_top5: { code: string; name: string; change_pct: number; main_inflow: number }[];
  };
  sectors: SectorCard[];
  sentiment: { stage: string; gauge: number; position_text: string; zb_rate: number; assist: string };
  judgments?: { no: number; tag: string; text: string }[];
  next_watch?: { text: string }[];
  risk_radar?: { dims: string[]; values: number[] };
  rotation_table: {
    direction: string;
    position: string;
    volume_price: string;
    members: string;
    verdict: string;
    layers?: Record<string, { name: string; change_pct?: number; lbc?: number }[]>;
  }[];
  lhb: { code: string; name: string; change_pct: number; net_buy: number; buy: number; sell: number; reason: string }[];
  warnings: string[];
}

export interface StockAnalysis {
  code: string;
  available: boolean;
  name?: string;
  price?: number;
  change_pct?: number;
  technical: {
    kline: { date: string; open: number; close: number; high: number; low: number; volume: number }[];
    ma: Record<string, number | null>;
    ma_alignment?: string | null;
    macd: any;
    kdj: any;
    rsi6?: number | null;
    rsi12?: number | null;
    rsi6_series?: (number | null)[] | null;
    boll_series?: { upper?: number[]; mid?: number[]; lower?: number[] } | null;
    boll: any;
    volume: any;
  };
  capital: {
    flow_days: { date: string; main: number; super: number; large: number; medium: number; small: number; main_pct: number }[];
    main_5d: number;
    super_5d: number;
    large_single_pct: number;
    note: string;
  };
  fundamental: Record<string, any>;
  score: number;
  rating: string;
  advice: Advice;
  risk: { pressure: number; support: number; stop_loss: number; top_risk: string };
  llm_comment?: string | null;
}

export interface ValItem {
  code: string;
  name: string;
  pe: number | null;
  pb: number | null;
  percentile: number;
  basis: string;
  label: string;
  level: string;
  roe: number | null;
  yield_rate: number | null;
}

export interface EtfRow {
  code: string;
  name: string;
  price: number;
  change_pct: number;
  volume: number;
  turnover_rate: number;
  main_inflow: number;
}

export interface AriskData {
  available: boolean;
  reason?: string;
  hint?: string;
  generated_at?: string;
  generated_date?: string;
  age_hours?: number;
  decision?: {
    available: boolean;
    l1: { name: string; state: string; label: string; impulse: number[]; months: string[]; latest_yoy: number };
    l2: { name: string; score: number; label: string; erp_position: number; turnover_position: number };
    position: { pct: string; scheme: string; desc: string };
    inputs_missing: string[];
  };
  cards?: {
    erp: { value: number | null; pct_mapped: number | null; pct_5y: number | null; series: { d: string; v: number }[]; stale: boolean };
    pe300: { value: number; stale: boolean };
    bond10y: { value: number; hist: { d: string; v: number }[]; stale: boolean };
    below_net: { ratio: number; count: number; total: number; pct5y: number; series: { d: string; v: number }[]; stale: boolean };
    hv30: { value: number; pct: number; hist: { d: string; v: number }[]; stale: boolean };
    margin: { latest: number | null; prev: number | null; daily: { d: string; v: number }[]; stale: boolean };
    turnover: { amount_yi: number; pct: number; series: { label: string; date: string; pct: number; amount_yi: number }[]; stale: boolean };
    credit: { rows: { m: string; g: number }[]; impulse: number[]; stale: boolean };
  };
  sector_live?: { n: string; code: string; today: number; ret60: number; date: string }[];
  etf_categories?: { latest_date: string; prev_date: string; categories: { category: string; count_now: number; scale_yi: number; change_yi: number; change_pct: number }[] };
  fund_issuance?: { m: string; v: number }[];
  limit_7d?: { date: string; up: number; down: number }[];
}

// ---------- 接口 ----------
export const api = {
  get,
  post,
  del,
  indexes: () => get<{ indexes: IndexRow[] }>("/api/quotes/indexes"),
  quotes: (codes: string[]) =>
    get<{ quotes: Record<string, Quote>; alerts: string[]; degraded: boolean }>(
      `/api/quotes?codes=${codes.join(",")}`
    ),
  kline: (code: string, period = "day", limit = 120) =>
    get<{ code: string; period: string; bars: [string, number, number, number, number, number][] }>(
      `/api/kline/${code}?period=${period}&limit=${limit}`
    ),
  trends: (code: string) => get<{ trends: [string, number, number, number][] }>(`/api/trends/${code}`),
  watchOverview: () =>
    get<{ items: WatchItem[]; alerts: string[]; degraded: boolean }>("/api/watchlist/overview"),
  watchList: () => get<{ items: any[] }>("/api/watchlist"),
  watchAdd: (item: any) => post<{ ok: boolean }>("/api/watchlist", item),
  watchBatch: (codes: string[], group = "全部") => post<{ added: string[] }>("/api/watchlist/batch", { codes, group }),
  watchUpdate: (code: string, patch: any) => post<{ ok: boolean }>(`/api/watchlist/${code}`, patch, "PUT"),
  watchDelete: (code: string) => del<{ ok: boolean }>(`/api/watchlist/${code}`),
  monitor: () =>
    get<{
      items: (WatchItem & { quote: Quote })[];
      portfolio: { total_mv: number; total_cost: number; profit: number; profit_pct: number } | null;
      alerts: { id: number; code: string; name: string; kind: string; message: string; created_at: string }[];
      paper_triggers?: { code: string; kind: string; message: string; executed: boolean }[];
      interval: number;
    }>("/api/watch/monitor"),
  review: (date?: string, refresh = false) =>
    get<ReviewData>(`/api/review${date ? `?date=${date}` : ""}${refresh ? `${date ? "&" : "?"}refresh=true` : ""}`),
  reviewDates: () => get<{ dates: string[] }>("/api/review/dates"),
  boards: (type: string, sort = "inflow") =>
    get<{ items: { bk_code: string; name: string; change_pct: number; main_inflow: number; up_count: number; down_count: number; leader: string; leader_pct: number }[] }>(
      `/api/sector/boards?type=${type}&sort=${sort}`
    ),
  boardStocks: (bk: string) =>
    get<{ items: { code: string; name: string; price: number; change_pct: number; main_inflow: number }[] }>(
      `/api/sector/${bk}/stocks`
    ),
  rotation: () => get<{ date: string; text: string; path: string[]; sectors?: SectorCard[] }>("/api/sector/rotation"),
  stockAnalysis: (code: string) => get<StockAnalysis>(`/api/ai/stock/${code}?use_llm=true`),
  aiChat: (message: string, history: { role: string; content: string }[]) =>
    post<{ reply: string; engine: string }>("/api/ai/chat", { message, history }),
  chatHistory: () => get<{ items: { role: string; content: string; created_at: string }[] }>("/api/ai/chat/history"),
  clearChat: () => del<{ ok: boolean }>("/api/ai/chat/history"),
  lhb: (date?: string) => get<{ date: string; items: any[] }>(`/api/lhb${date ? `?date=${date}` : ""}`),
  notes: () => get<{ items: any[] }>("/api/notes"),
  addNote: (content: string, date?: string) => post<{ ok: boolean }>("/api/notes", { content, date }),
  delNote: (id: number) => del<{ ok: boolean }>(`/api/notes/${id}`),
  screener: (params: string) => get<{ items: any[] }>(`/api/screener?${params}`),
  sources: () => get<{ sources: any[] }>("/api/system/sources"),
  llmInfo: () => get<{ available: boolean; model?: string; base_url?: string; engine: string }>("/api/system/llm"),
  settings: () => get<{ settings: Record<string, string> }>("/api/settings"),
  saveSettings: (settings: Record<string, string>) => post<{ ok: boolean }>("/api/settings", { settings }),
  // ---- 增强功能 ----
  valuation: () =>
    get<{
      items: ValItem[];
      core: ValItem[];
      high: ValItem[];
      low: ValItem[];
      count: number;
      updated_at: string;
    }>("/api/valuation"),
  globalQuotes: () => get<{ items: IndexRow[] }>("/api/global"),
  hotStocks: () =>
    get<{ items: { rank: number; code: string; name: string; price: number; change_pct: number }[] }>("/api/hot"),
  indexSignals: () =>
    get<{ signals: Record<string, { ma_alignment?: string; rsi6?: number; macd_trend?: string; ma5?: number }> }>(
      "/api/index-signals"
    ),
  etfBoard: () =>
    get<{
      gainers: EtfRow[];
      inflow: EtfRow[];
    }>("/api/etf"),
  paperSummary: () =>
    get<{
      enabled: boolean;
      account: { initial: number; cash: number; market_value: number; total: number; profit: number; profit_pct: number };
      positions: { code: string; name: string; shares: number; cost_price: number; price: number; market_value: number; profit: number }[];
      trades: { id: number; code: string; name: string; direction: string; price: number; shares: number; reason: string; created_at: string }[];
      signals: { id: number; code: string; name: string; kind: string; message: string; price: number; executed: number; created_at: string }[];
    }>("/api/paper/summary"),
  paperToggle: (enabled: boolean) => post<{ ok: boolean; enabled: boolean }>("/api/paper/toggle", { enabled }),
  paperReset: () => post<{ ok: boolean }>("/api/paper/reset"),
  // ---- A-RISK 宏观风险 ----
  arisk: () => get<AriskData>("/api/arisk"),
  ariskRefresh: () => get<AriskData>("/api/arisk/refresh"),
  ariskUpdate: () => post<{ started: boolean; reason?: string; note?: string }>("/api/arisk/update"),
  // ---- 策略选股 / 事件日历 / 推送 ----
  strategies: () => get<{ strategies: { key: string; name: string }[] }>("/api/strategies"),
  runStrategy: (key: string) =>
    get<{ strategy: string; name: string; items: { code: string; name: string; price: number; change_pct: number; evidence: string[] }[]; note: string }>(
      `/api/screener/strategy/${key}`
    ),
  calendar: () =>
    get<{ events: { code: string; name: string; date: string; kind: string; cap_yi?: number; price?: number; type?: string }[]; lift_count: number; ipo_count: number }>(
      "/api/calendar"
    ),
  notifyConfig: () => get<{ configured: boolean; webhook_masked: string }>("/api/notify/config"),
  saveNotify: (webhook: string) => post<{ ok: boolean; reason?: string }>("/api/notify/config", { webhook }),
  testNotify: () => post<{ sent: boolean; reason?: string; detail?: string }>("/api/notify/test"),
  searchSuggest: (q: string) =>
    get<{ items: { code: string; name: string; pinyin?: string; type?: string }[] }>(
      `/api/search/suggest?q=${encodeURIComponent(q)}`
    ),
  liveNews: () => get<{ items: { id: number; time: string; text: string }[] }>("/api/news"),
};
