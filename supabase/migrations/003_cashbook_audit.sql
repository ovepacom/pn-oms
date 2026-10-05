-- Feedback v1.0: sổ quỹ (dùng bảng payments) + nhật ký sửa tự động.
-- Chạy lại nhiều lần không sao (script cập nhật chạy mọi file migration mỗi lần).

-- Sổ quỹ: mỗi khoản thu/chi là 1 dòng payments. Không bắt buộc gắn mỏ/công trình.
alter type pay_kind add value if not exists 'other';
alter table payments alter column partner_id drop not null;
alter table payments add column if not exists category text;
alter table payments add column if not exists vehicle_id bigint references vehicles(id);
alter table payments add column if not exists created_at timestamptz not null default now();

-- Nhật ký sửa: ghi ai thêm/sửa/xoá, trước và sau
create or replace function log_change() returns trigger language plpgsql security definer set search_path = public as $$
declare b jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        a jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and b = a then return new; end if;
  insert into audit_logs(user_id, table_name, record_id, action, before, after)
  values (auth.uid(), tg_table_name, nullif(coalesce(a, b)->>'id', '')::bigint, lower(tg_op), b, a);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['trips','vehicle_volumes','payments','vehicles','partners','materials'] loop
    execute format('drop trigger if exists audit_%1$s on %1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on %1$I for each row execute function log_change()', t);
  end loop; end $$;

-- Nhật ký chỉ được đọc, không ai sửa hay xoá được từ app
drop policy if exists "auth all" on audit_logs;
drop policy if exists "auth read" on audit_logs;
create policy "auth read" on audit_logs for select to authenticated using (true);
create index if not exists audit_logs_record on audit_logs (table_name, record_id);
