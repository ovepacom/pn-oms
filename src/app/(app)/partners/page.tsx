"use client";
import { useEffect, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import { Setup } from "../../login/page";

type P = { id: number; type: string; name: string; short_name: string | null };
const label: Record<string, string> = { mine: "Mỏ", site: "Công trình", vendor: "Đơn vị xe thuê ngoài" };

export default function Partners() {
  const [rows, setRows] = useState<P[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("mine");
  const load = () => createClient().from("partners").select("id,type,name,short_name").order("type").order("name").then(({ data }) => setRows((data as P[]) ?? []));
  useEffect(() => { if (supabaseReady) load(); }, []);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    await createClient().from("partners").insert({ name, type });
    setName(""); load();
  }
  if (!supabaseReady) return <Setup />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Mỏ & công trình</h1>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <select id="ptype" value={type} onChange={(e) => setType(e.target.value)} className="rounded border p-3">
          {Object.entries(label).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input id="pname" required placeholder="Tên" value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded border p-3" />
        <button className="rounded bg-amber-600 px-4 font-semibold text-white">Thêm</button>
      </form>
      {Object.keys(label).map((k) => (
        <section key={k}>
          <h2 className="mb-1 font-semibold">{label[k]}</h2>
          <ul className="flex flex-wrap gap-2">
            {rows.filter((r) => r.type === k).map((r) => <li key={r.id} className="rounded border bg-white px-3 py-1">{r.name}{r.short_name ? ` (${r.short_name})` : ""}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
