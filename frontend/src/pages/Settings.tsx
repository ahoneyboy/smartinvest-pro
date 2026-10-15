import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardTitle, Button, Badge, Stat } from "../components/ui";
import { useAppStore } from "../lib/store";
import { SourceStatus } from "../components/SourceStatus";

/** 钉钉 webhook 配置：盯盘告警与模拟交易触发推送到群 */
const NotifyPanel: React.FC = () => {
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const { data, refetch } = useQuery({ queryKey: ["notifyConfig"], queryFn: api.notifyConfig });

  const save = async () => {
    const r = await api.saveNotify(url.trim());
    setMsg(r.ok ? "已保存，盯盘告警与模拟盘触发将推送到该群" : `保存失败：${r.reason}`);
    if (r.ok) { setUrl(""); refetch(); }
  };

  return (
    <div className="space-y-2.5 p-4 text-[12.5px]">
      <div className="text-mut">配置钉钉群机器人 webhook 后，盯盘价格告警与模拟交易触发会自动推送到群。钉钉群 → 群设置 → 机器人 → 添加「自定义」机器人（安全设置选「自定义关键词」，填 SmartInvest 即可）。</div>
      {data?.configured && (
        <div className="flex items-center gap-2">
          <Badge className="border-up/40 bg-up/10 text-up">已配置</Badge>
          <span className="num text-[11px] text-mut">{data.webhook_masked}</span>
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://oapi.dingtalk.com/robot/send?access_token=…"
          className="num flex-1 rounded-md border border-line bg-bg px-3 py-2 text-xs outline-none focus:border-accent/60"
        />
        <Button variant="primary" onClick={save}>保存</Button>
        <Button onClick={async () => { const r = await api.testNotify(); setMsg(r.sent ? "测试消息已发送，请在钉钉群查看" : `发送失败：${r.reason || r.detail || "未配置"}`); }}>发送测试</Button>
      </div>
      {msg && <div className="text-[11px] text-accent">{msg}</div>}
    </div>
  );
};

const Settings: React.FC = () => {
  const qc = useQueryClient();
  const { watchInterval, setWatchInterval } = useAppStore();
  const { data: llm, refetch: refetchLlm } = useQuery({ queryKey: ["llm"], queryFn: api.llmInfo });
  const { data: src } = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const [cfg, setCfg] = useState({ key: "", base: "", model: "" });
  const [msg, setMsg] = useState("");

  // 设置当前仅前端偏好 + 数据源只读展示；LLM 配置在后端环境变量
  const sources = src?.sources ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-base font-bold">设置</h1>

      <Card>
        <CardTitle icon="🤖">AI 模型配置</CardTitle>
        <div className="space-y-3 p-4 text-[12.5px]">
          <div className="flex items-center justify-between">
            <span className="text-mut">当前引擎</span>
            {llm?.available ? (
              <Badge className="border-up/40 bg-up/10 text-up">LLM · {llm.model}</Badge>
            ) : (
              <Badge className="border-gold/40 bg-gold/10 text-gold">本地规则引擎</Badge>
            )}
          </div>
          {llm?.available && <div className="text-mut">接口地址：{llm.base_url}</div>}
          <div className="rounded-md border border-line bg-card2 p-3 leading-6 text-mut">
            在后端配置环境变量即可接入任意 OpenAI 兼容大模型（DeepSeek / 豆包 / GPT 等）：
            <div className="num mt-1.5 rounded bg-bg px-2.5 py-2 text-[11.5px] text-fg/85">
              LLM_API_KEY=sk-xxxx<br />
              LLM_BASE_URL=https://api.deepseek.com/v1<br />
              LLM_MODEL=deepseek-chat
            </div>
            未配置时系统自动使用本地规则引擎，所有结论仍附带数据依据与置信度。
          </div>
          <Button onClick={() => refetchLlm()}>重新检测</Button>
        </div>
      </Card>

      <Card>
        <CardTitle icon="🔔">盯盘与通知</CardTitle>
        <div className="space-y-3 p-4 text-[12.5px]">
          <div className="flex items-center justify-between">
            <span className="text-mut">自选股刷新间隔</span>
            <select
              value={watchInterval}
              onChange={(e) => setWatchInterval(+e.target.value)}
              className="rounded border border-line bg-card px-2 py-1 text-xs"
            >
              {[3, 5, 10, 30, 60].map((s) => <option key={s} value={s}>{s} 秒</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-mut">数据源状态面板</span>
            <SourceStatus />
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle icon="📣">消息推送（钉钉群机器人）</CardTitle>
        <NotifyPanel />
      </Card>

      <Card>
        <CardTitle icon="📡">数据源配置（只读）</CardTitle>
        <div className="space-y-2 p-4">
          {sources.map((s: any) => (
            <div key={s.name} className="flex items-center justify-between rounded border border-line bg-card2 px-3 py-2 text-[12px]">
              <span className="font-medium">{s.name}</span>
              <span className="text-mut">{s.role}</span>
              <span className={s.status === "ok" ? "text-up" : "text-down"}>
                {s.status === "ok" ? "正常" : s.status === "error" ? "异常" : "未知"}
                {s.last_latency_ms ? ` · ${s.last_latency_ms}ms` : ""}
              </span>
            </div>
          ))}
          <p className="text-[11px] leading-5 text-mut">
            系统默认腾讯行情为主源、新浪交叉校验（偏差 &gt;0.5% 告警）、东方财富提供资金流与涨停数据；
            任一源失败自动降级到备用源并在状态面板标红。
          </p>
        </div>
      </Card>
    </div>
  );
};

export default Settings;
