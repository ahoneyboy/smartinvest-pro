import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover } from "./Popover";
import { api } from "../lib/api";

/** 数据源健康状态面板：正常/异常/最后成功时间/延迟 */
export const SourceStatus: React.FC = () => {
  const { data, refetch } = useQuery({
    queryKey: ["sources"],
    queryFn: api.sources,
    refetchInterval: 30000,
  });
  const sources = data?.sources ?? [];
  const errCount = sources.filter((s) => s.status === "error").length;

  return (
    <Popover
      button={
        <span className="flex items-center gap-1.5 text-xs text-mut hover:text-fg">
          <span className={`inline-block h-2 w-2 rounded-full ${errCount ? "bg-down animate-pulse" : "bg-up"}`} />
          数据源{errCount ? ` ${errCount} 异常` : "正常"}
        </span>
      }
      panel={
        <div className="w-[420px]">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold">多数据源状态</span>
            <button className="text-[11px] text-accent" onClick={() => refetch()}>刷新</button>
          </div>
          <div className="space-y-1.5">
            {sources.map((s: any) => (
              <div key={s.name} className="rounded border border-line bg-card px-2.5 py-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        s.status === "ok" ? "bg-up" : s.status === "error" ? "bg-down" : "bg-mut"
                      }`}
                    />
                    {s.name}
                  </span>
                  <span className={s.status === "ok" ? "text-up" : "text-down"}>
                    {s.status === "ok" ? "正常" : s.status === "error" ? "异常" : "未知"}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 text-mut">
                  <span>用途：{s.role || "—"}</span>
                  <span>延迟：{s.last_latency_ms ? `${s.last_latency_ms}ms` : "—"}</span>
                  <span>最后成功：{s.last_success?.slice(11) || "—"}</span>
                  <span>失败次数：{s.consecutive_failures}</span>
                </div>
                {s.last_error && <div className="mt-0.5 text-down/80">最近错误：{s.last_error}</div>}
              </div>
            ))}
          </div>
        </div>
      }
    />
  );
};
