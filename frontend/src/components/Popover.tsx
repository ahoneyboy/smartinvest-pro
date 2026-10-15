import React, { useEffect, useRef, useState } from "react";

/** 轻量 Popover（点击外部关闭） */
export const Popover: React.FC<{
  button: React.ReactNode;
  panel: React.ReactNode;
  align?: "left" | "right";
}> = ({ button, panel, align = "right" }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)}>{button}</button>
      {open && (
        <div
          className={`absolute top-full z-50 mt-2 rounded-lg border border-line bg-card p-3 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {panel}
        </div>
      )}
    </div>
  );
};
