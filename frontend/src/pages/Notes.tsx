import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardTitle, Button, Empty } from "../components/ui";

const Notes: React.FC = () => {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const { data } = useQuery({ queryKey: ["notes"], queryFn: api.notes });

  const add = async () => {
    if (!content.trim()) return;
    await api.addNote(content.trim());
    setContent("");
    qc.invalidateQueries({ queryKey: ["notes"] });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-base font-bold">复盘笔记</h1>
      <Card>
        <CardTitle icon="✍️">记录今日复盘心得</CardTitle>
        <div className="space-y-2 p-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="例：今日情绪发酵偏高潮，明天只看前排…"
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-[13px] leading-6 outline-none focus:border-accent/60"
          />
          <div className="flex justify-end">
            <Button variant="primary" onClick={add}>保存笔记</Button>
          </div>
        </div>
      </Card>
      <div className="space-y-2">
        {(data?.items ?? []).length === 0 && <Empty text="还没有笔记" />}
        {(data?.items ?? []).map((n) => (
          <Card key={n.id} className="p-3">
            <div className="flex items-center justify-between text-[11px] text-mut">
              <span className="num">{n.created_at}</span>
              <button className="hover:text-down" onClick={async () => { await api.delNote(n.id); qc.invalidateQueries({ queryKey: ["notes"] }); }}>
                删除
              </button>
            </div>
            <div className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6">{n.content}</div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Notes;
