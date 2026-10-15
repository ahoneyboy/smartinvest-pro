import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { pctColor, fmtNum, fmtPct } from "../lib/format";

export interface SuggestItem {
  code: string;
  name: string;
  pinyin?: string;
  type?: string;
}

/** 股票搜索自动补全：名称 / 拼音 / 代码均可（东财 suggest + 本地名称表降级） */
export const StockSearch: React.FC<{
  onSelect?: (code: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ onSelect, placeholder = "搜索股票名称 / 拼音 / 代码", className = "" }) => {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SuggestItem[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const lookup = async (text: string) => {
    if (!text.trim()) {
      setItems([]);
      setOpen(false);
      return;
    }
    try {
      const r = await api.searchSuggest(text.trim());
      setItems(r.items.slice(0, 8));
      setOpen(r.items.length > 0);
      setHi(-1);
    } catch {
      setItems([]);
    }
  };

  const onChange = (text: string) => {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => lookup(text), 250);
  };

  const pick = (item: SuggestItem) => {
    setOpen(false);
    setQ(item.name);
    if (onSelect) onSelect(item.code);
    else navigate(`/ai-analysis?code=${item.code}`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || items.length === 0) {
      if (e.key === "Enter" && /^\d{6}$/.test(q.trim())) {
        setOpen(false);
        if (onSelect) onSelect(q.trim());
        else navigate(`/ai-analysis?code=${q.trim()}`);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => (h + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => (h <= 0 ? items.length - 1 : h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(hi >= 0 ? items[hi] : items[0]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => items.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-xs outline-none placeholder:text-mut/60 focus:border-accent/60"
      />
      {open && items.length > 0 && (
        <div className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-md border border-line bg-card shadow-xl">
          {items.map((it, i) => (
            <button
              key={it.code}
              onClick={() => pick(it)}
              onMouseEnter={() => setHi(i)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${i === hi ? "bg-accent/15" : "hover:bg-card2"}`}
            >
              <span className="flex-1 truncate">{it.name}</span>
              <span className="num text-mut">{it.code}</span>
              {it.type && <span className="text-[10px] text-mut/60">{it.type}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** 结果行情行（可选）：显示候选的实时价格 */
export const suggestRowPct = (pct: number | undefined | null) => pctColor(pct ?? null);
export const _fmt = { fmtNum, fmtPct };
