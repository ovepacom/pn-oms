"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { fmt, fmtNum, fold, localDate, monthStart } from "@/lib/format";
import { fetchAll } from "@/lib/trips";
import { downloadCsv } from "@/lib/csv";
import { DateRange, ExportButton, PageTitle, Totals, inputCls } from "@/components/PageBits";
import { Setup } from "../../../login/page";

type Row = { trips_count: number; qty_total: number; freight_price: number | null; driver_advance: number; plate_text: string | null; vehicles: { plate: string; owner_name: string | null; ownership: string } | null };
const own: Record<string, string> = { owned: "Xe công ty", leased: "Thuê dài hạn", outsourced: "Thuê ngoài" };

// Báo cáo cước xe: số chuyến, khối lượng, tiền cước và lái xe chi theo từng xe hoặc từng chủ xe
export default function FreightReport() {
  const sb = useMemo(() => (supabaseReady ? createClient() : null), []);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(localDate());
  const [byOwner, setByOwner] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!sb) return;
    fetchAll<Row>((a, b) => sb.from("trips").select("trips_count,qty_total,freight_price,driver_advance,plate_text,vehicles(plate,owner_name,ownership)")
      .gte("trip_date", from).lte("trip_date", to).order("id").range(a, b)).then(setRows);
  }, [sb, from, to]);

  const groups = useMemo(() => {
    const m = new Map<string, { key: string; owner: string; kind: string; vehicles: Set<string>; trips: number; qty: number; freight: number; advance: number; noPrice: number }>();
    for (const r of rows) {
      const plate = r.vehicles?.plate ?? r.plate_text ?? "?";
      const owner = r.vehicles?.owner_name ?? (r.vehicles ? "" : "Xe ngoài danh sách");
      const key = byOwner ? owner || "(chưa ghi)" : plate;
      const g = m.get(key) ?? { key, owner, kind: r.vehicles ? own[r.vehicles.ownership] ?? "" : "", vehicles: new Set(), trips: 0, qty: 0, freight: 0, advance: 0, noPrice: 0 };
      g.vehicles.add(plate); g.trips += r.trips_count; g.qty += r.qty_total; g.freight += r.qty_total * (r.freight_price ?? 0); g.advance += r.driver_advance ?? 0;
      if (r.freight_price == null) g.noPrice++;
      m.set(key, g);
    }
    return [...m.values()].filter((g) => !q || fold(g.key + " " + g.owner).includes(fold(q))).sort((a, b) => b.freight - a.freight || b.trips - a.trips);
  }, [rows, byOwner, q]);

  const header = byOwner ? ["Chủ xe", "Số xe", "Số chuyến", "Tổng KL (m³)", "Tiền cước", "Lái xe chi"] : ["Biển số", "Chủ xe", "Loại xe", "Số chuyến", "Tổng KL (m³)", "Tiền cước", "Lái xe chi"];
  const line = (g: (typeof groups)[number]) => byOwner ? [g.key, g.vehicles.size, g.trips, fmtNum(g.qty), Math.round(g.freight), g.advance] : [g.key, g.owner, g.kind, g.trips, fmtNum(g.qty), Math.round(g.freight), g.advance];
  if (!supabaseReady) return <Setup />;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Báo cáo cước xe" sub="Tiền cước tính bằng tổng KL công trình nhận nhân giá cước tuyến.">
        <ExportButton onClick={() => downloadCsv(`cuoc-xe-${from}-${to}`, header, groups.map(line))} />
      </PageTitle>
      <div className="grid gap-3 card p-4 sm:grid-cols-4">
        <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
        <label className="font-medium">Tìm<input className={inputCls} placeholder="Biển số hoặc chủ xe" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="font-medium">Xem theo
          <div className="flex rounded-lg border border-[var(--line)] p-1">
            {[["Từng xe", false], ["Chủ xe", true]].map(([l, v]) => (
              <button key={String(l)} type="button" onClick={() => setByOwner(v as boolean)} className={`flex-1 rounded-md p-2 ${byOwner === v ? "bg-[var(--brand)] text-white" : ""}`}>{l}</button>))}
          </div>
        </div>
      </div>
      <Totals items={[["Số chuyến", groups.reduce((s, g) => s + g.trips, 0).toLocaleString("vi-VN")], ["Tiền cước", fmt(groups.reduce((s, g) => s + g.freight, 0)) + " ₫"], ["Lái xe chi", fmt(groups.reduce((s, g) => s + g.advance, 0)) + " ₫"]]} />
      <div className="max-h-[70vh] overflow-auto card">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="sticky top-0"><tr>{header.map((h, i) => <th key={h} className={i >= (byOwner ? 1 : 3) ? "text-right" : ""}>{h}</th>)}</tr></thead>
          <tbody>{groups.map((g) => (
            <tr key={g.key} className="border-t">
              <td className="p-2 font-medium">{g.key}</td>
              {byOwner ? <td className="p-2 text-right">{g.vehicles.size}</td> : <><td className="p-2">{g.owner}</td><td className="p-2">{g.kind}</td></>}
              <td className="p-2 text-right">{g.trips.toLocaleString("vi-VN")}</td><td className="p-2 text-right">{fmtNum(g.qty)}</td>
              <td className="p-2 text-right font-semibold">{fmt(g.freight)}{g.noPrice > 0 && <span className="ml-1 text-xs font-normal text-[var(--warn)]">({g.noPrice} phiếu chưa có giá cước)</span>}</td>
              <td className="p-2 text-right">{fmt(g.advance)}</td>
            </tr>))}</tbody>
        </table>
        {groups.length === 0 && <p className="p-4 text-slate-700">Chưa có số liệu.</p>}
      </div>
    </div>
  );
}
