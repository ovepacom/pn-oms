"use client";
import { useRef } from "react";

export type Shot = { file: File; url: string };

// Chụp phiếu bằng camera (trên điện thoại) hoặc chọn nhiều ảnh có sẵn.
// "Làm rõ như scan": chuyển ảnh sang trắng đen, tăng tương phản, thu nhỏ còn ~1600px để chữ rõ và file nhẹ.
async function scanify(file: File, enhance: boolean): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0, w, h);
    if (enhance) {
      const img = ctx.getImageData(0, 0, w, h), d = img.data;
      const hist = new Array(256).fill(0);
      for (let i = 0; i < d.length; i += 4) hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
      // Kéo giãn độ sáng: bỏ 2% điểm tối nhất và 2% sáng nhất
      const total = w * h; let lo = 0, hi = 255, acc = 0;
      while (lo < 255 && (acc += hist[lo]) < total * 0.02) lo++;
      acc = 0; while (hi > 0 && (acc += hist[hi]) < total * 0.02) hi--;
      const range = Math.max(1, hi - lo);
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const v = Math.max(0, Math.min(255, ((g - lo) / range) * 255));
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(img, 0, 0);
    }
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.82));
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function ScanPhotos({ shots, onChange, enhance, onEnhance }: {
  shots: Shot[]; onChange: (s: Shot[]) => void; enhance: boolean; onEnhance: (v: boolean) => void;
}) {
  const cam = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const out: Shot[] = [];
    for (const f of Array.from(files)) {
      const s = await scanify(f, enhance);
      out.push({ file: s, url: URL.createObjectURL(s) });
    }
    onChange([...shots, ...out]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => cam.current?.click()} className="rounded bg-slate-800 px-4 py-3 font-semibold text-white">📷 Scan phiếu</button>
        <button type="button" onClick={() => pick.current?.click()} className="rounded border bg-white px-4 py-3 font-semibold">Chọn ảnh có sẵn</button>
        <label className="flex items-center gap-2"><input type="checkbox" checked={enhance} onChange={(e) => onEnhance(e.target.checked)} />Làm rõ như scan</label>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {shots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {shots.map((s, i) => (
            <div key={s.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={`Ảnh ${i + 1}`} className="h-24 w-24 rounded border object-cover" />
              <button type="button" aria-label="Xoá ảnh" onClick={() => { URL.revokeObjectURL(s.url); onChange(shots.filter((x) => x !== s)); }}
                className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-red-600 font-bold text-white">×</button>
            </div>
          ))}
        </div>
      )}
      <p className="text-sm text-slate-700">Bấm Scan phiếu nhiều lần để chụp nhiều ảnh. Đã có {shots.length} ảnh.</p>
    </div>
  );
}
