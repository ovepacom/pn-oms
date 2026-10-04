// Ngày theo giờ máy (không dùng UTC, tránh lệch ngày buổi sáng)
export const localDate = (d = new Date()) => d.toLocaleDateString("sv-SE");
export const monthStart = (d = new Date()) => localDate(new Date(d.getFullYear(), d.getMonth(), 1));
export const fmt = (n: number | null | undefined) => (n == null ? "" : Math.round(n).toLocaleString("vi-VN"));
export const fmtNum = (n: number | null | undefined) => (n == null ? "" : (Math.round(n * 100) / 100).toLocaleString("vi-VN"));
// Bỏ dấu tiếng Việt để tìm kiếm: "dong coi" khớp "Đông Côi"
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
