"use client";
import { useEffect, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import CrudTable from "@/components/CrudTable";
import { PageTitle } from "@/components/PageBits";
import { actionLabel, changes, lookups, show, when } from "@/components/AuditHistory";
import { Setup } from "../../login/page";

const own = { owned: "Xe công ty", leased: "Thuê dài hạn", outsourced: "Thuê ngoài" };
const partnerFields = [
  { key: "name", label: "Tên", required: true }, { key: "short_name", label: "Tên ghi trong sổ" },
  { key: "contact", label: "Người liên hệ" }, { key: "phone", label: "Điện thoại" }, { key: "tax_code", label: "Mã số thuế", list: false },
  { key: "bank_account", label: "Tài khoản ngân hàng", list: false }, { key: "active", label: "Đang dùng", type: "bool" as const },
];
const tabs = [
  { key: "xe", label: "Xe" }, { key: "mo", label: "Mỏ" }, { key: "ct", label: "Công trình" }, { key: "dv", label: "Đơn vị xe thuê" },
  { key: "vt", label: "Vật tư" }, { key: "log", label: "Nhật ký sửa" },
];
const tableLabel: Record<string, string> = { trips: "Phiếu", vehicle_volumes: "Khối lượng xe", payments: "Sổ quỹ", vehicles: "Xe", partners: "Mỏ / công trình", materials: "Vật tư" };

type Log = { id: number; user_id: string | null; table_name: string; record_id: number | null; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; at: string };

// Nhật ký: mọi lần thêm / sửa / xoá, ai làm, lúc nào
function AuditLog() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [lk, setLk] = useState<{ users: Record<string, string>; names: Record<string, string> }>({ users: {}, names: {} });
  const [user, setUser] = useState("");
  const [tbl, setTbl] = useState("");
  useEffect(() => {
    let q = createClient().from("audit_logs").select("*").order("at", { ascending: false }).limit(300);
    if (user) q = q.eq("user_id", user);
    if (tbl) q = q.eq("table_name", tbl);
    q.then(({ data }) => setLogs((data as Log[]) ?? []));
    lookups().then(setLk);
  }, [user, tbl]);
  const what = (l: Log) => {
    const r = l.after ?? l.before ?? {};
    if (l.table_name === "trips") return `Phiếu ${r.trip_date ?? ""} xe ${show("vehicle_id", r.vehicle_id, lk.names) === "trống" ? r.plate_text ?? "" : show("vehicle_id", r.vehicle_id, lk.names)}${r.site_ticket_no ? ` số ${r.site_ticket_no}` : ""}`;
    if (l.table_name === "vehicle_volumes") return `${show("vehicle_id", r.vehicle_id, lk.names)} tại ${show("partner_id", r.partner_id, lk.names)}`;
    if (l.table_name === "payments") return `${r.direction === "in" ? "Thu" : "Chi"} ${show("amount", r.amount, lk.names)} ngày ${r.paid_at}`;
    return String(r.plate ?? r.name ?? "");
  };
  const sel = "rounded-lg border border-[var(--line)] p-3";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select className={sel} value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="">Tất cả nhân viên</option>
          {Object.entries(lk.users).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select className={sel} value={tbl} onChange={(e) => setTbl(e.target.value)}>
          <option value="">Tất cả loại</option>
          {Object.entries(tableLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="self-center text-sm text-slate-500">300 thao tác gần nhất</span>
      </div>
      <div className="max-h-[65vh] overflow-auto card">
        <table className="w-full text-sm">
          <thead className="sticky top-0"><tr><th>Lúc</th><th>Nhân viên</th><th>Thao tác</th><th>Nội dung</th><th>Thay đổi</th></tr></thead>
          <tbody>{logs.map((l) => (
            <tr key={l.id} className="border-t align-top">
              <td className="whitespace-nowrap p-2">{when(l.at)}</td>
              <td className="whitespace-nowrap p-2 font-medium">{(l.user_id && lk.users[l.user_id]) || "hệ thống"}</td>
              <td className="whitespace-nowrap p-2">{actionLabel[l.action] ?? l.action} {tableLabel[l.table_name]?.toLowerCase() ?? l.table_name}</td>
              <td className="p-2">{what(l)}</td>
              <td className="p-2 text-slate-700">{changes(l, lk.names)}</td>
            </tr>))}</tbody>
        </table>
        {logs.length === 0 && <p className="p-4 text-slate-700">Chưa có thao tác nào được ghi.</p>}
      </div>
    </div>
  );
}

// Danh mục dữ liệu gốc: xe, mỏ, công trình, đơn vị xe thuê, vật tư và nhật ký sửa
export default function DataPage() {
  const [tab, setTab] = useState("xe");
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (tabs.some((t) => t.key === h)) setTab(h);
  }, []);
  function go(k: string) { setTab(k); history.replaceState(null, "", "#" + k); }
  if (!supabaseReady) return <Setup />;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Data" sub="Danh mục xe, mỏ, công trình, vật tư. Mọi thay đổi đều được ghi vào nhật ký." />
      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => go(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 font-medium ${tab === t.key ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{t.label}</button>))}
      </div>
      {tab === "xe" && <CrudTable key="xe" table="vehicles" order="plate" addLabel="Thêm xe" defaults={{ ownership: "outsourced" }} fields={[
        { key: "plate", label: "Biển số đầu", required: true }, { key: "trailer", label: "Biển số mooc" },
        { key: "ownership", label: "Loại xe", type: "select", options: own, required: true }, { key: "owner_name", label: "Chủ xe (Nhà)" },
        { key: "driver_name", label: "Lái xe" }, { key: "active", label: "Đang chạy", type: "bool" },
      ]} />}
      {tab === "mo" && <CrudTable key="mo" table="partners" order="name" filter={{ type: "mine" }} defaults={{ type: "mine" }} addLabel="Thêm mỏ" fields={partnerFields} />}
      {tab === "ct" && <CrudTable key="ct" table="partners" order="name" filter={{ type: "site" }} defaults={{ type: "site" }} addLabel="Thêm công trình" fields={partnerFields} />}
      {tab === "dv" && <CrudTable key="dv" table="partners" order="name" filter={{ type: "vendor" }} defaults={{ type: "vendor" }} addLabel="Thêm đơn vị" fields={partnerFields} />}
      {tab === "vt" && <CrudTable key="vt" table="materials" order="name" addLabel="Thêm vật tư" defaults={{ default_unit: "m3" }} fields={[{ key: "name", label: "Tên vật tư", required: true }, { key: "default_unit", label: "Đơn vị", required: true }]} />}
      {tab === "log" && <AuditLog />}
    </div>
  );
}
