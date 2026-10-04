"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { fmt, fmtNum, fold, localDate, monthStart } from "@/lib/format";
import Combobox from "@/components/Combobox";
import { Setup } from "../../login/page";

type Row = {
  id: number; trip_date: string; site_ticket_no: string | null; plate_text: string | null; trips_count: number; qty_per_trip: number;
  qty_total: number; sell_price: number | null; driver_advance: number; note: string | null; status: "draft" | "approved" | "reconciled";
  vehicles: { plate: string; trailer: string | null; owner_name: string | null } | null;
  materials: { name: string } | null; mine: { id: number; name: string; short_name: string | null } | null; site: { id: number; name: string } | null;
};
type Opt = { id: number; name: string; type: string };

const statusLabel = { draft: "Nháp", approved: "Đã duyệt", reconciled: "Đã đối soát" };
// Cột theo đúng sổ tổng hợp T09
const cols: { key: string; label: string; num?: boolean; get: (r: Row) => string | number | null }[] = [
  { key: "ticket", label: "Số tàu, Số phiếu", get: (r) => r.site_ticket_no },
  { key: "date", label: "Ngày phiếu", get: (r) => r.trip_date },
  { key: "plate", label: "Biển số đầu", get: (r) => r.vehicles?.plate ?? r.plate_text },
  { key: "trailer", label: "Biển số Mooc", get: (r) => r.vehicles?.trailer ?? null },
  { key: "material", label: "Vật tư", get: (r) => r.materials?.name ?? null },
  { key: "mine", label: "Nơi lấy", get: (r) => r.mine?.short_name ?? r.mine?.name ?? null },
  { key: "site", label: "Nơi đổ", get: (r) => r.site?.name ?? null },
  { key: "count", label: "Số chuyến", num: true, get: (r) => r.trips_count },
  { key: "qty", label: "KL/chuyến", num: true, get: (r) => r.qty_per_trip },
  { key: "total", label: "Tổng KL", num: true, get: (r) => r.qty_total },
  { key: "price", label: "Đơn giá chưa VAT", num: true, get: (r) => r.sell_price },
  { key: "amount", label: "Thành tiền", num: true, get: (r) => (r.sell_price == null ? null : r.qty_total * r.sell_price) },
  { key: "note", label: "Ghi chú", get: (r) => r.note },
  { key: "advance", label: "Chi", num: true, get: (r) => r.driver_advance || null },
  { key: "status", label: "Trạng thái", get: (r) => statusLabel[r.status] },
];

