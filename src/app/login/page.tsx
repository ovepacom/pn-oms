"use client";
import { useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) setError("Email hoặc mật khẩu chưa đúng.");
    else window.location.href = "/";
  }

  if (!supabaseReady) return <Setup />;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <div className="card flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--sidebar-bg)] text-lg font-bold text-white">PN</span>
        <span><span className="block text-xl font-semibold">PN OMS</span><span className="block text-xs tracking-wide text-slate-500">VẬN HÀNH LOGISTICS</span></span>
      </div>
      <p className="text-slate-700">Đăng nhập để quản lý chuyến xe, hạn mức và công nợ.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input id="email" type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-[var(--line)] p-3" />
        <input id="password" type="password" required placeholder="Mật khẩu" value={password}
          onChange={(e) => setPassword(e.target.value)} className="rounded-lg border border-[var(--line)] p-3" />
        {error && <p className="text-red-600">{error}</p>}
        <button className="rounded-lg bg-[var(--brand)] p-3 font-semibold text-white">Đăng nhập</button>
      </form>
      </div>
    </main>
  );
}

export function Setup() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-2 text-xl font-bold">Chưa kết nối database</h1>
      <p>Cần điền 2 biến NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY (xem file .env.local.example).</p>
    </main>
  );
}
