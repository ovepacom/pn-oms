"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fold } from "@/lib/format";
import Modal from "./Modal";
import AuditHistory from "./AuditHistory";
import { inputCls } from "./PageBits";

export type Field = { key: string; label: string; type?: "text" | "number" | "select" | "bool"; options?: Record<string, string>; required?: boolean; list?: boolean };
type Rec = Record<string, unknown> & { id: number };

const display = (f: Field, v: unknown) => (v == null || v === "" ? "" : f.type === "bool" ? (v ? "Có" : "Ngừng") : f.type === "select" ? f.options?.[String(v)] ?? String(v) : String(v));

// Bảng danh mục: thêm, sửa (kèm lịch sử ai sửa), tìm kiếm
export default function CrudTable({ table, fields, order, filter, defaults, addLabel }: {
  table: string; fields: Field[]; order: string; filter?: Record<string, string>; defaults?: Record<string, unknown>; addLabel: string;
}) {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Rec[]>([]);
  const [edit, setEdit] = useState<Rec | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const filterKey = JSON.stringify(filter ?? {});

  const load = useCallback(async () => {
    let query = sb.from(table).select("*").order(order);
    for (const [k, v] of Object.entries(JSON.parse(filterKey) as Record<string, string>)) query = query.eq(k, v);
    const { data } = await query;
    setRows((data as Rec[]) ?? []);
  }, [sb, table, order, filterKey]);
  useEffect(() => { load(); }, [load]);

  function open(r: Rec | null) {
    setMsg("");
    setEdit(r ?? ({ id: 0 } as Rec));
    setForm(r ? { ...r } : { ...(defaults ?? {}), ...Object.fromEntries(fields.filter((f) => f.type === "bool").map((f) => [f.key, true])) });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const row = Object.fromEntries(fields.map((f) => {
      const v = form[f.key];
      return [f.key, f.type === "number" ? (v === "" || v == null ? null : Number(v)) : f.type === "bool" ? !!v : typeof v === "string" ? v.trim() || null : v ?? null];
    }));
    const { error } = edit!.id ? await sb.from(table).update(row).eq("id", edit!.id) : await sb.from(table).insert({ ...(defaults ?? {}), ...row });
    if (error) { setMsg(error.message.includes("duplicate") ? "Tên / biển số này đã có trong danh sách." : "Lỗi: " + error.message); return; }
    setEdit(null); load();
  }

  const listFields = fields.filter((f) => f.list !== false);
  const view = rows.filter((r) => !q || fold(listFields.map((f) => display(f, r[f.key])).join(" ")).includes(fold(q)));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input className={`${inputCls} max-w-sm`} placeholder="Tìm..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => open(null)} className="rounded-lg bg-[var(--brand)] px-5 py-3 font-semibold text-white">+ {addLabel}</button>
        <span className="self-center text-sm text-slate-500">{view.length} dòng</span>
      </div>
      <div className="max-h-[65vh] overflow-auto card">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="sticky top-0"><tr>{listFields.map((f) => <th key={f.key}>{f.label}</th>)}<th></th></tr></thead>
          <tbody>{view.map((r) => (
            <tr key={r.id} className={`border-t ${r.active === false ? "text-slate-400" : ""}`}>
              {listFields.map((f) => <td key={f.key} className="p-2">{display(f, r[f.key])}</td>)}
              <td className="p-2 text-right"><button className="font-medium text-[var(--brand)] underline" onClick={() => open(r)}>Sửa</button></td>
            </tr>))}</tbody>
        </table>
        {view.length === 0 && <p className="p-4 text-slate-700">Chưa có dữ liệu.</p>}
      </div>
      {edit && (
        <Modal title={edit.id ? "Sửa thông tin" : addLabel} onClose={() => setEdit(null)} wide={!!edit.id}>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className={`font-medium ${f.type === "bool" ? "flex items-center gap-2 self-end pb-3" : ""}`}>
                {f.type === "bool"
                  ? <><input type="checkbox" className="h-5 w-5" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />{f.label}</>
                  : <>{f.label}{f.type === "select"
                    ? <select className={inputCls} value={String(form[f.key] ?? "")} required={f.required} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                        {!f.required && <option value="">(trống)</option>}
                        {Object.entries(f.options ?? {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    : <input className={inputCls} type={f.type === "number" ? "number" : "text"} required={f.required} value={String(form[f.key] ?? "")}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />}</>}
              </label>
            ))}
            {msg && <p className="font-medium text-[var(--bad)] sm:col-span-2">{msg}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <button type="button" onClick={() => setEdit(null)} className="flex-1 rounded-lg border border-[var(--line)] p-3 font-semibold">Huỷ</button>
              <button className="flex-1 rounded-lg bg-[var(--brand)] p-3 font-semibold text-white">Lưu</button>
            </div>
          </form>
          {!!edit.id && <><h3 className="mb-2 mt-6 font-semibold">Lịch sử sửa</h3><AuditHistory table={table} recordId={edit.id} /></>}
        </Modal>
      )}
    </div>
  );
}
