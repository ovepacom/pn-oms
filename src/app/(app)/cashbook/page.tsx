"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { fmt, fold, localDate, monthStart } from "@/lib/format";
import { fetchAll } from "@/lib/trips";
import { downloadCsv } from "@/lib/csv";
import Combobox from "@/components/Combobox";
import Modal from "@/components/Modal";
import AuditHistory from "@/components/AuditHistory";
import { DateRange, ExportButton, PageTitle, Totals, inputCls } from "@/components/PageBits";
import { Setup } from "../../login/page";

type Pay = {
  id: number; paid_at: string; direction: "in" | "out"; kind: string; amount: number; category: string | null; method: string | null; ref_no: string | null; note: string | null;
  partner_id: number | null; vehicle_id: number | null; partners: { name: string; type: string } | null; vehicles: { plate: string } | null;
};
type Partner = { id: number; name: string; type: string };
type Form = { date: string; dir: "in" | "out"; amount: string; category: string; partner: string; vehicle: string; method: string; ref: string; note: string; prepay: boolean };

const presets = {
  out: ["Ứng trước cho mỏ", "Thanh toán tiền mỏ", "Trả cước xe thuê ngoài", "Hoàn tiền lái xe chi", "Dầu", "Sửa chữa", "Lương", "Chi khác"],
  in: ["Công trình ứng trước", "Công trình thanh toán", "Thu khác"],
};
const blank = (): Form => ({ date: localDate(), dir: "out", amount: "", category: "", partner: "", vehicle: "", method: "Tiền mặt", ref: "", note: "", prepay: false });
const toForm = (p: Pay): Form => ({
  date: p.paid_at, dir: p.direction, amount: String(p.amount), category: p.category ?? "", partner: p.partner_id ? String(p.partner_id) : "", vehicle: p.vehicle_id ? String(p.vehicle_id) : "",
  method: p.method ?? "", ref: p.ref_no ?? "", note: p.note ?? "", prepay: p.kind === "prepay",
});

// Ô nhập một khoản thu/chi (dùng cho cả nhập mới và sửa)
function CashForm({ init, partners, vehicles, categories, onSubmit, onCancel, saving }: {
  init: Form; partners: Partner[]; vehicles: { id: number; plate: string }[]; categories: string[]; saving: boolean;
  onSubmit: (f: Form) => void; onCancel?: () => void;
}) {
  const [f, setF] = useState(init);
  const cats = [...new Set([...presets[f.dir], ...categories])].map((c) => ({ value: c, label: c }));
  const amountView = f.amount ? Number(f.amount).toLocaleString("vi-VN") : "";
  const partner = partners.find((p) => String(p.id) === f.partner);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(f); }} className="grid gap-3 sm:grid-cols-3">
      <div className="font-medium sm:col-span-3">
        <div className="flex max-w-xs rounded-lg border border-[var(--line)] p-1">
          {(["out", "in"] as const).map((d) => (
            <button key={d} type="button" onClick={() => setF({ ...f, dir: d, category: "" })}
              className={`flex-1 rounded-md p-2 font-semibold ${f.dir === d ? (d === "in" ? "bg-[var(--good)] text-white" : "bg-[var(--bad)] text-white") : ""}`}>{d === "in" ? "Thu" : "Chi"}</button>))}
        </div>
      </div>
      <label className="font-medium">Ngày<input type="date" required className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
      <label className="font-medium">Số tiền (đồng)<input required inputMode="numeric" className={inputCls} value={amountView} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} /></label>
      <div className="font-medium">Khoản mục<Combobox id="ccat" options={cats} value={cats.some((c) => c.value === f.category) ? f.category : ""} allowFree required
        onChange={(v, t) => setF({ ...f, category: v || t, prepay: fold(v || t).includes("ung truoc") ? true : f.prepay })} /></div>
      <div className="font-medium">Mỏ / công trình (nếu có)<Combobox id="cpartner" value={f.partner} onChange={(v) => setF({ ...f, partner: v })}
        options={[{ value: "", label: "Không" }, ...partners.map((p) => ({ value: String(p.id), label: p.name, hint: p.type === "mine" ? "Mỏ" : p.type === "site" ? "Công trình" : "Đơn vị xe" }))]} /></div>
      <div className="font-medium">Xe (nếu có)<Combobox id="cvehicle" value={f.vehicle} onChange={(v) => setF({ ...f, vehicle: v })}
        options={[{ value: "", label: "Không" }, ...vehicles.map((v) => ({ value: String(v.id), label: v.plate }))]} /></div>
      <div className="font-medium">Hình thức<Combobox id="cmethod" value={f.method} allowFree onChange={(v, t) => setF({ ...f, method: v || t })}
        options={["Tiền mặt", "Chuyển khoản"].map((x) => ({ value: x, label: x }))} /></div>
      <label className="font-medium">Số chứng từ<input className={inputCls} value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></label>
      <label className="font-medium sm:col-span-2">Nội dung<input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      {partner && partner.type !== "vendor" && (
        <label className="flex items-center gap-2 sm:col-span-3">
          <input type="checkbox" className="h-5 w-5" checked={f.prepay} onChange={(e) => setF({ ...f, prepay: e.target.checked })} />
          Là tiền ứng trước theo hợp đồng (cộng vào hạn mức của {partner.name})
        </label>
      )}
      <div className="flex gap-2 sm:col-span-3">
        {onCancel && <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--line)] p-3 font-semibold">Huỷ</button>}
        <button disabled={saving} className="flex-1 rounded-lg bg-[var(--brand)] p-3 font-semibold text-white disabled:opacity-60">{saving ? "Đang lưu..." : onCancel ? "Lưu thay đổi" : "Lưu khoản " + (f.dir === "in" ? "thu" : "chi")}</button>
      </div>
    </form>
  );
}

