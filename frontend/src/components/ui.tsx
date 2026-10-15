import React from "react";

export const Card: React.FC<{ className?: string; children: React.ReactNode; id?: string }> = ({ className = "", children, id }) => (
  <div id={id} className={`print-plain rounded-lg border border-line bg-card shadow-sm ${className}`}>{children}</div>
);

export const CardTitle: React.FC<{ children: React.ReactNode; extra?: React.ReactNode; icon?: string }> = ({ children, extra, icon }) => (
  <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
    <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
      {icon && <span className="text-sm">{icon}</span>}
      {children}
    </div>
    {extra}
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>
);

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }
> = ({ variant = "ghost", className = "", ...props }) => {
  const styles = {
    primary: "bg-accent/20 text-accent border-accent/50 hover:bg-accent/30",
    ghost: "bg-card2 text-fg border-line hover:bg-line/50",
    danger: "bg-down/15 text-down border-down/40 hover:bg-down/25",
  }[variant];
  return (
    <button
      className={`no-print rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${styles} ${className}`}
      {...props}
    />
  );
};

export const Skeleton: React.FC<{ className?: string }> = ({ className = "h-4 w-full" }) => (
  <div className={`skeleton ${className}`} />
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = "" }) => (
  <Card className={`p-4 space-y-3 ${className}`}>
    <Skeleton className="h-4 w-1/3" />
    <Skeleton className="h-8 w-2/3" />
    <Skeleton className="h-3 w-full" />
    <Skeleton className="h-3 w-4/5" />
  </Card>
);

export const Stat: React.FC<{ label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string }> = ({ label, value, sub, className = "" }) => (
  <div className={`print-plain rounded-lg border border-line bg-card px-4 py-3 ${className}`}>
    <div className="text-[11px] text-mut">{label}</div>
    <div className="num mt-1 text-xl font-semibold leading-6">{value}</div>
    {sub && <div className="mt-0.5 text-[11px] text-mut">{sub}</div>}
  </div>
);

export const Empty: React.FC<{ text?: string; children?: React.ReactNode }> = ({ text = "暂无数据", children }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-mut">
    <span>{text}</span>
    {children}
  </div>
);
