# PN OMS: bàn giao cho thread code

Người dùng (Thanh, non-tech) làm việc với Claude, nói tiếng Việt, cần giải thích ngắn gọn, chỉ báo khi thực sự cần anh làm.

## Đã có (tại /mnt/project-files/pn-oms, 1 commit local, chưa có GitHub)
- Next.js 16 (đọc node_modules/next/dist/docs trước khi viết code, API khác bản cũ: `proxy.ts` thay `middleware`) + Supabase.
- supabase/schema.sql (bảng, view hạn mức và công nợ, RLS tạm "ai đăng nhập cũng được", bucket ảnh), supabase/seed.sql (79 xe, 23 tuyến cước T9, mỏ, công trình).
- Màn hình: đăng nhập, tổng quan hạn mức, nhập chuyến (+ ảnh phiếu), duyệt chuyến, mỏ/công trình, khối lượng chuẩn theo xe.
- `npm run build` qua. eslint còn 2 lỗi set-state-in-effect (chưa sửa).

## Quy tắc nghiệp vụ đã xác nhận
- Xe: 11 xe CTY; còn lại (UYỂN, TUYẾT, ...) là xe thuê ngoài ngắn hạn.
- Giá cước (bảng Giá cước) là đồng/m3 và tính trên m3 công trình nhận.
- Mỗi xe có khối lượng khác nhau ở mỗi mỏ / công trình (đo 1 lần, bảng vehicle_volumes, nhập chuyến tự gợi ý, sửa được). Tiền mua theo m3 mỏ ký sổ, tiền bán theo m3 công trình nhận.
- Mỏ Kép trong sổ tổng hợp ghi là "PN Đồn 19".
- Công cụ đối soát PowerShell cũ của người dùng vẫn dùng; OMS phải xuất được sổ tổng hợp đúng định dạng T09 (xem memory pn-reconciliation-tool).

## Việc tiếp theo
1. Chờ người dùng tạo repo GitHub `pn-oms` + project Supabase (chưa xong tại thời điểm bàn giao). Gắn repo bằng add_repo, đẩy code, chạy schema.sql rồi seed.sql, deploy Vercel.
2. Màn hình hợp đồng + bảng giá (chưa có, thiếu thì chưa tính được tiền).
3. Thanh toán, công nợ, đối soát theo kỳ, xuất sổ tổng hợp, phân quyền 7 vai trò, báo cáo.
Kế hoạch: bản chạy được để test trước 18/10/2026.

## Cập nhật 2026-10-04 (hosting)
Người dùng muốn host trên PC riêng chạy 24/7 của họ (đã có sẵn, nhiều khả năng Windows, ổ G: là Google Drive). Có thể dùng cả cloud để test song song. Hướng: Docker Desktop (WSL2) chạy Supabase self-host hoặc Postgres + app, Cloudflare Tunnel để truy cập từ ngoài, sao lưu hằng ngày ra Google Drive. Cần hỏi: Windows bản nào, RAM, có UPS, internet nhà/văn phòng. Cài đặt trên máy họ qua phiên Remote Control (start_rc_session), không qua cloud. Chưa cần tài khoản Supabase cloud nếu chọn self-host; vẫn cần GitHub repo để lưu code.