export default function Summary() {
  const sb = useMemo(() => (supabaseReady ? createClient() : null), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [partners, setPartners] = useState<Opt[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [flt, setFlt] = useState({ from: monthStart(), to: localDate(), plate: "", mine: "", site: "", owner: "", status: "" });
  const [sort, setSort] = useState<{ key: string; asc: boolean }>({ key: "date", asc: true });

  const load = useCallback(async () => {
    if (!sb) return;
    setLoading(true);
    let q = sb.from("trips")
      .select("id,trip_date,site_ticket_no,plate_text,trips_count,qty_per_trip,qty_total,sell_price,driver_advance,note,status,vehicles(plate,trailer,owner_name),materials(name),mine:mine_id(id,name,short_name),site:site_id(id,name)")
      .gte("trip_date", flt.from).lte("trip_date", flt.to).order("trip_date").order("id").limit(5000);
    if (flt.mine) q = q.eq("mine_id", Number(flt.mine));
    if (flt.site) q = q.eq("site_id", Number(flt.site));
    if (flt.status) q = q.eq("status", flt.status);
    const { data } = await q;
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }, [sb, flt.from, flt.to, flt.mine, flt.site, flt.status]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!sb) return;
    sb.from("partners").select("id,name,type").in("type", ["mine", "site"]).order("name").then(({ data }) => setPartners((data as Opt[]) ?? []));
    sb.from("vehicles").select("owner_name").then(({ data }) => setOwners([...new Set((data ?? []).map((v) => v.owner_name as string).filter(Boolean))].sort()));
  }, [sb]);

  // Lọc biển số và chủ xe ngay trên máy, sắp xếp theo cột được bấm
  const view = useMemo(() => {
    const p = fold(flt.plate);
    const col = cols.find((c) => c.key === sort.key)!;
    return rows
      .filter((r) => !p || fold(r.vehicles?.plate ?? r.plate_text ?? "").includes(p))
      .filter((r) => !flt.owner || (flt.owner === "__out" ? !r.vehicles : r.vehicles?.owner_name === flt.owner))
      .sort((a, b) => {
        const x = col.get(a), y = col.get(b);
        const c = x == null ? 1 : y == null ? -1 : typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "vi");
        return sort.asc ? c : -c;
      });
  }, [rows, flt.plate, flt.owner, sort]);

  const sum = (fn: (r: Row) => number) => view.reduce((s, r) => s + fn(r), 0);
  const totals = { count: sum((r) => r.trips_count), total: sum((r) => r.qty_total), amount: sum((r) => (r.sell_price ?? 0) * r.qty_total), advance: sum((r) => r.driver_advance ?? 0) };

  async function approve(ids: number[]) {
    if (!ids.length) return;
    await sb!.from("trips").update({ status: "approved" }).in("id", ids).eq("status", "draft"); load();
  }
  async function remove(r: Row) {
    if (r.status !== "draft") { alert("Chỉ xoá được phiếu còn Nháp."); return; }
    if (!confirm(`Xoá phiếu ngày ${r.trip_date}, xe ${r.vehicles?.plate ?? r.plate_text}?`)) return;
    await sb!.from("documents").delete().eq("owner_type", "trip").eq("owner_id", r.id);
    await sb!.from("trips").delete().eq("id", r.id); load();
  }
  async function photos(r: Row) {
    const { data } = await sb!.from("documents").select("file_path").eq("owner_type", "trip").eq("owner_id", r.id);
    if (!data?.length) { alert("Phiếu này chưa có ảnh."); return; }
    for (const d of data) {
      const { data: s } = await sb!.storage.from("documents").createSignedUrl(d.file_path, 600);
      if (s?.signedUrl) window.open(s.signedUrl, "_blank");
    }
  }

  if (!supabaseReady) return <Setup />;
  const mineOpts = partners.filter((p) => p.type === "mine").map((p) => ({ value: String(p.id), label: p.name }));
  const siteOpts = partners.filter((p) => p.type === "site").map((p) => ({ value: String(p.id), label: p.name }));
  const input = "rounded border p-3 w-full";
  const drafts = view.filter((r) => r.status === "draft").map((r) => r.id);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Bảng tổng hợp</h1>
      <div className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-4">
        <label className="font-medium">Từ ngày<input type="date" className={input} value={flt.from} onChange={(e) => setFlt({ ...flt, from: e.target.value })} /></label>
        <label className="font-medium">Đến ngày<input type="date" className={input} value={flt.to} onChange={(e) => setFlt({ ...flt, to: e.target.value })} /></label>
        <label className="font-medium">Biển số<input className={input} placeholder="Gõ vài số, vd 07646" value={flt.plate} onChange={(e) => setFlt({ ...flt, plate: e.target.value })} /></label>
        <label className="font-medium">Chủ xe (Nhà)<select className={input} value={flt.owner} onChange={(e) => setFlt({ ...flt, owner: e.target.value })}>
          <option value="">Tất cả</option>{owners.map((o) => <option key={o} value={o}>{o}</option>)}<option value="__out">Xe ngoài danh sách</option></select></label>
        <div className="font-medium">Nơi lấy<Combobox id="fmine" options={[{ value: "", label: "Tất cả" }, ...mineOpts]} value={flt.mine} onChange={(v) => setFlt({ ...flt, mine: v })} /></div>
        <div className="font-medium">Nơi đổ<Combobox id="fsite" options={[{ value: "", label: "Tất cả" }, ...siteOpts]} value={flt.site} onChange={(v) => setFlt({ ...flt, site: v })} /></div>
        <label className="font-medium">Trạng thái<select className={input} value={flt.status} onChange={(e) => setFlt({ ...flt, status: e.target.value })}>
          <option value="">Tất cả</option>{Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <div className="flex items-end gap-2">
          <button type="button" className="w-full rounded border bg-white p-3 font-semibold" onClick={() => setFlt({ from: monthStart(), to: localDate(), plate: "", mine: "", site: "", owner: "", status: "" })}>Xoá lọc</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded border bg-white p-3">
        <span>{view.length} dòng</span>
        <span>Số chuyến: <b>{totals.count.toLocaleString("vi-VN")}</b></span>
        <span>Tổng KL: <b>{fmtNum(totals.total)} m³</b></span>
        <span>Thành tiền: <b>{fmt(totals.amount)}</b></span>
        <span>Lái xe chi: <b>{fmt(totals.advance)}</b></span>
        {drafts.length > 0 && <button className="ml-auto rounded bg-amber-600 px-4 py-2 font-semibold text-white" onClick={() => approve(drafts)}>Duyệt {drafts.length} phiếu nháp đang hiện</button>}
      </div>
      <div className="max-h-[70vh] overflow-auto rounded border bg-white">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="sticky top-0 z-10"><tr>
            {cols.map((c) => (
              <th key={c.key} className={`cursor-pointer select-none ${c.num ? "text-right" : ""}`} onClick={() => setSort({ key: c.key, asc: sort.key === c.key ? !sort.asc : true })}>
                {c.label}{sort.key === c.key ? (sort.asc ? " ▲" : " ▼") : ""}
              </th>))}
            <th></th>
          </tr></thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id} className={`border-t ${r.status === "draft" ? "bg-amber-50" : ""}`}>
                {cols.map((c) => {
                  const v = c.get(r);
                  return <td key={c.key} className={`p-2 ${c.num ? "text-right" : ""} ${c.key === "amount" ? "font-semibold" : ""}`}>
                    {v == null ? "" : c.num ? (c.key === "qty" || c.key === "total" ? fmtNum(v as number) : fmt(v as number)) : v}</td>;
                })}
                <td className="flex gap-3 p-2">
                  <button className="text-amber-700 underline" onClick={() => photos(r)}>Ảnh</button>
                  {r.status === "draft" && <button className="text-amber-700 underline" onClick={() => approve([r.id])}>Duyệt</button>}
                  {r.status === "draft" && <button className="text-red-700 underline" onClick={() => remove(r)}>Xoá</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && view.length === 0 && <p className="p-4 text-slate-700">Không có phiếu nào khớp bộ lọc.</p>}
        {loading && <p className="p-4 text-slate-700">Đang tải...</p>}
      </div>
    </div>
  );
}
