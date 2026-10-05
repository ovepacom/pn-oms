"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { fmt, fmtNum, fold, localDate, monthStart } from "@/lib/format";
import { fetchAll } from "@/lib/trips";
import { downloadCsv } from "@/lib/csv";
import Combobox from "./Combobox";
import TripEditor from "./TripEditor";
import { DateRange, ExportButton, PageTitle, Totals, inputCls } from "./PageBits";
import { Setup } from "@/app/login/page";

type Row = {
  id: number; trip_date: string; site_ticket_no: string | null; plate_text: string | null; trips_count: number; status: string;
  mine_qty_per_trip: number; mine_qty_total: number; qty_per_trip: number; qty_total: number; buy_price: number | null; sell_price: number | null;
  vehicles: { plate: string } | null; mine: { id: number; name: string } | null; site: { id: number; name: string } | null;
};

// Tổng hợp theo mỏ (KL mỏ ký sổ, giá mua) hoặc theo công trình (KL công trình nhận, giá bán), để đối chiếu với từng bên
export default function PartnerSummary({ side }: { side: "mine" | "site" }) {
  const isMine = side === "mine";
  const name = isMine ? "mỏ" : "công trình";
  const sb = useMemo(() => (supabaseReady ? createClient() : null), []);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(localDate());
  const [partner, setPartner] = useState("");
  const [plate, setPlate] = useState("");
  const [partners, setPartners] = useState<{ id: number; name: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    sb?.from("partners").select("id,name").eq("type", side).order("name").then(({ data }) => setPartners(data ?? []));
  }, [sb, side]);

  useEffect(() => {
    if (!sb) return;
    setLoading(true);
    fetchAll<Row>((a, b) => {
      let q = sb.from("trips").select("id,trip_date,site_ticket_no,plate_text,trips_count,status,mine_qty_per_trip,mine_qty_total,qty_per_trip,qty_total,buy_price,sell_price,vehicles(plate),mine:mine_id(id,name),site:site_id(id,name)")
        .order("trip_date").order("id").range(a, b);
      if (from) q = q.gte("trip_date", from);
      if (to) q = q.lte("trip_date", to);
      if (partner) q = q.eq(isMine ? "mine_id" : "site_id", Number(partner));
      return q;
    }).then((r) => { setRows(r); setLoading(false); });
  }, [sb, from, to, partner, isMine, reload]);

  const qtyPer = (r: Row) => (isMine ? r.mine_qty_per_trip : r.qty_per_trip);
  const qty = (r: Row) => (isMine ? r.mine_qty_total : r.qty_total);
  const price = (r: Row) => (isMine ? r.buy_price : r.sell_price);
  const amount = (r: Row) => (price(r) == null ? 0 : qty(r) * price(r)!);
  const own = (r: Row) => (isMine ? r.mine : r.site);
  const other = (r: Row) => (isMine ? r.site : r.mine);
  const plateOf = (r: Row) => r.vehicles?.plate ?? r.plate_text ?? "";

  const view = useMemo(() => rows.filter((r) => !plate || fold(plateOf(r)).includes(fold(plate))), [rows, plate]);
  const groups = useMemo(() => {
    const m = new Map<number, { id: number; name: string; trips: number; qty: number; amount: number; noPrice: number }>();
    for (const r of view) {
      const p = own(r); if (!p) continue;
      const g = m.get(p.id) ?? { id: p.id, name: p.name, trips: 0, qty: 0, amount: 0, noPrice: 0 };
      g.trips += r.trips_count; g.qty += qty(r); g.amount += amount(r); if (price(r) == null) g.noPrice++;
      m.set(p.id, g);
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const tot = { trips: view.reduce((s, r) => s + r.trips_count, 0), qty: view.reduce((s, r) => s + qty(r), 0), amount: view.reduce((s, r) => s + amount(r), 0) };
  const header = ["Ngày", "Số phiếu", "Biển số", isMine ? "Mỏ" : "Công trình", isMine ? "Nơi đổ" : "Nơi lấy", "Số chuyến", isMine ? "m³ mỏ ký/chuyến" : "KL/chuyến", "Tổng KL", isMine ? "Giá mua" : "Đơn giá", "Thành tiền"];
  function exportCsv() {
    downloadCsv(`tong-hop-${isMine ? "mo" : "cong-trinh"}-${from}-${to}`, header,
      view.map((r) => [r.trip_date, r.site_ticket_no, plateOf(r), own(r)?.name, other(r)?.name, r.trips_count, qtyPer(r), qty(r), price(r), price(r) == null ? null : amount(r)]));
  }

  if (!supabaseReady) return <Setup />;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={isMine ? "Tổng hợp mỏ" : "Tổng hợp từ công trình"}
        sub={isMine ? "Khối lượng mỏ ký sổ và tiền mua theo từng mỏ, để đối chiếu sổ với mỏ." : "Khối lượng công trình nhận và tiền bán theo từng công trình, để đối chiếu với công trình."}>
        <ExportButton onClick={exportCsv} />
      </PageTitle>
      <div className="grid gap-3 card p-4 sm:grid-cols-4">
        <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
        <div className="font-medium">{isMine ? "Mỏ" : "Công trình"}<Combobox id="psel" value={partner} onChange={(v) => setPartner(v)}
          options={[{ value: "", label: "Tất cả" }, ...partners.map((p) => ({ value: String(p.id), label: p.name }))]} /></div>
        <label className="font-medium">Biển số<input className={inputCls} placeholder="Gõ vài số" value={plate} onChange={(e) => setPlate(e.target.value)} /></label>
      </div>
      <Totals items={[["Số chuyến", tot.trips.toLocaleString("vi-VN")], ["Tổng KL", fmtNum(tot.qty) + " m³"], [isMine ? "Tiền mua" : "Tiền bán", fmt(tot.amount) + " ₫"]]} />

      {!partner && (
        <div className="overflow-x-auto card">
          <table className="w-full text-sm">
            <thead><tr><th>{isMine ? "Mỏ" : "Công trình"}</th><th className="text-right">Số chuyến</th><th className="text-right">Tổng KL (m³)</th><th className="text-right">{isMine ? "Tiền mua" : "Tiền bán"}</th><th></th></tr></thead>
            <tbody>{groups.map((g) => (
              <tr key={g.id} className="cursor-pointer border-t hover:bg-slate-50" onClick={() => setPartner(String(g.id))}>
                <td className="p-2 font-medium">{g.name}</td><td className="p-2 text-right">{g.trips.toLocaleString("vi-VN")}</td>
                <td className="p-2 text-right">{fmtNum(g.qty)}</td>
                <td className="p-2 text-right font-semibold">{fmt(g.amount)}{g.noPrice > 0 && <span className="ml-1 text-xs font-normal text-[var(--warn)]">({g.noPrice} phiếu chưa có giá)</span>}</td>
                <td className="p-2 text-right text-[var(--brand)]">Xem chi tiết</td>
              </tr>))}</tbody>
          </table>
          {!loading && groups.length === 0 && <p className="p-4 text-slate-700">Không có phiếu nào trong khoảng này.</p>}
        </div>
      )}

      {partner && (
        <div className="max-h-[70vh] overflow-auto card">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="sticky top-0 z-10"><tr>{header.map((h, i) => <th key={h} className={i >= 5 ? "text-right" : ""}>{h}</th>)}<th></th></tr></thead>
            <tbody>{view.map((r) => (
              <tr key={r.id} className={`border-t ${r.status === "draft" ? "bg-amber-50/70" : ""}`}>
                <td className="p-2">{r.trip_date}</td><td className="p-2">{r.site_ticket_no}</td><td className="p-2">{plateOf(r)}</td>
                <td className="p-2">{own(r)?.name}</td><td className="p-2">{other(r)?.name}</td>
                <td className="p-2 text-right">{r.trips_count}</td><td className="p-2 text-right">{fmtNum(qtyPer(r))}</td><td className="p-2 text-right">{fmtNum(qty(r))}</td>
                <td className="p-2 text-right">{fmt(price(r))}</td><td className="p-2 text-right font-semibold">{price(r) == null ? "" : fmt(amount(r))}</td>
                <td className="p-2">{r.status !== "reconciled" && <button className="text-[var(--brand)] underline" onClick={() => setEditing(r.id)}>Sửa</button>}</td>
              </tr>))}</tbody>
          </table>
          {loading && <p className="p-4 text-slate-700">Đang tải...</p>}
          {!loading && view.length === 0 && <p className="p-4 text-slate-700">Không có phiếu nào với {name} này trong khoảng đã chọn.</p>}
        </div>
      )}
      {partner && <button className="self-start font-semibold text-[var(--brand)] underline" onClick={() => setPartner("")}>Quay lại bảng tất cả {name}</button>}
      {editing != null && <TripEditor id={editing} onClose={() => setEditing(null)} onSaved={() => setReload((x) => x + 1)} />}
    </div>
  );
}
