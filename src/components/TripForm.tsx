"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fold, localDate } from "@/lib/format";
import { tripPrices } from "@/lib/trips";
import Combobox from "./Combobox";
import Modal from "./Modal";
import ScanPhotos, { type Shot } from "./ScanPhotos";

type Opt = { id: number; name: string };
type Veh = { id: number; plate: string; trailer: string | null; driver_name: string | null; owner_name: string | null };
export type TripRecord = {
  id: number; trip_date: string; site_ticket_no: string | null; vehicle_id: number | null; plate_text: string | null; material_id: number | null;
  mine_id: number | null; site_id: number | null; trips_count: number; qty_per_trip: number; mine_qty_per_trip: number; driver_advance: number; note: string | null;
};
export const tripFields = "id,trip_date,site_ticket_no,vehicle_id,plate_text,material_id,mine_id,site_id,trips_count,qty_per_trip,mine_qty_per_trip,driver_advance,note";

type Form = {
  date: string; ticket: string; vehicle: string; plateText: string; material: string; materialText: string; mine: string; mineText: string;
  site: string; siteText: string; count: string; qty: string; mineQty: string; advance: string; note: string;
};
const blank = (): Form => ({ date: localDate(), ticket: "", vehicle: "", plateText: "", material: "", materialText: "", mine: "", mineText: "", site: "", siteText: "", count: "1", qty: "", mineQty: "", advance: "", note: "" });
const fromTrip = (t: TripRecord): Form => ({
  date: t.trip_date, ticket: t.site_ticket_no ?? "", vehicle: t.vehicle_id ? String(t.vehicle_id) : "", plateText: t.vehicle_id ? "" : t.plate_text ?? "",
  material: t.material_id ? String(t.material_id) : "", materialText: "", mine: t.mine_id ? String(t.mine_id) : "", mineText: "", site: t.site_id ? String(t.site_id) : "", siteText: "",
  count: String(t.trips_count), qty: String(t.qty_per_trip), mineQty: String(t.mine_qty_per_trip), advance: t.driver_advance ? String(t.driver_advance) : "", note: t.note ?? "",
});

type NewItem = { kind: "vehicle" | "mine" | "site" | "material"; text: string };
const kindLabel = { vehicle: "Xe mới", mine: "Mỏ mới", site: "Công trình mới", material: "Vật tư mới" };
const ownLabel = { outsourced: "Xe thuê ngoài", owned: "Xe công ty", leased: "Xe thuê dài hạn" };

