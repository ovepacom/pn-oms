"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient, supabaseReady } from "@/lib/supabase/client";
import Icon from "./Icon";

type Item = { href: string; label: string; icon: string; also?: string[]; children?: { href: string; label: string }[] };
const groups: { title: string; add?: string; items: Item[] }[] = [
  { title: "Vận hành", add: "/trips", items: [
    { href: "/trips", label: "Nhập phiếu", icon: "clipboard" },
    { href: "/volumes", label: "Nhập khối lượng", icon: "truck" },
    { href: "/summary", label: "Tổng hợp phiếu", icon: "list", also: ["/all-trips"] },
    { href: "/mine-summary", label: "Tổng hợp mỏ", icon: "box" },
    { href: "/site-summary", label: "Tổng hợp từ công trình", icon: "building" },
  ] },
  { title: "Kế toán", items: [
    { href: "/cashbook", label: "Nhập sổ quỹ", icon: "wallet" },
  ] },
  { title: "Quản trị", items: [
    { href: "/reports", label: "Xem báo cáo", icon: "chart", children: [
      { href: "/reports/freight", label: "Cước xe" }, { href: "/reports/mines", label: "Mỏ" }, { href: "/reports/sites", label: "Công trình" },
    ] },
    { href: "/data", label: "DATA", icon: "database", also: ["/partners"] },
  ] },
];

// Khung chung: menu tối bên trái (thu gọn thành nút ☰ trên điện thoại), thanh trên cùng có đường dẫn và người dùng
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string; role: string }>({ name: "", email: "", role: "" });

  useEffect(() => {
    if (!supabaseReady) return;
    const sb = createClient();
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await sb.from("profiles").select("full_name,role").eq("id", data.user.id).maybeSingle();
      const roles: Record<string, string> = { admin: "Quản trị", director: "Giám đốc", chief_accountant: "Kế toán trưởng", accountant: "Kế toán", dispatcher: "Điều phối viên", fleet_manager: "Quản lý đội xe", field: "Nhân viên" };
      setUser({ name: p?.full_name || data.user.email || "", email: data.user.email ?? "", role: roles[p?.role ?? ""] ?? "" });
    });
  }, []);
  useEffect(() => { setOpen(false); }, [path]);

  const [reportsOpen, setReportsOpen] = useState(path.startsWith("/reports"));
  const crumbs = (() => {
    if (path === "/") return ["Tổng quan"];
    for (const g of groups) for (const i of g.items) {
      const c = i.children?.find((x) => x.href === path);
      if (c) return [g.title, i.label, c.label];
      if (i.href === path || i.also?.includes(path)) return [g.title, i.label];
    }
    return ["PN OMS"];
  })();
  const initials = (user.name || "?").split(/[\s@.]+/).filter(Boolean).slice(-2).map((w) => w[0]).join("").toUpperCase();
  async function logout() { await createClient().auth.signOut(); window.location.href = "/login"; }

  return (
    <div className="min-h-screen lg:pl-64">
      {open && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[var(--sidebar-bg)] text-slate-300 transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <Link href="/" className="flex items-center gap-3 px-5 py-6">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--brand)] text-white"><Icon name="route" /></span>
          <span><span className="block text-lg font-semibold leading-tight text-white">PN OMS</span><span className="block text-[11px] tracking-wide text-slate-400">VẬN TẢI PHONG NGA</span></span>
        </Link>
        <nav className="flex-1 overflow-y-auto px-3">
          {groups.map((g) => (
            <div key={g.title} className="mb-5">
              <div className="flex items-center justify-between px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {g.title}
                {g.add && <Link href={g.add} title="Nhập phiếu mới" aria-label="Nhập phiếu mới" className="grid h-6 w-6 place-items-center rounded-md bg-white/10 text-white hover:bg-[var(--brand)]"><Icon name="plus" className="h-4 w-4" /></Link>}
              </div>
              {g.items.map((i) => {
                const active = i.href === path || !!i.also?.includes(path) || (!!i.children && path.startsWith(i.href + "/"));
                const cls = `relative mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] ${active ? "bg-white/10 font-medium text-white" : "hover:bg-white/5 hover:text-white"}`;
                const inner = <>{active && <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-[var(--brand)]" />}<Icon name={i.icon} className="h-[18px] w-[18px]" />{i.label}</>;
                if (!i.children) return <Link key={i.href} href={i.href} className={cls}>{inner}</Link>;
                return (
                  <div key={i.href}>
                    <button type="button" className={cls} onClick={() => setReportsOpen((o) => !o)} aria-expanded={reportsOpen}>
                      {inner}<Icon name={reportsOpen ? "chevronDown" : "chevronRight"} className="ml-auto h-4 w-4" />
                    </button>
                    {reportsOpen && (
                      <div className="mb-1 ml-6 border-l border-white/10 pl-3">
                        {i.children.map((c) => (
                          <Link key={c.href} href={c.href} className={`block rounded-lg px-3 py-2 text-[14px] ${c.href === path ? "bg-white/10 font-medium text-white" : "hover:bg-white/5 hover:text-white"}`}>{c.label}</Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="px-5 py-4 text-center text-xs text-slate-500">PN OMS • Vận tải Phong Nga</div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--line)] bg-white px-4 lg:px-8">
        <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" aria-label="Mở menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
        <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
          {crumbs.slice(0, -1).map((c) => <span key={c} className="hidden items-center gap-2 sm:flex">{c}<Icon name="chevronRight" className="h-4 w-4" /></span>)}
          <span className="truncate font-medium text-slate-900">{crumbs[crumbs.length - 1]}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--brand-soft)] text-sm font-semibold text-[var(--brand)]">{initials}</span>
          <span className="hidden text-sm leading-tight sm:block"><span className="block font-medium text-slate-900">{user.name}</span><span className="block text-slate-500">{user.role}</span></span>
          <button onClick={logout} title="Đăng xuất" aria-label="Đăng xuất" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Icon name="logout" className="h-[18px] w-[18px]" /></button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
