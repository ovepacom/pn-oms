"use client";
import Icon from "./Icon";

export const inputCls = "rounded-lg border border-[var(--line)] p-3 w-full";

export function PageTitle({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-slate-600">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <>
      <label className="font-medium">Từ ngày<input type="date" className={inputCls} value={from} onChange={(e) => onChange(e.target.value, to)} /></label>
      <label className="font-medium">Đến ngày<input type="date" className={inputCls} value={to} onChange={(e) => onChange(from, e.target.value)} /></label>
    </>
  );
}

export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 font-medium hover:bg-slate-50">
      <Icon name="arrowDown" className="h-4 w-4" />Tải file Excel
    </button>
  );
}

export function Totals({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 card p-3">
      {items.map(([k, v]) => <span key={k}>{k}: <b>{v}</b></span>)}
    </div>
  );
}
