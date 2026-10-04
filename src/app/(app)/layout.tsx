import Link from "next/link";

const links = [
  { href: "/trips", label: "Nhập chuyến" },
  { href: "/summary", label: "Tổng hợp tháng" },
  { href: "/all-trips", label: "Tất cả chuyến" },
  { href: "/volumes", label: "Khối lượng xe" },
  { href: "/partners", label: "Mỏ & công trình" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <nav className="sticky top-0 z-10 -mx-4 flex gap-4 overflow-x-auto border-b bg-white px-4 py-3">
        <Link href="/" className="font-bold text-amber-700">PN OMS</Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap text-slate-800 hover:text-amber-700">
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="pt-6">{children}</div>
    </div>
  );
}
