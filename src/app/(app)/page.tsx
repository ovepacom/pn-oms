"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { fmt, localDate } from "@/lib/format";
import Icon from "@/components/Icon";
import { Setup } from "../login/page";

type Quota = { contract_id: number; partner_id: number; code: string | null; direction: "buy" | "sell"; quota_value: number | null; prepaid: number; used_amount: number };
type TripRow = { trip_date: string; vehicle_id: number | null; plate_text: string | null; trips_count: number; vehicles: { plate: string; driver_name: string | null } | null };
type VehStat = { plate: string; driver: string; trips: number };

const vnDate = (iso: string) => iso.split("-").reverse().join("/");
const monthStartOf = (iso: string) => iso.slice(0, 8) + "01";

export default function Dashboard() {
  const sb = useMemo(() => (supabaseReady ? createClient() : null), []);
  const today = localDate();
  const [day, setDay] = useState(today);
  const [rows, setRows] = useState<TripRow[]>([]);
  const [fleet, setFleet] = useState(0);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [names, setNames] = useState<Record<number, string>>({});
  const [updated, setUpdated] = useState("");

  // Chuyến từ ngày 1 đầu tháng đến ngày xem (lấy từng trang 1000 dòng cho đủ)
  useEffect(() => {
    if (!sb) return;
    (async () => {
      const all: TripRow[] = [];
      for (let page = 0; page < 50; page++) {
        const { data } = await sb.from("trips").select("trip_date,vehicle_id,plate_text,trips_count,vehicles(plate,driver_name)")
          .gte("trip_date", monthStartOf(day)).lte("trip_date", day).order("id").range(page * 1000, page * 1000 + 999);
        all.push(...((data as unknown as TripRow[]) ?? []));
        if (!data || data.length < 1000) break;
      }
      setRows(all);
      setUpdated(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) + " • " + vnDate(localDate()));
    })();
  }, [sb, day]);

  useEffect(() => {
    if (!sb) return;
    sb.from("vehicles").select("id", { count: "exact", head: true }).eq("active", true).then(({ count }) => setFleet(count ?? 0));
    sb.from("v_contract_quota").select("*").then(({ data }) => setQuotas((data as Quota[]) ?? []));
    sb.from("partners").select("id,name").then(({ data }) => setNames(Object.fromEntries((data ?? []).map((p) => [p.id, p.name]))));
  }, [sb]);

  const top = useMemo(() => {
    const m = new Map<string, VehStat>();
    for (const t of rows) {
      const plate = t.vehicles?.plate ?? t.plate_text ?? "?";
      const s = m.get(plate) ?? { plate, driver: t.vehicles?.driver_name ?? (t.vehicles ? "" : "Xe ngoài DS"), trips: 0 };
      s.trips += t.trips_count; m.set(plate, s);
    }
    return [...m.values()].sort((a, b) => b.trips - a.trips);
  }, [rows]);
  const dayRows = rows.filter((r) => r.trip_date === day);
  const tripsDay = dayRows.reduce((s, r) => s + r.trips_count, 0);
  const activeDay = new Set(dayRows.map((r) => r.vehicles?.plate ?? r.plate_text)).size;
  const sells = quotas.filter((q) => q.direction === "sell");
  const left = (q: Quota) => (Number(q.quota_value ?? q.prepaid) || 0) - Number(q.used_amount);
  const max = top[0]?.trips || 1;
  const isToday = day === today;

  if (!supabaseReady) return <Setup />;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tổng quan vận hành</h1>
          <p className="mt-1 text-slate-600">Theo dõi nhanh hiệu suất đầu xe và hạn mức công trình {isToday ? "hôm nay" : `ngày ${vnDate(day)}`}.</p>
        </div>
        {updated && <span className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-slate-600"><span className="h-2 w-2 rounded-full bg-[var(--brand)]" />Cập nhật lúc {updated}</span>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon="route" label={isToday ? "Chuyến hôm nay" : `Chuyến ngày ${vnDate(day)}`} value={tripsDay} note="đã ghi nhận" />
        <Stat icon="truck" label="Đầu xe hoạt động" value={activeDay} note={`trên ${fleet} đầu xe`} />
        <Stat icon="building" label="Công trình theo dõi" value={sells.length} note={`${sells.filter((q) => left(q) >= 0).length} còn hạn mức`} />
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">Top đầu xe <Badge tone="brand">{top.length} đầu xe</Badge></h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><Icon name="calendar" className="h-4 w-4" />Thống kê từ {vnDate(monthStartOf(day))} đến {vnDate(day)}</p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm">
            <Icon name="calendar" className="h-4 w-4 text-[var(--brand)]" />
            <span className="leading-tight"><span className="block text-xs text-slate-500">Ngày xem</span>
              <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="font-medium outline-none" /></span>
          </label>
        </div>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0"><tr><th className="w-16">Hạng</th><th>Biển đầu xe</th><th className="hidden sm:table-cell">Tương quan số chuyến</th><th className="text-right">Tổng chuyến ↓</th></tr></thead>
            <tbody>
              {top.map((s, i) => (
                <tr key={s.plate} className="border-t border-[var(--line)] even:bg-slate-50/60">
                  <td className="px-3 py-2.5"><span className={`inline-grid h-6 w-8 place-items-center rounded-md text-xs font-semibold ${i < 3 ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-slate-500"}`}>{String(i + 1).padStart(2, "0")}</span></td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]"><Icon name="truck" className="h-4 w-4" /></span>
                      <span><span className="block font-medium">{s.plate}</span>{s.driver && <span className="block text-xs text-slate-500">{s.driver}</span>}</span>
                    </span>
                  </td>
                  <td className="hidden w-1/2 px-3 py-2.5 sm:table-cell"><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[var(--brand)]" style={{ width: `${(s.trips / max) * 100}%` }} /></div></td>
                  <td className="px-3 py-2.5 text-right"><span className="text-base font-semibold">{s.trips}</span> <span className="text-xs text-slate-500">chuyến</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {top.length === 0 && <p className="p-5 text-slate-600">Chưa có chuyến nào trong khoảng này.</p>}
        </div>
        <p className="flex items-center gap-1.5 border-t border-[var(--line)] px-5 py-3 text-xs text-slate-500"><Icon name="info" className="h-3.5 w-3.5" />Sắp xếp theo tổng số chuyến từ cao xuống thấp.</p>
      </section>

      <QuotaCard title="Công trình" sub="Số dư hạn mức theo từng công trình • Đơn vị: VND" list={sells} names={names} left={left} />
      <QuotaCard title="Mỏ" sub="Số dư hạn mức theo từng mỏ • Đơn vị: VND" list={quotas.filter((q) => q.direction === "buy")} names={names} left={left} />
    </div>
  );
}

function Stat({ icon, label, value, note }: { icon: string; label: string; value: number; note: string }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]"><Icon name={icon} /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-600">{label}</div>
        <div className="flex items-baseline justify-between gap-2"><span className="text-2xl font-semibold">{value.toLocaleString("vi-VN")}</span><span className="truncate text-xs text-slate-500">{note}</span></div>
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "brand" | "good" | "warn" | "bad"; children: React.ReactNode }) {
  const cls = { brand: "bg-[var(--brand-soft)] text-[var(--brand)]", good: "bg-green-50 text-green-700", warn: "bg-amber-50 text-amber-700", bad: "bg-red-50 text-red-700" }[tone];
  return <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function QuotaCard({ title, sub, list, names, left }: { title: string; sub: string; list: Quota[]; names: Record<number, string>; left: (q: Quota) => number }) {
  const pos = list.filter((q) => left(q) >= 0).length;
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">{title} <Badge tone="brand">{list.length} hiển thị</Badge></h2>
          <p className="mt-1 text-sm text-slate-600">{sub}</p>
        </div>
        <Link href="/partners" className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand-soft)]">Xem tất cả <Icon name="arrowRight" className="h-4 w-4" /></Link>
      </div>
      <table className="w-full text-sm">
        <thead><tr><th>Tên</th><th className="hidden sm:table-cell"></th><th className="text-right">Hạn mức còn</th></tr></thead>
        <tbody>
          {list.map((q) => {
            const limit = Number(q.quota_value ?? q.prepaid) || 0, rest = left(q);
            const near = rest >= 0 && limit > 0 && rest < limit * 0.2;
            const tone = rest < 0 ? "bad" : near ? "warn" : "good";
            return (
              <tr key={q.contract_id} className="border-t border-[var(--line)] even:bg-slate-50/60">
                <td className="px-3 py-3">
                  <span className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]"><Icon name="building" className="h-4 w-4" /></span>
                    <span><span className="block font-semibold">{names[q.partner_id] ?? ""}</span><span className="block text-xs text-slate-500">{q.code ?? `HĐ-${q.contract_id}`} • Hạn mức {fmt(limit)}</span></span>
                  </span>
                </td>
                <td className="hidden px-3 py-3 text-right sm:table-cell"><Badge tone={tone}>{rest < 0 ? "Vượt hạn mức" : near ? "Sắp hết hạn mức" : "Còn hạn mức"}</Badge></td>
                <td className={`px-3 py-3 text-right text-base font-bold ${tone === "bad" ? "text-[var(--bad)]" : tone === "warn" ? "text-[var(--warn)]" : "text-[var(--good)]"}`}>{rest >= 0 ? "+" : "−"}{fmt(Math.abs(rest))} ₫</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.length === 0 && <p className="px-5 py-4 text-slate-600">Chưa có hợp đồng nào. Khi nhập hợp đồng và hạn mức, số dư sẽ hiện ở đây.</p>}
      {list.length > 0 && <p className="flex justify-end gap-4 border-t border-[var(--line)] px-5 py-3 text-xs text-slate-500"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--good)]" />{pos} dương</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--bad)]" />{list.length - pos} âm</span></p>}
    </section>
  );
}