// Sổ quỹ: các khoản thu chi hằng ngày. Khoản có chọn mỏ / công trình sẽ vào công nợ của bên đó.
export default function CashBook() {
  const sb = useMemo(() => (supabaseReady ? createClient() : null), []);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(localDate());
  const [rows, setRows] = useState<Pay[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [vehicles, setVehicles] = useState<{ id: number; plate: string }[]>([]);
  const [formKey, setFormKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState<Pay | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    if (!sb) return;
    setRows(await fetchAll<Pay>((a, b) => sb.from("payments").select("id,paid_at,direction,kind,amount,category,method,ref_no,note,partner_id,vehicle_id,partners(name,type),vehicles(plate)")
      .gte("paid_at", from).lte("paid_at", to).order("paid_at", { ascending: false }).order("id", { ascending: false }).range(a, b)));
  }, [sb, from, to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!sb) return;
    sb.from("partners").select("id,name,type").eq("active", true).order("name").then(({ data }) => setPartners((data as Partner[]) ?? []));
    sb.from("vehicles").select("id,plate").eq("active", true).order("plate").then(({ data }) => setVehicles(data ?? []));
  }, [sb]);

  async function contractFor(partnerId: number, dir: "in" | "out", date: string) {
    const { data } = await sb!.from("contracts").select("id").eq("partner_id", partnerId).eq("direction", dir === "out" ? "buy" : "sell").eq("status", "active")
      .or(`end_date.is.null,end_date.gte.${date}`).order("id", { ascending: false }).limit(1);
    return (data?.[0]?.id ?? null) as number | null;
  }
  async function save(f: Form, id?: number) {
    if (!Number(f.amount)) { setMsg("Chưa nhập số tiền."); return; }
    setSaving(true); setMsg("");
    const partnerId = f.partner ? Number(f.partner) : null;
    const prepay = !!partnerId && f.prepay;
    const row = {
      paid_at: f.date, direction: f.dir, amount: Number(f.amount), category: f.category || null, partner_id: partnerId, vehicle_id: f.vehicle ? Number(f.vehicle) : null,
      method: f.method || null, ref_no: f.ref || null, note: f.note || null,
      kind: prepay ? "prepay" : partnerId ? "settle" : "other", contract_id: prepay ? await contractFor(partnerId!, f.dir, f.date) : null,
    };
    const { data: u } = await sb!.auth.getUser();
    const { error } = id ? await sb!.from("payments").update(row).eq("id", id) : await sb!.from("payments").insert({ ...row, created_by: u.user?.id ?? null });
    setSaving(false);
    if (error) { setMsg("Lỗi: " + error.message); return; }
    if (prepay && !row.contract_id) setMsg("Đã lưu. Lưu ý: bên này chưa có hợp đồng đang hiệu lực nên khoản ứng trước chưa cộng vào hạn mức.");
    else setMsg("Đã lưu.");
    if (id) setEdit(null); else setFormKey((k) => k + 1);
    load();
  }
  async function remove(p: Pay) {
    if (!confirm(`Xoá khoản ${p.direction === "in" ? "thu" : "chi"} ${fmt(p.amount)} ngày ${p.paid_at}?`)) return;
    await sb!.from("payments").delete().eq("id", p.id); setEdit(null); load();
  }

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean) as string[])], [rows]);
  const view = rows.filter((r) => !q || fold([r.category, r.note, r.partners?.name, r.vehicles?.plate, r.ref_no].join(" ")).includes(fold(q)));
  const tin = view.filter((r) => r.direction === "in").reduce((s, r) => s + Number(r.amount), 0);
  const tout = view.filter((r) => r.direction === "out").reduce((s, r) => s + Number(r.amount), 0);
  const header = ["Ngày", "Thu", "Chi", "Khoản mục", "Mỏ / công trình", "Xe", "Hình thức", "Số chứng từ", "Nội dung"];
  if (!supabaseReady) return <Setup />;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Nhập sổ quỹ" sub="Ghi các khoản thu chi. Khoản có chọn mỏ / công trình sẽ tự vào công nợ và báo cáo của bên đó." />
      <div className="card p-4">
        <CashForm key={formKey} init={blank()} partners={partners} vehicles={vehicles} categories={categories} saving={saving} onSubmit={(f) => save(f)} />
        {msg && !edit && <p className="mt-3 font-medium">{msg}</p>}
      </div>
      <div className="grid gap-3 card p-4 sm:grid-cols-4">
        <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
        <label className="font-medium sm:col-span-2">Tìm<input className={inputCls} placeholder="Khoản mục, nội dung, mỏ, công trình, biển số..." value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Totals items={[["Tổng thu", fmt(tin) + " ₫"], ["Tổng chi", fmt(tout) + " ₫"], ["Chênh lệch", fmt(tin - tout) + " ₫"]]} />
        <ExportButton onClick={() => downloadCsv(`so-quy-${from}-${to}`, header, view.map((r) => [r.paid_at, r.direction === "in" ? r.amount : null, r.direction === "out" ? r.amount : null,
          r.category, r.partners?.name, r.vehicles?.plate, r.method, r.ref_no, r.note]))} />
      </div>
      <div className="max-h-[70vh] overflow-auto card">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="sticky top-0"><tr>{header.map((h, i) => <th key={h} className={i === 1 || i === 2 ? "text-right" : ""}>{h}</th>)}<th></th></tr></thead>
          <tbody>{view.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.paid_at}</td>
              <td className="p-2 text-right font-semibold text-[var(--good)]">{r.direction === "in" ? fmt(r.amount) : ""}</td>
              <td className="p-2 text-right font-semibold text-[var(--bad)]">{r.direction === "out" ? fmt(r.amount) : ""}</td>
              <td className="p-2">{r.category}{r.kind === "prepay" && <span className="ml-1 rounded bg-[var(--brand-soft)] px-1.5 text-xs text-[var(--brand)]">ứng trước</span>}</td>
              <td className="p-2">{r.partners?.name}</td><td className="p-2">{r.vehicles?.plate}</td><td className="p-2">{r.method}</td><td className="p-2">{r.ref_no}</td>
              <td className="max-w-xs truncate p-2">{r.note}</td>
              <td className="p-2"><button className="text-[var(--brand)] underline" onClick={() => { setMsg(""); setEdit(r); }}>Sửa</button></td>
            </tr>))}</tbody>
        </table>
        {view.length === 0 && <p className="p-4 text-slate-700">Chưa có khoản nào trong khoảng này.</p>}
      </div>
      {edit && (
        <Modal title="Sửa khoản thu chi" onClose={() => setEdit(null)} wide>
          <CashForm init={toForm(edit)} partners={partners} vehicles={vehicles} categories={categories} saving={saving} onSubmit={(f) => save(f, edit.id)} onCancel={() => setEdit(null)} />
          {msg && <p className="mt-3 font-medium">{msg}</p>}
          <button className="mt-3 text-sm font-medium text-[var(--bad)] underline" onClick={() => remove(edit)}>Xoá khoản này</button>
          <h3 className="mb-2 mt-6 font-semibold">Lịch sử sửa</h3>
          <AuditHistory table="payments" recordId={edit.id} />
        </Modal>
      )}
    </div>
  );
}
