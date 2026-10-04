"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { Setup } from "../../login/page";

type Opt = { id: number; name: string };
type Veh = { id: number; plate: string; driver_name: string | null };
type Vol = { vehicle_id: number; partner_id: number; volume_m3: number };

// Bảng khối lượng chuẩn: mỗi xe đo 1 lần cho từng mỏ / công trình, nhập chuyến sẽ tự gợi ý.
export default function Volumes() {
  const [partners, setPartners] = useState<(Opt & { type: string })[]>([]);
  const [vehicles, setVehicles] = useState<Veh[]>([]);
  const [vols, setVols] = useState<Vol[]>([]);
  const [vehicle, setVehicle] = useState("");
  const [partner, setPartner] = useState("");
  const [value, setValue] = useState("");

  const load = useCallback(async () => {
    const sb = createClient();
    const [p, v, x] = await Promise.all([
      sb.from("partners").select("id,name,type").in("type", ["mine", "site"]).order("type").order("name"),
      sb.from("vehicles").select("id,plate,driver_name").order("plate"),
      sb.from("vehicle_volumes").select("vehicle_id,partner_id,volume_m3"),
    ]);
    setPartners((p.data as never) ?? []); setVehicles((v.data as Veh[]) ?? []); setVols((x.data as Vol[]) ?? []);
  }, []);
  useEffect(() => { if (supabaseReady) load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await createClient().from("vehicle_volumes").upsert({
      vehicle_id: Number(vehicle), partner_id: Number(partner), volume_m3: Number(value), updated_at: new Date().toISOString(),
    });
    setValue(""); load();
  }

  if (!supabaseReady) return <Setup />;
  const plate = (id: number) => vehicles.find((v) => v.id === id)?.plate ?? id;
  const pname = (id: number) => partners.find((p) => p.id === id)?.name ?? id;
  const input = "rounded border p-3";
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Khối lượng chuẩn của xe</h1>
      <p className="text-slate-700">Mỗi xe có thùng khác nhau nên số m³ ở mỗi mỏ và công trình khác nhau. Nhập một lần ở đây, lúc nhập chuyến app sẽ tự điền.</p>
      <form onSubmit={save} className="flex flex-wrap gap-2">
        <select id="vvehicle" required value={vehicle} onChange={(e) => setVehicle(e.target.value)} className={input}>
          <option value="">Chọn xe</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} {v.driver_name ?? ""}</option>)}</select>
        <select id="vpartner" required value={partner} onChange={(e) => setPartner(e.target.value)} className={input}>
          <option value="">Chọn mỏ / công trình</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.type === "mine" ? "Mỏ" : "CT"}: {p.name}</option>)}</select>
        <input id="vvalue" required type="number" step="0.1" placeholder="m³ mỗi chuyến" value={value} onChange={(e) => setValue(e.target.value)} className={input} />
        <button className="rounded bg-amber-600 px-4 font-semibold text-white">Lưu</button>
      </form>
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left"><tr><th className="p-2">Xe</th><th className="p-2">Mỏ / công trình</th><th className="p-2">m³ mỗi chuyến</th></tr></thead>
          <tbody>{vols.map((v) => <tr key={`${v.vehicle_id}-${v.partner_id}`} className="border-t"><td className="p-2">{plate(v.vehicle_id)}</td><td className="p-2">{pname(v.partner_id)}</td><td className="p-2">{v.volume_m3}</td></tr>)}</tbody>
        </table>
        {vols.length === 0 && <p className="p-3 text-slate-700">Chưa có số liệu.</p>}
      </div>
    </div>
  );
}
