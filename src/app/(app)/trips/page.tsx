"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { Setup } from "../../login/page";

type Opt = { id: number; name: string };
type Veh = { id: number; plate: string; driver_name: string | null };
type Trip = {
  id: number; trip_date: string; trips_count: number; qty_per_trip: number; qty_total: number; status: string;
  freight_price: number | null; vehicles: { plate: string } | null; mine: { name: string } | null; site: { name: string } | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function TripsPage() {
  const sb = supabaseReady ? createClient() : null;
  const [mines, setMines] = useState<Opt[]>([]);
  const [sites, setSites] = useState<Opt[]>([]);
  const [vehicles, setVehicles] = useState<Veh[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ date: today(), vehicle: "", mine: "", site: "", count: "1", mineQty: "", qty: "", saveVol: true, mineTicket: "", siteTicket: "" });
  const [photos, setPhotos] = useState<{ mine?: File; site?: File }>({});

  const load = useCallback(async () => {
    if (!sb) return;
    const [m, s, v, t] = await Promise.all([
      sb.from("partners").select("id,name").eq("type", "mine").order("name"),
      sb.from("partners").select("id,name").eq("type", "site").order("name"),
      sb.from("vehicles").select("id,plate,driver_name").eq("active", true).order("plate"),
      sb.from("trips").select("id,trip_date,trips_count,qty_per_trip,qty_total,status,freight_price,vehicles(plate),mine:mine_id(name),site:site_id(name)")
        .order("trip_date", { ascending: false }).order("id", { ascending: false }).limit(50),
    ]);
    setMines((m.data as Opt[]) ?? []); setSites((s.data as Opt[]) ?? []);
    setVehicles((v.data as Veh[]) ?? []); setTrips((t.data as unknown as Trip[]) ?? []);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  // Gợi ý khối lượng chuẩn của xe tại mỏ / công trình đã chọn (vẫn sửa được)
  useEffect(() => {
    if (!sb || !f.vehicle || (!f.mine && !f.site)) return;
    const ids = [f.mine, f.site].filter(Boolean).map(Number);
    sb.from("vehicle_volumes").select("partner_id,volume_m3").eq("vehicle_id", Number(f.vehicle)).in("partner_id", ids)
      .then(({ data }) => setF((cur) => ({
        ...cur,
        mineQty: String(data?.find((d) => d.partner_id === Number(cur.mine))?.volume_m3 ?? cur.mineQty),
        qty: String(data?.find((d) => d.partner_id === Number(cur.site))?.volume_m3 ?? cur.qty),
      })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.vehicle, f.mine, f.site]);

  async function priceFor(partnerId: number, dir: "buy" | "sell", date: string) {
    const { data: c } = await sb!.from("contracts").select("id").eq("partner_id", partnerId).eq("direction", dir).eq("status", "active")
      .or(`end_date.is.null,end_date.gte.${date}`).order("id", { ascending: false }).limit(1);
    const contractId = c?.[0]?.id ?? null;
    if (!contractId) return { contractId: null, price: null };
    const { data: p } = await sb!.from("contract_prices").select("unit_price").eq("contract_id", contractId)
      .lte("valid_from", date).or(`valid_to.is.null,valid_to.gte.${date}`).order("valid_from", { ascending: false }).limit(1);
    return { contractId, price: p?.[0]?.unit_price ?? null };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    const mineId = Number(f.mine), siteId = Number(f.site);
    const [buy, sell, rate] = await Promise.all([
      priceFor(mineId, "buy", f.date), priceFor(siteId, "sell", f.date),
      sb!.from("freight_rates").select("price").eq("from_partner_id", mineId).eq("to_partner_id", siteId)
        .lte("valid_from", f.date).or(`valid_to.is.null,valid_to.gte.${f.date}`).order("valid_from", { ascending: false }).limit(1),
    ]);
    const veh = vehicles.find((v) => v.id === Number(f.vehicle));
    const { data, error } = await sb!.from("trips").insert({
      trip_date: f.date, vehicle_id: veh?.id, driver_name: veh?.driver_name, mine_id: mineId, site_id: siteId,
      trips_count: Number(f.count), mine_qty_per_trip: Number(f.mineQty), qty_per_trip: Number(f.qty),
      buy_contract_id: buy.contractId, buy_price: buy.price, sell_contract_id: sell.contractId, sell_price: sell.price,
      freight_price: rate.data?.[0]?.price ?? null, mine_ticket_no: f.mineTicket || null, site_ticket_no: f.siteTicket || null,
    }).select("id").single();
    if (error || !data) { setMsg("Lỗi: " + (error?.message ?? "không lưu được")); return; }
    if (f.saveVol && veh) {
      await sb!.from("vehicle_volumes").upsert([
        { vehicle_id: veh.id, partner_id: mineId, volume_m3: Number(f.mineQty), updated_at: new Date().toISOString() },
        { vehicle_id: veh.id, partner_id: siteId, volume_m3: Number(f.qty), updated_at: new Date().toISOString() },
      ]);
    }
    for (const [kind, file] of [["mine_ticket", photos.mine], ["site_ticket", photos.site]] as const) {
      if (!file) continue;
      const path = `trips/${data.id}/${kind}-${Date.now()}`;
      const up = await sb!.storage.from("documents").upload(path, file);
      if (!up.error) await sb!.from("documents").insert({ owner_type: "trip", owner_id: data.id, kind, file_path: path });
    }
    setMsg("Đã lưu chuyến." + (buy.price == null || sell.price == null ? " Chưa có giá hợp đồng nên chưa tính tiền." : ""));
    setF({ ...f, mineQty: "", qty: "", count: "1", mineTicket: "", siteTicket: "" }); setPhotos({}); load();
  }

  async function approve(id: number) { await sb!.from("trips").update({ status: "approved" }).eq("id", id); load(); }

  if (!supabaseReady) return <Setup />;
  const input = "rounded border p-3 w-full";
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-3 text-2xl font-bold">Nhập chuyến</h1>
        <form onSubmit={submit} className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-2">
          <label>Ngày<input id="date" type="date" required className={input} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label>Xe<select id="vehicle" required className={input} value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })}>
            <option value="">Chọn xe</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} {v.driver_name ?? ""}</option>)}</select></label>
          <label>Nơi lấy (mỏ)<select id="mine" required className={input} value={f.mine} onChange={(e) => setF({ ...f, mine: e.target.value })}>
            <option value="">Chọn mỏ</option>{mines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>Nơi đổ (công trình)<select id="site" required className={input} value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })}>
            <option value="">Chọn công trình</option>{sites.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>Số chuyến<input id="count" type="number" min="1" required className={input} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></label>
          <label>m³ mỗi chuyến, mỏ ký sổ<input id="mineQty" type="number" step="0.1" required className={input} value={f.mineQty} onChange={(e) => setF({ ...f, mineQty: e.target.value })} /></label>
          <label>m³ mỗi chuyến, công trình nhận<input id="qty" type="number" step="0.1" required className={input} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
          <label className="flex items-center gap-2 sm:col-span-2"><input id="saveVol" type="checkbox" checked={f.saveVol} onChange={(e) => setF({ ...f, saveVol: e.target.checked })} />Lưu 2 số này làm khối lượng chuẩn của xe này cho lần sau</label>
          <label>Số phiếu mỏ<input id="mineTicket" className={input} value={f.mineTicket} onChange={(e) => setF({ ...f, mineTicket: e.target.value })} /></label>
          <label>Số phiếu công trình<input id="siteTicket" className={input} value={f.siteTicket} onChange={(e) => setF({ ...f, siteTicket: e.target.value })} /></label>
          <label>Ảnh phiếu mỏ<input id="photoMine" type="file" accept="image/*" capture="environment" className={input} onChange={(e) => setPhotos({ ...photos, mine: e.target.files?.[0] })} /></label>
          <label>Ảnh phiếu công trình<input id="photoSite" type="file" accept="image/*" capture="environment" className={input} onChange={(e) => setPhotos({ ...photos, site: e.target.files?.[0] })} /></label>
          <button className="rounded bg-amber-600 p-3 font-semibold text-white sm:col-span-2">Lưu chuyến</button>
          {msg && <p className="sm:col-span-2">{msg}</p>}
        </form>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">50 chuyến gần nhất</h2>
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left"><tr>{["Ngày", "Xe", "Mỏ", "Công trình", "Chuyến", "m³ công trình", "Cước", "Trạng thái", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
            <tbody>{trips.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2">{t.trip_date}</td><td className="p-2">{t.vehicles?.plate}</td><td className="p-2">{t.mine?.name}</td><td className="p-2">{t.site?.name}</td>
                <td className="p-2">{t.trips_count}</td><td className="p-2">{t.qty_total}</td>
                <td className="p-2">{t.freight_price?.toLocaleString("vi-VN") ?? "-"}</td>
                <td className="p-2">{{ draft: "Nháp", approved: "Đã duyệt", reconciled: "Đã đối soát" }[t.status]}</td>
                <td className="p-2">{t.status === "draft" && <button onClick={() => approve(t.id)} className="text-amber-700 underline">Duyệt</button>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
