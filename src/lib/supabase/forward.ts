import type { NextRequest } from "next/server";

// Chuyển tiếp /rest, /auth, /storage tới Supabase trong máy chủ, để trình duyệt chỉ cần gọi đúng địa chỉ đang mở app
// (vào qua mạng nội bộ hay qua tên miền đều chạy, không cần mở thêm cổng 8000).
const upstream = () => process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "http://kong:8000";
const hop = new Set(["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "content-length", "accept-encoding"]);

export async function forward(req: NextRequest) {
  const target = upstream().replace(/\/$/, "") + req.nextUrl.pathname + req.nextUrl.search;
  const headers = new Headers();
  req.headers.forEach((v, k) => { if (!hop.has(k)) headers.set(k, v); });
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  const res = await fetch(target, { method: req.method, headers, body, redirect: "manual", cache: "no-store" });
  const out = new Headers();
  res.headers.forEach((v, k) => { if (!hop.has(k) && k !== "content-encoding") out.set(k, v); });
  return new Response(req.method === "HEAD" ? null : res.body, { status: res.status, statusText: res.statusText, headers: out });
}
