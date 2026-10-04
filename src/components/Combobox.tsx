"use client";
import { useEffect, useRef, useState } from "react";
import { fold } from "@/lib/format";

export type Option = { value: string; label: string; hint?: string };

// Ô chọn: bấm để xổ danh sách, hoặc gõ để tìm (không cần gõ dấu). allowFree cho phép giữ chữ gõ tay không có trong danh sách.
export default function Combobox({ id, options, value, onChange, placeholder, required, allowFree }: {
  id: string; options: Option[]; value: string; placeholder?: string; required?: boolean; allowFree?: boolean;
  onChange: (value: string, text: string) => void;
}) {
  const selected = options.find((o) => o.value === value);
  const [text, setText] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // Khi giá trị được chọn từ bên ngoài (vd tải xong danh sách) thì hiện đúng tên. Muốn xoá trắng thì đổi key của ô.
  const selLabel = selected?.label;
  useEffect(() => { if (selLabel != null) setText(selLabel); }, [value, selLabel]);

  const q = fold(text);
  const list = (selected && selected.label === text ? options : options.filter((o) => fold(o.label + " " + (o.hint ?? "")).includes(q))).slice(0, 100);

  function pick(o: Option) { setText(o.label); onChange(o.value, o.label); setOpen(false); }
  function commit() {
    setOpen(false);
    const exact = options.find((o) => fold(o.label) === q);
    if (exact) pick(exact);
    else if (allowFree) onChange("", text.trim());
    else if (!selected || selected.label !== text) { setText(""); onChange("", ""); }
  }

  return (
    <div ref={box} className="relative" onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) commit(); }}>
      <div className="flex">
        <input id={id} value={text} placeholder={placeholder ?? "Gõ để tìm hoặc bấm ▾"} required={required} autoComplete="off"
          className="w-full rounded-l border p-3"
          onFocus={() => setOpen(true)}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); if (value) onChange("", e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, list.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && open && list[active]) { e.preventDefault(); pick(list[active]); }
            if (e.key === "Escape") setOpen(false);
          }} />
        <button type="button" tabIndex={-1} aria-label="Xổ danh sách" className="rounded-r border border-l-0 bg-slate-100 px-3"
          onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}>▾</button>
      </div>
      {open && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border bg-white shadow-lg">
          {list.length === 0 && <li className="p-3 text-slate-700">{allowFree ? "Không có trong danh sách, sẽ lưu đúng chữ đã gõ" : "Không tìm thấy"}</li>}
          {list.map((o, i) => (
            <li key={o.value} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}
              className={`cursor-pointer p-3 ${i === active ? "bg-amber-100" : ""} ${o.value === value ? "font-semibold" : ""}`}>
              {o.label}{o.hint && <span className="ml-2 text-sm text-slate-700">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
