"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmt } from "@/lib/format";

type Log = { id: number; user_id: string | null; table_name: string; record_id: number | null; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; at: string };

export const fieldLabel: Record<string, string> = {
  trip_date: "Ngày phiếu", site_ticket_no: "Số phiếu", vehicle_id: "Xe", plate_text: "Biển số gõ tay", mine_id: "Nơi lấy", site_id: "Nơi đổ",
  material_id: "Vật tư", trips_count: "Số chuyến", qty_per_trip: "KL/chuyến", mine_qty_per_trip: "m³ mỏ ký", driver_advance: "Lái xe chi",
  note: "Ghi chú", status: "Trạng thái", sell_price: "Giá bán", buy_price: "Giá mua", freight_price: "Giá cước", volume_m3: "m³ mỗi chuyến",
  partner_id: "Mỏ / công trình", amount: "Số tiền", paid_at: "Ngày", direction: "Thu/Chi", kind: "Loại", category: "Khoản mục", method: "Hình thức",
  ref_no: "Số chứng từ", name: "Tên", short_name: "Tên trong sổ", plate: "Biển số", trailer: "Mooc", owner_name: "Chủ xe", driver_name: "Lái xe",
  ownership: "Sở hữu", active: "Đang dùng", type: "Loại", contact: "Liên hệ", phone: "Điện thoại",
};
const skip = new Set(["id", "qty_total", "mine_qty_total", "created_at", "created_by", "updated_at", "buy_contract_id", "sell_contract_id", "contract_id", "uploaded_by"]);
export const actionLabel: Record<string, string> = { insert: "Tạo mới", update: "Sửa", delete: "Xoá" };

let cache: Promise<{ users: Record<string, string>; names: Record<string, string> }> | null = null;
// Tên người dùng, xe, mỏ/công trình để hiện thay cho số id
export function lookups() {
  if (!cache) {
    const sb = createClient();
    cache = Promise.all([
      sb.from("profiles").select("id,full_name"), sb.from("partners").select("id,name"),
      sb.from("vehicles").select("id,plate"), sb.from("materials").select("id,name"),
    ]).then(([u, p, v, m]) => ({
      users: Object.fromEntries((u.data ?? []).map((x) => [x.id, x.full_name])),
      names: {
        ...Object.fromEntries((p.data ?? []).map((x) => [`p${x.id}`, x.name])),
        ...Object.fromEntries((v.data ?? []).map((x) => [`v${x.id}`, x.plate])),
        ...Object.fromEntries((m.data ?? []).map((x) => [`m${x.id}`, x.name])),
      },
    }));
    setTimeout(() => { cache = null; }, 60_000);
  }
  return cache;
}

export function show(key: string, v: unknown, names: Record<string, string>) {
  if (v == null || v === "") return "trống";
  if (key === "vehicle_id") return names[`v${v}`] ?? `#${v}`;
  if (key === "mine_id" || key === "site_id" || key === "partner_id") return names[`p${v}`] ?? `#${v}`;
  if (key === "material_id") return names[`m${v}`] ?? `#${v}`;
  if (typeof v === "number" && Math.abs(v) >= 1000) return fmt(v);
  if (typeof v === "boolean") return v ? "có" : "không";
  return String(v);
}

export function changes(l: Log, names: Record<string, string>) {
  const keys = Object.keys(l.after ?? l.before ?? {}).filter((k) => !skip.has(k));
  if (l.action !== "update") return "";
  return keys.filter((k) => JSON.stringify(l.before?.[k]) !== JSON.stringify(l.after?.[k]))
    .map((k) => `${fieldLabel[k] ?? k}: ${show(k, l.before?.[k], names)} → ${show(k, l.after?.[k], names)}`).join("; ");
}

export const when = (at: string) => new Date(at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

// Lịch sử sửa của một bản ghi (ai sửa, lúc nào, đổi gì)
export default function AuditHistory({ table, recordId, match }: { table: string; recordId?: number; match?: Record<string, number> }) {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [lk, setLk] = useState<{ users: Record<string, string>; names: Record<string, string> }>({ users: {}, names: {} });
  const matchKey = JSON.stringify(match ?? null);
  useEffect(() => {
    const sb = createClient();
    const base = () => sb.from("audit_logs").select("*").eq("table_name", table).order("at", { ascending: false }).limit(50);
    const m = JSON.parse(matchKey) as Record<string, number> | null;
    // Bảng không có id (vd khối lượng xe): tìm theo nội dung trước/sau khi sửa
    const qs = m ? [base().contains("after", m), base().contains("before", m)] : [recordId != null ? base().eq("record_id", recordId) : base()];
    Promise.all(qs).then((rs) => {
      const seen = new Map<number, Log>();
      rs.forEach((r) => ((r.data as Log[]) ?? []).forEach((l) => seen.set(l.id, l)));
      setLogs([...seen.values()].sort((a, b) => b.at.localeCompare(a.at)));
    });
    lookups().then(setLk);
  }, [table, recordId, matchKey]);
  if (!logs) return <p className="text-sm text-slate-500">Đang tải lịch sử...</p>;
  if (!logs.length) return <p className="text-sm text-slate-500">Chưa có lịch sử sửa.</p>;
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {logs.map((l) => (
        <li key={l.id} className="rounded-lg bg-slate-50 px-3 py-2">
          <span className="font-medium">{actionLabel[l.action] ?? l.action}</span> bởi <b>{(l.user_id && lk.users[l.user_id]) || "hệ thống"}</b>
          <span className="text-slate-500"> lúc {when(l.at)}</span>
          {l.action === "update" && <div className="mt-0.5 text-slate-700">{changes(l, lk.names) || "Không đổi nội dung"}</div>}
        </li>
      ))}
    </ul>
  );
}
