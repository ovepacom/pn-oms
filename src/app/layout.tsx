import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PN OMS",
  description: "Quản lý vận chuyển, hạn mức và công nợ - Vận tải Phong Nga",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
