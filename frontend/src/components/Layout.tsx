import React, { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { SourceStatus } from "./SourceStatus";
import { StockSearch } from "./StockSearch";
import { useAppStore } from "../lib/store";
import { useQueryClient } from "@tanstack/react-query";

const NAV = [
  { to: "/", label: "仪表盘", icon: "📊" },
  { to: "/ai-analysis", label: "AI 分析", icon: "🤖" },
  { to: "/watchlist", label: "自选盯盘", icon: "👁" },
  { to: "/review", label: "复盘大师", icon: "🧭" },
  { to: "/sector", label: "板块中心", icon: "🏭" },
  { to: "/macro-risk", label: "宏观风险", icon: "🌐" },
  { to: "/risk-signal", label: "风险信号", icon: "⚠️" },
  { to: "/notes", label: "复盘笔记", icon: "📝" },
  { to: "/reports", label: "报告中心", icon: "📚" },
  { to: "/settings", label: "设置", icon: "⚙️" },
];

/** 移动端底部导航：主项 5 个 + 「更多」抽屉 */
const MOBILE_MAIN = [
  { to: "/", label: "仪表盘", icon: "📊" },
  { to: "/review", label: "复盘", icon: "🧭" },
  { to: "/ai-analysis", label: "分析", icon: "🤖" },
  { to: "/watchlist", label: "盯盘", icon: "👁" },
];

export const Layout: React.FC = () => {
  const { collapsed, toggleCollapsed } = useAppStore();
  const location = useLocation();
  const qc = useQueryClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileMore = NAV.filter((n) => !MOBILE_MAIN.some((m) => m.to === n.to));

  const mobileCls = ({ isActive }: { isActive: boolean }) =>
    `relative flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] transition-colors ${
      isActive ? "text-accent font-medium" : "text-mut active:bg-card2"
    }`;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 侧边栏（Pad 横屏 / 桌面） */}
      <aside
        className={`no-print hidden flex-col border-r border-line bg-card transition-all lg:flex ${
          collapsed ? "w-[60px]" : "w-[200px]"
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="text-lg">📈</span>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-bold">SmartInvest Pro</div>
              <div className="text-[10px] text-mut">AI 投资助手</div>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${
                  isActive ? "bg-accent/15 text-accent" : "text-mut hover:bg-card2 hover:text-fg"
                }`
              }
              title={n.label}
            >
              <span className="text-base leading-none">{n.icon}</span>
              {!collapsed && <span>{n.label}</span>}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={toggleCollapsed}
          className="border-t border-line px-4 py-2.5 text-left text-xs text-mut hover:text-fg"
        >
          {collapsed ? "»" : "« 收起"}
        </button>
      </aside>

      {/* 主区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶栏 */}
        <header className="no-print flex h-12 items-center gap-3 border-b border-line bg-card px-3 sm:px-4">
          {/* 移动端 Logo */}
          <span className="text-lg lg:hidden">📈</span>
          <StockSearch className="w-64 flex-1 sm:w-72 sm:flex-none lg:flex-1" />
          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <button
              className="text-xs text-mut hover:text-fg"
              onClick={() => {
                qc.invalidateQueries();
              }}
              title="刷新行情"
            >
              <span className="hidden sm:inline">⟳ 刷新行情</span>
              <span className="sm:hidden">⟳</span>
            </button>
            <SourceStatus />
            <span className="num hidden text-xs text-mut sm:inline">{new Date().toLocaleDateString("zh-CN")}</span>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs text-accent">
              投
            </div>
          </div>
        </header>

        {/* 内容（移动端为底部导航留空间） */}
        <main className="flex-1 overflow-y-auto p-3 pb-20 sm:p-4 lg:pb-4" key={location.pathname}>
          <Outlet />
        </main>

        <footer className="no-print hidden border-t border-line bg-card px-4 py-2 text-center text-[11px] text-mut lg:block">
          数据来自公开行情接口，本系统分析结果仅供参考，不构成投资建议。投资有风险，入市需谨慎。
        </footer>
      </div>

      {/* 移动端底部导航 */}
      <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-card/95 shadow-[0_-4px_16px_rgba(0,0,0,0.35)] backdrop-blur lg:hidden">
        {MOBILE_MAIN.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className={mobileCls}>
            {({ isActive }: { isActive: boolean }) => (
              <>
                {isActive && <span className="absolute top-0 h-0.5 w-9 rounded-full bg-accent" />}
                <span className="text-xl leading-none">{n.icon}</span>
                <span>{n.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] transition-colors ${
            moreOpen ? "text-accent font-medium" : "text-mut active:bg-card2"
          }`}
          onClick={() => setMoreOpen((o) => !o)}
        >
          <span className="text-lg leading-none">⋯</span>
          <span>更多</span>
        </button>
      </nav>

      {/* 「更多」抽屉 */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-card p-4 pb-24"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">全部功能</span>
              <button className="text-xs text-mut" onClick={() => setMoreOpen(false)}>收起</button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {mobileMore.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-[11px] ${
                      isActive ? "border-accent/50 bg-accent/10 text-accent" : "border-line bg-card2 text-mut"
                    }`
                  }
                >
                  <span className="text-lg leading-none">{n.icon}</span>
                  <span className="text-center">{n.label}</span>
                </NavLink>
              ))}
            </div>
            <div className="mt-4 text-center text-[10px] leading-4 text-mut">
              数据来自公开行情接口，仅供参考，不构成投资建议。
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
