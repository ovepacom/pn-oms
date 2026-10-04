"use client";
import { useEffect, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { Setup } from "../login/page";

type Quota = { contract_id: number; code: string | null; direction: string; quota_value: number | null; prepaid: number; used_amount: number };

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default function Dashboard() {
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!supabaseReady) return;
    const sb = createClient();
    sb.from("v_contract_quota").select("*").then(({ data }) => setQuotas((data as Quota[]) ?? []));
    sb.from("trips").select("id", { count: "exact", head: true }).eq("status", "draft")
      .then(({ count }) => setPending(count ?? 0));
  }, []);

  if (!supabaseReady) return <Setup />;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Tổng quan</h1>
      <div className="rounded border bg-white p-4">
        <div className="text-3xl font-bold">{pending}</div>
        <div className="text-slate-600">chuyến đang chờ duyệt</div>
      </div>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Hạn mức hợp đồng</h2>
        {quotas.length === 0 && <p className="text-slate-600">Chưa có hợp đồng. Nhập hợp đồng để theo dõi hạn mức còn lại.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {quotas.map((q) => {
            const limit = (q.quota_value ?? q.prepaid) || 0;
            const pct = limit ? Math.min(100, (q.used_amount / limit) * 100) : 0;
            return (
              <div key={q.contract_id} className="rounded border bg-white p-4">
                <div className="font-semibold">{q.code ?? `HĐ #${q.contract_id}`} ({q.direction === "buy" ? "mua" : "bán"})</div>
                <div className="my-2 h-2 rounded bg-slate-200">
                  <div className={`h-2 rounded ${pct >= 95 ? "bg-red-600" : pct >= 80 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-sm text-slate-600">Đã dùng {fmt(q.used_amount)} / {fmt(limit)} ({pct.toFixed(0)}%)</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