// Form phiếu bán cho công trình, dùng cho cả nhập mới và sửa phiếu đã nhập
export default function TripForm({ trip, onSaved, onCancel }: { trip?: TripRecord; onSaved: (msg: string) => void; onCancel?: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const [mines, setMines] = useState<Opt[]>([]);
  const [sites, setSites] = useState<Opt[]>([]);
  const [materials, setMaterials] = useState<Opt[]>([]);
  const [vehicles, setVehicles] = useState<Veh[]>([]);
  const [f, setF] = useState<Form>(() => (trip ? fromTrip(trip) : blank()));
  const [formKey, setFormKey] = useState(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const [enhance, setEnhance] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState<NewItem[] | null>(null);
  const [newVeh, setNewVeh] = useState({ ownership: "outsourced", owner: "" });

  const loadLists = useCallback(async () => {
    const [m, s, mat, v] = await Promise.all([
      sb.from("partners").select("id,name").eq("type", "mine").eq("active", true).order("name"),
      sb.from("partners").select("id,name").eq("type", "site").eq("active", true).order("name"),
      sb.from("materials").select("id,name").order("name"),
      sb.from("vehicles").select("id,plate,trailer,driver_name,owner_name").eq("active", true).order("plate"),
    ]);
    setMines((m.data as Opt[]) ?? []); setSites((s.data as Opt[]) ?? []); setMaterials((mat.data as Opt[]) ?? []); setVehicles((v.data as Veh[]) ?? []);
  }, [sb]);
  useEffect(() => { loadLists(); }, [loadLists]);

  // Vật tư mặc định là Đất (chỉ khi nhập mới)
  useEffect(() => {
    if (!trip && !f.material && !f.materialText && materials.length) setF((cur) => ({ ...cur, material: String(materials.find((x) => x.name === "Đất")?.id ?? materials[0].id) }));
  }, [trip, materials, f.material, f.materialText]);

  // Gợi ý khối lượng chuẩn của xe tại mỏ / công trình đã chọn (vẫn sửa được). Khi sửa phiếu thì giữ số cũ.
  useEffect(() => {
    if (trip || !f.vehicle || (!f.mine && !f.site)) return;
    const ids = [f.mine, f.site].filter(Boolean).map(Number);
    sb.from("vehicle_volumes").select("partner_id,volume_m3").eq("vehicle_id", Number(f.vehicle)).in("partner_id", ids)
      .then(({ data }) => setF((cur) => ({
        ...cur,
        mineQty: String(data?.find((d) => d.partner_id === Number(cur.mine))?.volume_m3 ?? cur.mineQty),
        qty: String(data?.find((d) => d.partner_id === Number(cur.site))?.volume_m3 ?? cur.qty),
      })));
  }, [sb, trip, f.vehicle, f.mine, f.site]);

  const vehOpts = useMemo(() => vehicles.map((v) => ({ value: String(v.id), label: v.plate, hint: [v.driver_name, v.owner_name !== "CTY" ? v.owner_name : null].filter(Boolean).join(" · ") })), [vehicles]);
  const opts = (xs: Opt[]) => xs.map((m) => ({ value: String(m.id), label: m.name }));
  const mineOpts = useMemo(() => opts(mines), [mines]);
  const siteOpts = useMemo(() => opts(sites), [sites]);
  const matOpts = useMemo(() => opts(materials), [materials]);
  const veh = vehicles.find((v) => v.id === Number(f.vehicle));

  // Giá trị gõ tay chưa có trong danh sách thì phải xác nhận trước khi lưu
  function unknowns(): NewItem[] {
    const out: NewItem[] = [];
    if (!f.vehicle && f.plateText.trim()) out.push({ kind: "vehicle", text: f.plateText.trim().toUpperCase() });
    if (!f.mine && f.mineText.trim()) out.push({ kind: "mine", text: f.mineText.trim() });
    if (!f.site && f.siteText.trim()) out.push({ kind: "site", text: f.siteText.trim() });
    if (!f.material && f.materialText.trim()) out.push({ kind: "material", text: f.materialText.trim() });
    return out;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    if (!f.vehicle && !f.plateText.trim()) { setMsg("Chưa chọn xe."); return; }
    if ((!f.mine && !f.mineText.trim()) || (!f.site && !f.siteText.trim())) { setMsg("Chưa chọn nơi lấy hoặc nơi đổ."); return; }
    const news = unknowns();
    if (news.length) { setPending(news); return; }
    save(f);
  }

  // Thêm ngay xe/mỏ/công trình/vật tư mới vào danh mục, rồi lưu phiếu
  async function confirmNew() {
    if (!pending) return;
    setSaving(true);
    const next = { ...f };
    for (const it of pending) {
      let id: number | null = null, err = "";
      if (it.kind === "vehicle") {
        const found = vehicles.find((v) => fold(v.plate) === fold(it.text));
        if (found) id = found.id;
        else {
          const r = await sb.from("vehicles").insert({ plate: it.text, ownership: newVeh.ownership, owner_name: newVeh.owner.trim() || (newVeh.ownership === "outsourced" ? null : "CTY") }).select("id").single();
          id = r.data?.id ?? null; err = r.error?.message ?? "";
        }
        if (id) { next.vehicle = String(id); next.plateText = ""; }
      } else if (it.kind === "material") {
        const r = await sb.from("materials").insert({ name: it.text }).select("id").single();
        id = r.data?.id ?? null; err = r.error?.message ?? "";
        if (id) { next.material = String(id); next.materialText = ""; }
      } else {
        const r = await sb.from("partners").insert({ name: it.text, type: it.kind }).select("id").single();
        id = r.data?.id ?? null; err = r.error?.message ?? "";
        if (id) { if (it.kind === "mine") { next.mine = String(id); next.mineText = ""; } else { next.site = String(id); next.siteText = ""; } }
      }
      if (!id) {
        setSaving(false); setPending(null);
        setMsg(`Không thêm được ${kindLabel[it.kind].toLowerCase()} "${it.text}"` + (err.includes("duplicate") ? ": tên này đã có (có thể đang tạm ngừng dùng), hãy chọn lại trong danh sách." : `: ${err}`));
        return;
      }
    }
    setPending(null); setF(next); await loadLists(); setFormKey((k) => k + 1);
    save(next, pending.map((p) => `${kindLabel[p.kind].toLowerCase()} ${p.text}`));
  }

  async function save(v: Form, added: string[] = []) {
    setSaving(true);
    const mineId = Number(v.mine), siteId = Number(v.site), vehicleId = v.vehicle ? Number(v.vehicle) : null;
    const qty = Number(v.qty), mineQty = v.mineQty ? Number(v.mineQty) : qty;
    const vrow = vehicles.find((x) => x.id === vehicleId);
    const { data: u } = await sb.auth.getUser();
    const repriced = !trip || trip.mine_id !== mineId || trip.site_id !== siteId || trip.trip_date !== v.date;
    const prices = repriced ? await tripPrices(sb, mineId, siteId, v.date) : null;
    const row = {
      trip_date: v.date, vehicle_id: vehicleId, plate_text: vehicleId ? null : v.plateText.toUpperCase(),
      ...(vrow?.driver_name || !trip ? { driver_name: vrow?.driver_name ?? null } : {}),
      material_id: v.material ? Number(v.material) : null, mine_id: mineId, site_id: siteId,
      trips_count: Number(v.count), mine_qty_per_trip: mineQty, qty_per_trip: qty, site_ticket_no: v.ticket || null,
      driver_advance: Number(v.advance.replace(/\D/g, "")) || 0, note: v.note || null, ...(prices ?? {}),
    };
    const res = trip
      ? await sb.from("trips").update(row).eq("id", trip.id).select("id").single()
      : await sb.from("trips").insert({ ...row, created_by: u.user?.id ?? null }).select("id").single();
    if (res.error || !res.data) { setSaving(false); setMsg("Lỗi: " + (res.error?.message ?? "không lưu được")); return; }
    const id = res.data.id as number;
    if (vehicleId) {
      const now = new Date().toISOString();
      await sb.from("vehicle_volumes").upsert([
        { vehicle_id: vehicleId, partner_id: mineId, volume_m3: mineQty, updated_at: now },
        { vehicle_id: vehicleId, partner_id: siteId, volume_m3: qty, updated_at: now },
      ]);
    }
    let failed = 0;
    for (const [i, s] of shots.entries()) {
      const path = `trips/${id}/ticket-${Date.now()}-${i}.jpg`;
      const up = await sb.storage.from("documents").upload(path, s.file, { contentType: s.file.type });
      if (up.error) { failed++; continue; }
      await sb.from("documents").insert({ owner_type: "trip", owner_id: id, kind: "ticket", file_path: path, uploaded_by: u.user?.id ?? null });
    }
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setSaving(false);
    const text = (trip ? "Đã lưu thay đổi" : "Đã lưu chuyến") + (shots.length ? ` kèm ${shots.length - failed} ảnh` : "") + "."
      + (added.length ? ` Đã thêm vào danh mục: ${added.join(", ")}.` : "")
      + (failed ? ` ${failed} ảnh lỗi, thử lại sau.` : "")
      + (prices && prices.sell_price == null ? " Chưa có giá bán cho công trình này nên chưa tính thành tiền." : "");
    if (!trip) { setF({ ...blank(), date: v.date, material: v.material }); setShots([]); setFormKey((k) => k + 1); setMsg(text); }
    onSaved(text);
  }

  const input = "rounded-lg border border-[var(--line)] p-3 w-full";
  const advanceView = f.advance ? Number(f.advance.replace(/\D/g, "")).toLocaleString("vi-VN") : "";
  const freeNote = (picked: boolean, text: string, what: string) => (!picked && text.trim() ? <span className="text-sm font-normal text-[var(--warn)]">Chưa có trong danh sách, khi lưu sẽ hỏi thêm {what} mới</span> : null);
  return (
    <>
      <form key={formKey} onSubmit={submit} className={`grid gap-3 sm:grid-cols-2 ${trip ? "" : "card p-4"}`}>
        <label className="font-medium">Ngày phiếu<input id="date" type="date" required className={input} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="font-medium">Số phiếu<input id="ticket" className={input} value={f.ticket} onChange={(e) => setF({ ...f, ticket: e.target.value })} /></label>
        <div className="font-medium">Biển số đầu
          <Combobox id="vehicle" options={vehOpts} value={f.vehicle} allowFree placeholder="Gõ biển số, vd 07646"
            onChange={(v, t) => setF({ ...f, vehicle: v, plateText: v ? "" : t })} />
          {veh ? <span className="text-sm font-normal text-slate-700">Mooc {veh.trailer ?? "-"} · {veh.driver_name ?? veh.owner_name ?? ""}</span> : freeNote(!!f.vehicle, f.plateText, "xe")}
        </div>
        <div className="font-medium">Vật tư<Combobox id="material" options={matOpts} value={f.material} allowFree onChange={(v, t) => setF({ ...f, material: v, materialText: v ? "" : t })} />{freeNote(!!f.material, f.materialText, "vật tư")}</div>
        <div className="font-medium">Nơi lấy (mỏ)<Combobox id="mine" options={mineOpts} value={f.mine} allowFree required onChange={(v, t) => setF({ ...f, mine: v, mineText: v ? "" : t })} />{freeNote(!!f.mine, f.mineText, "mỏ")}</div>
        <div className="font-medium">Nơi đổ (công trình)<Combobox id="site" options={siteOpts} value={f.site} allowFree required onChange={(v, t) => setF({ ...f, site: v, siteText: v ? "" : t })} />{freeNote(!!f.site, f.siteText, "công trình")}</div>
        <label className="font-medium">Số chuyến<input id="count" type="number" min="1" required inputMode="numeric" className={input} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></label>
        <label className="font-medium">KL/chuyến (m³ công trình nhận)<input id="qty" type="number" step="0.1" min="0" required inputMode="decimal" className={input} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
        <label className="font-medium">Lái xe chi (đồng)<input id="advance" inputMode="numeric" placeholder="Tiền lái xe ứng ngoài để chi trong chuyến" className={input}
          value={advanceView} onChange={(e) => setF({ ...f, advance: e.target.value.replace(/\D/g, "") })} /></label>
        <label className="font-medium">Ghi chú<input id="note" className={input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <label className="font-medium sm:col-span-2">m³ mỏ ký sổ mỗi chuyến <span className="font-normal text-slate-700">(tự điền theo xe, để trống thì lấy bằng KL công trình)</span>
          <input id="mineQty" type="number" step="0.1" min="0" inputMode="decimal" className={input} value={f.mineQty} onChange={(e) => setF({ ...f, mineQty: e.target.value })} /></label>
        {f.count && f.qty && <p className="sm:col-span-2">Tổng KL: <b>{(Number(f.count) * Number(f.qty)).toLocaleString("vi-VN")} m³</b></p>}
        <div className="font-medium sm:col-span-2">{trip ? "Thêm ảnh phiếu" : "Ảnh phiếu"}
          <ScanPhotos shots={shots} onChange={setShots} enhance={enhance} onEnhance={setEnhance} />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          {onCancel && <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--line)] p-3 font-semibold">Huỷ</button>}
          <button disabled={saving} className="flex-1 rounded-lg bg-[var(--brand)] p-3 font-semibold text-white disabled:opacity-60">{saving ? "Đang lưu..." : trip ? "Lưu thay đổi" : "Lưu chuyến"}</button>
        </div>
        {msg && <p className="font-medium sm:col-span-2">{msg}</p>}
      </form>

      {pending && (
        <Modal title="Xác nhận thông tin mới" onClose={() => setPending(null)}>
          <p className="mb-3 text-slate-700">Các giá trị sau chưa có trong danh sách. Nếu đúng là mới, bấm xác nhận để thêm vào danh mục (lần sau sẽ không hỏi lại). Nếu gõ nhầm, bấm Sửa lại.</p>
          <ul className="mb-4 flex flex-col gap-2">
            {pending.map((p) => (
              <li key={p.kind} className="rounded-lg border border-[var(--line)] p-3">
                <span className="text-sm text-slate-500">{kindLabel[p.kind]}</span>
                <div className="text-lg font-semibold">{p.text}</div>
                {p.kind === "vehicle" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="text-sm font-medium">Loại xe
                      <select className={input} value={newVeh.ownership} onChange={(e) => setNewVeh({ ...newVeh, ownership: e.target.value })}>
                        {Object.entries(ownLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select></label>
                    <label className="text-sm font-medium">Chủ xe (Nhà)<input className={input} placeholder="vd UYỂN" value={newVeh.owner} onChange={(e) => setNewVeh({ ...newVeh, owner: e.target.value })} /></label>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPending(null)} className="flex-1 rounded-lg border border-[var(--line)] p-3 font-semibold">Sửa lại</button>
            <button type="button" disabled={saving} onClick={confirmNew} className="flex-1 rounded-lg bg-[var(--brand)] p-3 font-semibold text-white disabled:opacity-60">Xác nhận thêm mới và lưu</button>
          </div>
        </Modal>
      )}
    </>
  );
}
