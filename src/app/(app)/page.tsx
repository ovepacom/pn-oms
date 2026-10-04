"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { fmt, fmtNum, localDate, monthStart } from "@/lib/format";
import { Setup } from "../login/page";

type Quota = { contract_id: number; partner_id: number; code: string | null; direction: "buy" | "sell"; quota_value: number | null; prepaid: number; used_amount: number };
type TripRow = { vehicle_id: number | null; plate_text: string | null; trips_count: number; qty_total: number; vehicles: { plate: string; driver_name: string | null; owner_name: string | null } | null };
type VehStat = { plate: string; who: string; trips: number; qty: number };

export default function Dashboard() {
  const [stats, setStats] = useState<VehStat[]>([]);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [names, setNames] = useState<Record<number, string>>({});
  const [pending, setPending] = useState(0);
  const from = monthStart(), to = localDate();

  useEffect(() => {
    if (!supabaseReady) return;
    const sb = createClient();
    // Tổng số chuyến theo xe từ ngày 1 đầu tháng đến hôm nay
    sb.from("trips").select("vehicle_id,plate_text,trips_count,qty_total,vehicles(plate,driver_name,owner_name)").gte("trip_date", from).lte("trip_date", to).limit(10000)
      .then(({ data }) => {
        const m = new Map<string, VehStat>();
        for (const t of (data as unknown as TripRow[]) ?? []) {
          const plate = t.vehicles?.plate ?? t.plate_text ?? "?";
          const s = m.get(plate) ?? { plate, who: t.vehicles ? [t.vehicles.driver_name, t.vehicles.owner_name !== "CTY" ? t.vehicles.owner_name : null].filter(Boolean).join(" · ") : "Xe ngoài DS", trips: 0, qty: 0 };
          s.trips += t.trips_count; s.qty += Number(t.qty_total); m.set(plate, s);
        }
        setStats([...m.values()].sort((a, b) => b.trips - a.trips || b.qty - a.qty));
      });
    sb.from("v_contract_quota").select("*").then(({ data }) => setQuotas((data as Quota[]) ?? []));
    sb.from("partners").select("id,name").then(({ data }) => setNames(Object.fromEntries((data ?? []).map((p) => [p.id, p.name]))));
    sb.from("trips").select("id", { count: "exact", head: true }).eq("status", "draft").then(({ count }) => setPending(count ?? 0));
  }, [from, to]);

  if (!supabaseReady) return <Setup />;
  const total = stats.reduce((s, x) => s + x.trips, 0);
  const [d1, m1] = [from.slice(8), from.slice(5, 7)], d2 = to.slice(8);

  const quotaCol = (dir: "buy" | "sell", title: string) => {
    const list = quotas.filter((q) => q.direction === dir);
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-bold">{title}</h3>
        {list.length === 0 && <p className="rounded border bg-white p-4 text-slate-700">Chưa có hợp đồng.</p>}
        {list.map((q) => {
          const limit = Number(q.quota_value ?? q.prepaid) || 0;
          const used = Number(q.used_amount);
          const pct = limit ? (used / limit) * 100 : 0;
          const color = pct > 100 ? "text-red-700" : pct >= 80 ? "text-amber-700" : "text-slate-900";
          const bar = pct > 100 ? "bg-red-600" : pct >= 80 ? "bg-amber-500" : "bg-emerald-600";
          return (
            <div key={q.contract_id} className="rounded border bg-white p-4">
              <div className="font-semibold">{names[q.partner_id] ?? ""}{q.code ? ` · ${q.code}` : ""}</div>
              <div className="my-2 h-2 rounded bg-slate-200"><div className={`h-2 rounded ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>Hạn mức<div className="text-base font-bold">{fmt(limit)}</div></div>
                <div>Đã dùng<div className={`text-base font-bold ${color}`}>{fmt(used)}</div></div>
                <div>Còn lại<div className={`text-base font-bold ${color}`}>{fmt(limit - used)}</div></div>
              </div>
              {pct > 100 && <div className="mt-1 font-semibold text-red-700">Vượt hạn mức {fmt(used - limit)}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Tổng quan</h1>
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Số chuyến theo xe, {d1}/{m1} đến {d2}/{m1}</h2>
          {pending > 0 && <Link href="/summary" className="font-semibold text-amber-700 underline">{pending} phiếu chờ duyệt</Link>}
        </div>
        <div className="max-h-[60vh] overflow-auto rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="sticky top-0"><tr><th className="w-10">#</th><th>Biển số</th><th>Lái xe / Nhà</th><th className="text-right">Số chuyến</th><th className="text-right">Tổng KL (m³)</th></tr></thead>
            <tbody>
              {stats.map((s, i) => (
                <tr key={s.plate} className="border-t">
                  <td className="p-2">{i + 1}</td><td className="p-2 font-semibold">{s.plate}</td><td className="p-2">{s.who}</td>
                  <td className="p-2 text-right font-bold">{s.trips}</td><td className="p-2 text-right">{fmtNum(s.qty)}</td>
                </tr>
              ))}
              {stats.length > 0 && <tr className="border-t-2 font-bold"><td className="p-2" colSpan={3}>Cộng {stats.length} xe</td><td className="p-2 text-right">{total}</td><td className="p-2 text-right">{fmtNum(stats.reduce((s, x) => s + x.qty, 0))}</td></tr>}
            </tbody>
          </table>
          {stats.length === 0 && <p className="p-4 text-slate-700">Tháng này chưa có chuyến nào.</p>}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-bold">Hạn mức hợp đồng</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {quotaCol("buy", "Mỏ (mua vào)")}
          {quotaCol("sell", "Công trình (bán ra)")}
        </div>
      </section>
    </div>
  );
}
