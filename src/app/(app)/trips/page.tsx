"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { fmt } from "@/lib/format";
import TripForm from "@/components/TripForm";
import TripEditor from "@/components/TripEditor";
import { Setup } from "../../login/page";

type Trip = {
  id: number; trip_date: string; trips_count: number; qty_total: number; driver_advance: number; site_ticket_no: string | null; status: string;
  plate_text: string | null; vehicles: { plate: string } | null; mine: { name: string } | null; site: { name: string } | null;
};

// Nhập phiếu bán cho công trình: mỗi dòng giống một dòng trong sổ tổng hợp (T09)
export default function TripsPage() {
  const sb = useMemo(() => (supabaseReady ? createClient() : null), []);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [editing, setEditing] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from("trips").select("id,trip_date,trips_count,qty_total,driver_advance,site_ticket_no,status,plate_text,vehicles(plate),mine:mine_id(name),site:site_id(name)")
      .order("created_at", { ascending: false }).limit(20);
    setTrips((data as unknown as Trip[]) ?? []);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  if (!supabaseReady) return <Setup />;
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight">Nhập phiếu</h1>
        <TripForm onSaved={load} />
      </section>
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">20 phiếu vừa nhập</h2>
          <Link href="/summary" className="font-semibold text-[var(--brand)] underline">Xem tổng hợp phiếu</Link>
        </div>
        <div className="overflow-x-auto card">
          <table className="w-full text-sm">
            <thead><tr>{["Ngày", "Số phiếu", "Xe", "Nơi lấy", "Nơi đổ", "Chuyến", "Tổng KL", "Lái xe chi", ""].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>{trips.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2">{t.trip_date}</td><td className="p-2">{t.site_ticket_no}</td><td className="p-2">{t.vehicles?.plate ?? t.plate_text}</td>
                <td className="p-2">{t.mine?.name}</td><td className="p-2">{t.site?.name}</td>
                <td className="p-2 text-right">{t.trips_count}</td><td className="p-2 text-right">{t.qty_total}</td><td className="p-2 text-right">{fmt(t.driver_advance) || ""}</td>
                <td className="p-2 text-right">{t.status !== "reconciled" && <button className="font-medium text-[var(--brand)] underline" onClick={() => setEditing(t.id)}>Sửa</button>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>
      {editing != null && <TripEditor id={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}
