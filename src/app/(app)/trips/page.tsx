"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { fmt, localDate } from "@/lib/format";
import Combobox from "@/components/Combobox";
import ScanPhotos, { type Shot } from "@/components/ScanPhotos";
import { Setup } from "../../login/page";

type Opt = { id: number; name: string };
type Veh = { id: number; plate: string; trailer: string | null; driver_name: string | null; owner_name: string | null };
type Trip = {
  id: number; trip_date: string; trips_count: number; qty_total: number; driver_advance: number; site_ticket_no: string | null;
  plate_text: string | null; vehicles: { plate: string } | null; mine: { name: string } | null; site: { name: string } | null;
};

const empty = () => ({ date: localDate(), vehicle: "", plateText: "", material: "", mine: "", site: "", count: "1", qty: "", mineQty: "", ticket: "", advance: "", note: "" });

// Nhập phiếu bán cho công trình: mỗi dòng giống một dòng trong sổ tổng hợp (T09)
export default function TripsPage() {
  const sb = useMemo(() => (supabaseReady ? createClient() : null), []);
  const [mines, setMines] = useState<Opt[]>([]);
  const [sites, setSites] = useState<Opt[]>([]);
  const [materials, setMaterials] = useState<Opt[]>([]);
  const [vehicles, setVehicles] = useState<Veh[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(empty);
  const [formKey, setFormKey] = useState(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const [enhance, setEnhance] = useState(true);

  const load = useCallback(async () => {
    if (!sb) return;
    const [m, s, mat, v, t] = await Promise.all([
      sb.from("partners").select("id,name").eq("type", "mine").eq("active", true).order("name"),
      sb.from("partners").select("id,name").eq("type", "site").eq("active", true).order("name"),
      sb.from("materials").select("id,name").order("name"),
      sb.from("vehicles").select("id,plate,trailer,driver_name,owner_name").eq("active", true).order("plate"),
      sb.from("trips").select("id,trip_date,trips_count,qty_total,driver_advance,site_ticket_no,plate_text,vehicles(plate),mine:mine_id(name),site:site_id(name)")
        .order("created_at", { ascending: false }).limit(20),
    ]);
    setMines((m.data as Opt[]) ?? []); setSites((s.data as Opt[]) ?? []); setMaterials((mat.data as Opt[]) ?? []);
    setVehicles((v.data as Veh[]) ?? []); setTrips((t.data as unknown as Trip[]) ?? []);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  // Vật tư mặc định là Đất
  useEffect(() => {
    if (!f.material && materials.length) setF((cur) => ({ ...cur, material: String(materials.find((x) => x.name === "Đất")?.id ?? materials[0].id) }));
  }, [materials, f.material]);

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
  }, [sb, f.vehicle, f.mine, f.site]);

  const vehOpts = useMemo(() => vehicles.map((v) => ({ value: String(v.id), label: v.plate, hint: [v.driver_name, v.owner_name !== "CTY" ? v.owner_name : null].filter(Boolean).join(" · ") })), [vehicles]);
  const mineOpts = useMemo(() => mines.map((m) => ({ value: String(m.id), label: m.name })), [mines]);
  const siteOpts = useMemo(() => sites.map((m) => ({ value: String(m.id), label: m.name })), [sites]);
  const matOpts = useMemo(() => materials.map((m) => ({ value: String(m.id), label: m.name })), [materials]);
  const veh = vehicles.find((v) => v.id === Number(f.vehicle));

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
    if (!f.vehicle && !f.plateText) { setMsg("Chưa chọn xe."); return; }
    if (!f.mine || !f.site) { setMsg("Chưa chọn nơi lấy hoặc nơi đổ."); return; }
    setSaving(true);
    const mineId = Number(f.mine), siteId = Number(f.site);
    const qty = Number(f.qty), mineQty = f.mineQty ? Number(f.mineQty) : qty;
    const [buy, sell, rate] = await Promise.all([
      priceFor(mineId, "buy", f.date), priceFor(siteId, "sell", f.date),
      sb!.from("freight_rates").select("price").eq("from_partner_id", mineId).eq("to_partner_id", siteId)
        .lte("valid_from", f.date).or(`valid_to.is.null,valid_to.gte.${f.date}`).order("valid_from", { ascending: false }).limit(1),
    ]);
    const { data: u } = await sb!.auth.getUser();
    const { data, error } = await sb!.from("trips").insert({
      trip_date: f.date, vehicle_id: veh?.id ?? null, plate_text: veh ? null : f.plateText.toUpperCase(), driver_name: veh?.driver_name ?? null,
      material_id: f.material ? Number(f.material) : null, mine_id: mineId, site_id: siteId,
      trips_count: Number(f.count), mine_qty_per_trip: mineQty, qty_per_trip: qty,
      buy_contract_id: buy.contractId, buy_price: buy.price, sell_contract_id: sell.contractId, sell_price: sell.price,
      freight_price: rate.data?.[0]?.price ?? null, site_ticket_no: f.ticket || null,
      driver_advance: Number(f.advance.replace(/\D/g, "")) || 0, note: f.note || null, created_by: u.user?.id ?? null,
    }).select("id").single();
    if (error || !data) { setSaving(false); setMsg("Lỗi: " + (error?.message ?? "không lưu được")); return; }
    if (veh) {
      await sb!.from("vehicle_volumes").upsert([
        { vehicle_id: veh.id, partner_id: mineId, volume_m3: mineQty, updated_at: new Date().toISOString() },
        { vehicle_id: veh.id, partner_id: siteId, volume_m3: qty, updated_at: new Date().toISOString() },
      ]);
    }
    let failed = 0;
    for (const [i, s] of shots.entries()) {
      const path = `trips/${data.id}/ticket-${Date.now()}-${i}.jpg`;
      const up = await sb!.storage.from("documents").upload(path, s.file, { contentType: s.file.type });
      if (up.error) { failed++; continue; }
      await sb!.from("documents").insert({ owner_type: "trip", owner_id: data.id, kind: "ticket", file_path: path, uploaded_by: u.user?.id ?? null });
    }
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setSaving(false);
    setMsg(`Đã lưu chuyến${shots.length ? ` kèm ${shots.length - failed} ảnh` : ""}.` + (failed ? ` ${failed} ảnh lỗi, thử lại sau.` : "") + (sell.price == null ? " Chưa có giá bán cho công trình này nên chưa tính thành tiền." : ""));
    setF({ ...empty(), date: f.date, material: f.material }); setShots([]); setFormKey((k) => k + 1); load();
  }

  if (!supabaseReady) return <Setup />;
  const input = "rounded-lg border border-[var(--line)] p-3 w-full";
  const advanceView = f.advance ? Number(f.advance.replace(/\D/g, "")).toLocaleString("vi-VN") : "";
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight">Nhập phiếu bán cho công trình</h1>
        <form key={formKey} onSubmit={submit} className="grid gap-3 card p-4 sm:grid-cols-2">
          <label className="font-medium">Ngày phiếu<input id="date" type="date" required className={input} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="font-medium">Số phiếu<input id="ticket" className={input} value={f.ticket} onChange={(e) => setF({ ...f, ticket: e.target.value })} /></label>
          <div className="font-medium">Biển số đầu
            <Combobox id="vehicle" options={vehOpts} value={f.vehicle} allowFree placeholder="Gõ biển số, vd 07646"
              onChange={(v, t) => setF({ ...f, vehicle: v, plateText: v ? "" : t })} />
            <span className="text-sm font-normal text-slate-700">{veh ? `Mooc ${veh.trailer ?? "-"} · ${veh.driver_name ?? veh.owner_name ?? ""}` : f.plateText ? "Xe ngoài danh sách, sẽ lưu biển số đã gõ" : ""}</span>
          </div>
          <div className="font-medium">Vật tư<Combobox id="material" options={matOpts} value={f.material} onChange={(v) => setF({ ...f, material: v })} /></div>
          <div className="font-medium">Nơi lấy (mỏ)<Combobox id="mine" options={mineOpts} value={f.mine} required onChange={(v) => setF({ ...f, mine: v })} /></div>
          <div className="font-medium">Nơi đổ (công trình)<Combobox id="site" options={siteOpts} value={f.site} required onChange={(v) => setF({ ...f, site: v })} /></div>
          <label className="font-medium">Số chuyến<input id="count" type="number" min="1" required inputMode="numeric" className={input} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></label>
          <label className="font-medium">KL/chuyến (m³ công trình nhận)<input id="qty" type="number" step="0.1" min="0" required inputMode="decimal" className={input} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
          <label className="font-medium">Lái xe chi (đồng)<input id="advance" inputMode="numeric" placeholder="Tiền lái xe ứng ngoài để chi trong chuyến" className={input}
            value={advanceView} onChange={(e) => setF({ ...f, advance: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="font-medium">Ghi chú<input id="note" className={input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <label className="font-medium sm:col-span-2">m³ mỏ ký sổ mỗi chuyến <span className="font-normal text-slate-700">(tự điền theo xe, để trống thì lấy bằng KL công trình)</span>
            <input id="mineQty" type="number" step="0.1" min="0" inputMode="decimal" className={input} value={f.mineQty} onChange={(e) => setF({ ...f, mineQty: e.target.value })} /></label>
          {f.count && f.qty && <p className="sm:col-span-2">Tổng KL: <b>{(Number(f.count) * Number(f.qty)).toLocaleString("vi-VN")} m³</b></p>}
          <div className="font-medium sm:col-span-2">Ảnh phiếu
            <ScanPhotos shots={shots} onChange={setShots} enhance={enhance} onEnhance={setEnhance} />
          </div>
          <button disabled={saving} className="rounded bg-[var(--brand)] p-3 font-semibold text-white disabled:opacity-60 sm:col-span-2">{saving ? "Đang lưu..." : "Lưu chuyến"}</button>
          {msg && <p className="font-medium sm:col-span-2">{msg}</p>}
        </form>
      </section>
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">20 phiếu vừa nhập</h2>
          <Link href="/summary" className="font-semibold text-[var(--brand)] underline">Xem bảng tổng hợp</Link>
        </div>
        <div className="overflow-x-auto card">
          <table className="w-full text-sm">
            <thead><tr>{["Ngày", "Số phiếu", "Xe", "Nơi lấy", "Nơi đổ", "Chuyến", "Tổng KL", "Lái xe chi"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{trips.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2">{t.trip_date}</td><td className="p-2">{t.site_ticket_no}</td><td className="p-2">{t.vehicles?.plate ?? t.plate_text}</td>
                <td className="p-2">{t.mine?.name}</td><td className="p-2">{t.site?.name}</td>
                <td className="p-2 text-right">{t.trips_count}</td><td className="p-2 text-right">{t.qty_total}</td><td className="p-2 text-right">{fmt(t.driver_advance) || ""}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
