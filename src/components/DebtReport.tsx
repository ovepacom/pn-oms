"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { fmt, fmtNum, localDate, monthStart } from "@/lib/format";
import { fetchAll } from "@/lib/trips";
import { downloadCsv } from "@/lib/csv";
import { DateRange, ExportButton, PageTitle, Totals } from "./PageBits";
import { Setup } from "@/app/login/page";

type Trip = { mine_id: number | null; site_id: number | null; trips_count: number; mine_qty_total: number; qty_total: number; buy_price: number | null; sell_price: number | null };
type Pay = { partner_id: number | null; direction: "in" | "out"; amount: number; paid_at: string };
type Bal = { partner_id: number; name: string; type: string; bought: number; sold: number; paid_out: number; paid_in: number };
type Quota = { partner_id: number; direction: string; quota_value: number | null; prepaid: number; used_amount: number };

// Báo cáo công nợ mỏ / công trình: phát sinh trong kỳ và số dư luỹ kế (chỉ tính phiếu đã duyệt)
export default function DebtReport({ side }: { side: "mine" | "site" }) {
  const isMine = side === "mine";
  const sb = useMemo(() => (supabaseReady ? createClient() : null), []);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(localDate());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [bals, setBals] = useState<Bal[]>([]);
  const [quotas, setQuotas] = useState<Quota[]>([]);

  useEffect(() => {
    if (!sb) return;
    sb.from("v_partner_balance").select("*").eq("type", side).then(({ data }) => setBals((data as Bal[]) ?? []));
    sb.from("v_contract_quota").select("partner_id,direction,quota_value,prepaid,used_amount").eq("direction", isMine ? "buy" : "sell").then(({ data }) => setQuotas((data as Quota[]) ?? []));
  }, [sb, side, isMine]);
  useEffect(() => {
    if (!sb) return;
    fetchAll<Trip>((a, b) => sb.from("trips").select("mine_id,site_id,trips_count,mine_qty_total,qty_total,buy_price,sell_price")
      .neq("status", "draft").gte("trip_date", from).lte("trip_date", to).order("id").range(a, b)).then(setTrips);
    fetchAll<Pay>((a, b) => sb.from("payments").select("partner_id,direction,amount,paid_at").not("partner_id", "is", null)
      .gte("paid_at", from).lte("paid_at", to).order("id").range(a, b)).then(setPays);
  }, [sb, from, to]);

  const rows = useMemo(() => bals.map((b) => {
    const t = trips.filter((x) => (isMine ? x.mine_id : x.site_id) === b.partner_id);
    const qty = t.reduce((s, x) => s + (isMine ? x.mine_qty_total : x.qty_total), 0);
    const goods = t.reduce((s, x) => s + (isMine ? x.mine_qty_total * (x.buy_price ?? 0) : x.qty_total * (x.sell_price ?? 0)), 0);
    const paid = pays.filter((p) => p.partner_id === b.partner_id && p.direction === (isMine ? "out" : "in")).reduce((s, p) => s + Number(p.amount), 0);
    const totalGoods = isMine ? b.bought : b.sold, totalPaid = isMine ? b.paid_out : b.paid_in;
    const q = quotas.filter((x) => x.partner_id === b.partner_id && x.quota_value != null);
    const quotaLeft = q.length ? q.reduce((s, x) => s + Number(x.quota_value) - Number(x.used_amount), 0) : null;
    return { id: b.partner_id, name: b.name, trips: t.reduce((s, x) => s + x.trips_count, 0), qty, goods, paid, totalGoods, totalPaid, debt: totalGoods - totalPaid, quotaLeft };
  }).filter((r) => r.trips || r.paid || r.totalGoods || r.totalPaid).sort((a, b) => b.debt - a.debt), [bals, trips, pays, quotas, isMine]);

  const header = [isMine ? "Mỏ" : "Công trình", "Chuyến trong kỳ", "KL trong kỳ (m³)", "Tiền hàng trong kỳ", isMine ? "Đã trả trong kỳ" : "Đã thu trong kỳ",
    "Tổng tiền hàng", isMine ? "Tổng đã trả" : "Tổng đã thu", isMine ? "Còn nợ mỏ" : "Công trình còn nợ", "Hạn mức còn"];
  const sum = (k: "goods" | "paid" | "debt") => rows.reduce((s, r) => s + r[k], 0);
  if (!supabaseReady) return <Setup />;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={isMine ? "Báo cáo mỏ" : "Báo cáo công trình"}
        sub={isMine ? "Tiền mua hàng, đã trả và còn nợ từng mỏ. Số âm nghĩa là đã ứng trước nhiều hơn tiền hàng." : "Tiền bán hàng, đã thu và còn phải thu từng công trình. Số âm nghĩa là công trình đã ứng trước."}>
        <ExportButton onClick={() => downloadCsv(`bao-cao-${isMine ? "mo" : "cong-trinh"}-${from}-${to}`, header,
          rows.map((r) => [r.name, r.trips, r.qty, Math.round(r.goods), r.paid, Math.round(r.totalGoods), r.totalPaid, Math.round(r.debt), r.quotaLeft == null ? null : Math.round(r.quotaLeft)]))} />
      </PageTitle>
      <div className="grid gap-3 card p-4 sm:grid-cols-4"><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /></div>
      <Totals items={[["Tiền hàng trong kỳ", fmt(sum("goods")) + " ₫"], [isMine ? "Đã trả trong kỳ" : "Đã thu trong kỳ", fmt(sum("paid")) + " ₫"], [isMine ? "Tổng còn nợ" : "Tổng còn phải thu", fmt(sum("debt")) + " ₫"]]} />
      <div className="overflow-x-auto card">
        <table className="w-full whitespace-nowrap text-sm">
          <thead><tr>{header.map((h, i) => <th key={h} className={i ? "text-right" : ""}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2 font-medium">{r.name}</td><td className="p-2 text-right">{r.trips.toLocaleString("vi-VN")}</td><td className="p-2 text-right">{fmtNum(r.qty)}</td>
              <td className="p-2 text-right">{fmt(r.goods)}</td><td className="p-2 text-right">{fmt(r.paid)}</td>
              <td className="p-2 text-right">{fmt(r.totalGoods)}</td><td className="p-2 text-right">{fmt(r.totalPaid)}</td>
              <td className={`p-2 text-right font-semibold ${r.debt < 0 ? "text-[var(--good)]" : ""}`}>{fmt(r.debt)}</td>
              <td className={`p-2 text-right font-semibold ${r.quotaLeft != null && r.quotaLeft < 0 ? "text-[var(--bad)]" : ""}`}>{r.quotaLeft == null ? "" : fmt(r.quotaLeft)}</td>
            </tr>))}</tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-slate-700">Chưa có số liệu.</p>}
      </div>
      <p className="text-sm text-slate-500">Chỉ tính phiếu đã duyệt. Tiền đã trả / đã thu lấy từ Sổ quỹ (các khoản có chọn {isMine ? "mỏ" : "công trình"}).</p>
    </div>
  );
}
