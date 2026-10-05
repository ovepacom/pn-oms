"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import Combobox from "@/components/Combobox";
import Modal from "@/components/Modal";
import AuditHistory from "@/components/AuditHistory";
import { fold } from "@/lib/format";
import { Setup } from "../../login/page";

type Opt = { id: number; name: string };
type Veh = { id: number; plate: string; driver_name: string | null };
type Vol = { vehicle_id: number; partner_id: number; volume_m3: number; updated_at: string };

// Bảng khối lượng chuẩn: mỗi xe đo 1 lần cho từng mỏ / công trình, nhập chuyến sẽ tự gợi ý.
export default function Volumes() {
  const [partners, setPartners] = useState<(Opt & { type: string })[]>([]);
  const [vehicles, setVehicles] = useState<Veh[]>([]);
  const [vols, setVols] = useState<Vol[]>([]);
  const [vehicle, setVehicle] = useState("");
  const [partner, setPartner] = useState("");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Vol | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = useCallback(async () => {
    const sb = createClient();
    const [p, v, x] = await Promise.all([
      sb.from("partners").select("id,name,type").in("type", ["mine", "site"]).order("type").order("name"),
      sb.from("vehicles").select("id,plate,driver_name").order("plate"),
      sb.from("vehicle_volumes").select("vehicle_id,partner_id,volume_m3,updated_at").order("updated_at", { ascending: false }),
    ]);
    setPartners((p.data as never) ?? []); setVehicles((v.data as Veh[]) ?? []); setVols((x.data as Vol[]) ?? []);
  }, []);
  useEffect(() => { if (supabaseReady) load(); }, [load]);

  async function upsert(vehicleId: number, partnerId: number, m3: number) {
    const { error } = await createClient().from("vehicle_volumes").upsert({ vehicle_id: vehicleId, partner_id: partnerId, volume_m3: m3, updated_at: new Date().toISOString() });
    return error;
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicle || !partner) { setMsg("Chọn xe và mỏ / công trình có trong danh sách."); return; }
    const err = await upsert(Number(vehicle), Number(partner), Number(value));
    setMsg(err ? "Lỗi: " + err.message : "Đã lưu."); setValue(""); load();
  }
  async function saveEdit() {
    if (!edit) return;
    const err = await upsert(edit.vehicle_id, edit.partner_id, Number(editValue));
    if (err) { alert("Lỗi: " + err.message); return; }
    setEdit(null); load();
  }

  if (!supabaseReady) return <Setup />;
  const plate = (id: number) => vehicles.find((v) => v.id === id)?.plate ?? String(id);
  const pname = (id: number) => partners.find((p) => p.id === id)?.name ?? String(id);
  const input = "rounded-lg border border-[var(--line)] p-3";
  const view = vols.filter((v) => !q || fold(plate(v.vehicle_id) + " " + pname(v.partner_id)).includes(fold(q)));
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Nhập khối lượng</h1>
      <p className="text-slate-700">Mỗi xe có thùng khác nhau nên số m³ ở mỗi mỏ và công trình khác nhau. Nhập một lần ở đây, lúc nhập phiếu app sẽ tự điền.</p>
      <form onSubmit={save} className="flex flex-wrap gap-2 card p-4">
        <div className="min-w-56 flex-1"><Combobox id="vvehicle" required placeholder="Xe: gõ biển số" value={vehicle} onChange={(v) => setVehicle(v)}
          options={vehicles.map((v) => ({ value: String(v.id), label: v.plate, hint: v.driver_name ?? undefined }))} /></div>
        <div className="min-w-56 flex-1"><Combobox id="vpartner" required placeholder="Mỏ / công trình" value={partner} onChange={(v) => setPartner(v)}
          options={partners.map((p) => ({ value: String(p.id), label: p.name, hint: p.type === "mine" ? "Mỏ" : "Công trình" }))} /></div>
        <input id="vvalue" required type="number" step="0.1" placeholder="m³ mỗi chuyến" value={value} onChange={(e) => setValue(e.target.value)} className={input} />
        <button className="rounded-lg bg-[var(--brand)] px-5 font-semibold text-white">Lưu</button>
        {msg && <p className="w-full font-medium">{msg}</p>}
      </form>
      <input className={`${input} max-w-sm`} placeholder="Tìm theo biển số hoặc tên mỏ / công trình" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-x-auto card">
        <table className="w-full text-sm">
          <thead><tr><th>Xe</th><th>Mỏ / công trình</th><th className="text-right">m³ mỗi chuyến</th><th>Cập nhật</th><th></th></tr></thead>
          <tbody>{view.map((v) => (
            <tr key={`${v.vehicle_id}-${v.partner_id}`} className="border-t">
              <td className="p-2">{plate(v.vehicle_id)}</td><td className="p-2">{pname(v.partner_id)}</td><td className="p-2 text-right">{v.volume_m3}</td>
              <td className="p-2 text-slate-500">{v.updated_at ? new Date(v.updated_at).toLocaleDateString("vi-VN") : ""}</td>
              <td className="p-2 text-right"><button className="font-medium text-[var(--brand)] underline" onClick={() => { setEdit(v); setEditValue(String(v.volume_m3)); }}>Sửa</button></td>
            </tr>))}</tbody>
        </table>
        {view.length === 0 && <p className="p-3 text-slate-700">Chưa có số liệu.</p>}
      </div>
      {edit && (
        <Modal title={`Sửa khối lượng: ${plate(edit.vehicle_id)} tại ${pname(edit.partner_id)}`} onClose={() => setEdit(null)}>
          <label className="font-medium">m³ mỗi chuyến<input type="number" step="0.1" autoFocus className={`${input} w-full`} value={editValue} onChange={(e) => setEditValue(e.target.value)} /></label>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setEdit(null)} className="flex-1 rounded-lg border border-[var(--line)] p-3 font-semibold">Huỷ</button>
            <button onClick={saveEdit} className="flex-1 rounded-lg bg-[var(--brand)] p-3 font-semibold text-white">Lưu thay đổi</button>
          </div>
          <h3 className="mb-2 mt-6 font-semibold">Lịch sử sửa</h3>
          <AuditHistory table="vehicle_volumes" match={{ vehicle_id: edit.vehicle_id, partner_id: edit.partner_id }} />
        </Modal>
      )}
    </div>
  );
}
