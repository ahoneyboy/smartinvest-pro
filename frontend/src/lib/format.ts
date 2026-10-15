/** A 股配色习惯：涨红跌绿 */

export const pctColor = (pct: number | null | undefined) =>
  pct == null ? "text-mut" : pct > 0 ? "text-up" : pct < 0 ? "text-down" : "text-mut";

export const pctBg = (pct: number | null | undefined) =>
  pct == null ? "bg-card2" : pct > 0 ? "bg-up/15" : pct < 0 ? "bg-down/15" : "bg-card2";

export const fmtPct = (pct: number | null | undefined, digits = 2) =>
  pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(digits)}%`;

export const fmtNum = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : v.toFixed(digits);

export const fmtYi = (v: number | null | undefined, digits = 2) => {
  if (v == null) return "—";
  const yi = v / 1e8;
  return `${yi > 0 ? "+" : ""}${yi.toFixed(digits)} 亿`;
};

export const fmtWan = (v: number | null | undefined) => {
  if (v == null) return "—";
  return `${(v / 1e4).toFixed(0)} 万`;
};

export const arrow = (pct: number | null | undefined) =>
  pct == null ? "" : pct > 0 ? "↑" : pct < 0 ? "↓" : "—";

export const maDir = (ma?: Record<string, number | null>) => {
  if (!ma?.ma5 || !ma?.ma10 || !ma?.ma20) return "—";
  return (ma.ma5 as number) > (ma.ma10 as number) ? "↑" : "↓";
};

export const MACD_LABEL: Record<string, string> = {
  golden: "金叉",
  dead: "死叉",
  bull: "多头",
  bear: "空头",
};

export const ACTION_STYLE: Record<string, string> = {
  增持: "bg-up/20 text-up border-up/40",
  持有: "bg-accent/15 text-accent border-accent/40",
  观望: "bg-gold/15 text-gold border-gold/40",
  减持: "bg-down/15 text-down border-down/40",
  买入: "bg-up/20 text-up border-up/40",
};

export const LABEL_STYLE: Record<string, string> = {
  主线: "bg-up/20 text-up border-up/50",
  次主线: "bg-gold/15 text-gold border-gold/50",
  活口: "bg-accent/15 text-accent border-accent/50",
  观察: "bg-mut/10 text-mut border-mut/40",
  情绪链: "bg-purple-500/15 text-purple-400 border-purple-500/50",
  失败轮动: "bg-down/15 text-down border-down/50",
};

export const STAGE_COLORS: Record<string, string> = {
  冰点: "#58a6ff",
  修复: "#3fb950",
  发酵: "#e3b341",
  高潮: "#ef4444",
  退潮: "#8b949e",
};

export function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
