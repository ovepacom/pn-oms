import { createBrowserClient } from "@supabase/ssr";
import { authCookie } from "./cookie";

export const supabaseReady = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Trình duyệt gọi Supabase qua chính địa chỉ đang mở app (app tự chuyển tiếp), nên dùng được cả trong mạng nội bộ lẫn qua tên miền
export function createClient() {
  const url = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost";
  return createBrowserClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: { name: authCookie } });
}
