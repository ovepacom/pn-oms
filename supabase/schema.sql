-- PN OMS: schema v1 (chạy toàn bộ file này trong Supabase > SQL Editor)

create type partner_type as enum ('mine','site','vendor');
create type contract_dir as enum ('buy','sell');
create type vehicle_own as enum ('owned','leased','outsourced');
create type trip_status as enum ('draft','approved','reconciled');
create type pay_dir as enum ('in','out');
create type pay_kind as enum ('prepay','settle','offset');
create type app_role as enum ('admin','director','chief_accountant','accountant','dispatcher','fleet_manager','field');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  role app_role not null default 'field',
  active boolean not null default true
);

create table partners (
  id bigint generated always as identity primary key,
  type partner_type not null,
  name text not null unique,
  short_name text,           -- tên ghi trong sổ tổng hợp (vd 'PN Đồn 19' cho mỏ Kép)
  tax_code text, contact text, phone text, bank_account text,
  active boolean not null default true
);

create table materials (
  id bigint generated always as identity primary key,
  name text not null unique,
  default_unit text not null default 'm3'
);

create table vehicles (
  id bigint generated always as identity primary key,
  plate text not null unique,      -- đầu xe, vd 98H-07646
  trailer text,                    -- mooc, vd 98RM-03441
  ownership vehicle_own not null default 'owned',
  owner_name text,                 -- cột "Nhà" trong DS xe
  vendor_id bigint references partners(id),
  driver_name text,
  lease_monthly numeric,
  inspection_due date, insurance_due date,
  active boolean not null default true
);

create table contracts (
  id bigint generated always as identity primary key,
  partner_id bigint not null references partners(id),
  direction contract_dir not null,
  code text,
  start_date date, end_date date,
  quota_type text check (quota_type in ('amount','volume')),
  quota_value numeric,
  status text not null default 'active',
  file_url text
);

create table contract_prices (
  id bigint generated always as identity primary key,
  contract_id bigint not null references contracts(id) on delete cascade,
  material_id bigint references materials(id),
  unit text not null default 'm3',
  unit_price numeric not null,
  valid_from date not null, valid_to date
);

-- Giá cước theo tuyến (Nơi lấy -> Nơi đổ), theo tháng, từ file "Giá cước - Cập nhật"
-- price = đồng trên mỗi m3 (đã xác nhận). Cước chuyến = qty_total * price
create table freight_rates (
  id bigint generated always as identity primary key,
  from_partner_id bigint not null references partners(id),
  to_partner_id bigint not null references partners(id),
  price numeric not null,
  valid_from date not null, valid_to date
);

-- Khối lượng chuẩn của từng xe tại từng mỏ / công trình (đo 1 lần, nhập chuyến tự gợi ý)
create table vehicle_volumes (
  vehicle_id bigint not null references vehicles(id) on delete cascade,
  partner_id bigint not null references partners(id) on delete cascade,
  volume_m3 numeric not null,
  updated_at timestamptz not null default now(),
  primary key (vehicle_id, partner_id)
);

create table trips (
  id bigint generated always as identity primary key,
  trip_date date not null,
  vehicle_id bigint references vehicles(id),
  plate_text text,                 -- biển ghi tay nếu xe chưa có trong DS
  driver_name text,
  mine_id bigint references partners(id),
  site_id bigint references partners(id),
  buy_contract_id bigint references contracts(id),
  sell_contract_id bigint references contracts(id),
  material_id bigint references materials(id),
  trips_count int not null default 1,
  mine_qty_per_trip numeric not null,  -- m3/chuyến mỏ ký sổ (tính tiền mua)
  qty_per_trip numeric not null,       -- m3/chuyến công trình nhận (tính tiền bán)
  mine_qty_total numeric generated always as (trips_count * mine_qty_per_trip) stored,
  qty_total numeric generated always as (trips_count * qty_per_trip) stored,
  buy_price numeric, sell_price numeric, freight_price numeric,  -- chụp giá tại thời điểm nhập
  mine_ticket_no text, site_ticket_no text,
  driver_advance numeric not null default 0,  -- Lái xe chi: tiền lái xe ứng ngoài để chi trong chuyến
  status trip_status not null default 'draft',
  note text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);
create index on trips (trip_date);
create index on trips (vehicle_id, trip_date);

create table documents (
  id bigint generated always as identity primary key,
  owner_type text not null,        -- trip | contract | payment | recon
  owner_id bigint not null,
  kind text not null,              -- mine_ticket | site_ticket | contract | recon | bank
  file_path text not null,         -- đường dẫn trong Supabase Storage
  uploaded_by uuid references auth.users,
  uploaded_at timestamptz not null default now()
);

create table payments (
  id bigint generated always as identity primary key,
  partner_id bigint not null references partners(id),
  contract_id bigint references contracts(id),
  direction pay_dir not null,
  kind pay_kind not null,
  amount numeric not null,
  paid_at date not null,
  method text, ref_no text, note text,
  created_by uuid references auth.users
);

create table recon_periods (
  id bigint generated always as identity primary key,
  contract_id bigint not null references contracts(id),
  period_start date not null, period_end date not null,
  close_reason text check (close_reason in ('month_end','quota_reached','manual')),
  status text not null default 'open' check (status in ('open','sent','signed','locked')),
  signed_file_path text
);

create table vehicle_expenses (
  id bigint generated always as identity primary key,
  vehicle_id bigint not null references vehicles(id),
  category text not null,          -- fuel | repair | tire | salary | toll | lease | other
  amount numeric not null,
  spent_at date not null, note text
);

create table audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid, table_name text, record_id bigint, action text,
  before jsonb, after jsonb, at timestamptz not null default now()
);

-- Hạn mức còn lại theo hợp đồng
create view v_contract_quota as
select c.id as contract_id, c.partner_id, c.direction, c.code, c.quota_type, c.quota_value,
  coalesce((select sum(amount) from payments p where p.contract_id=c.id and p.kind='prepay'),0) as prepaid,
  coalesce(sum(case when c.direction='buy'  then t.mine_qty_total * coalesce(t.buy_price,0)
                    when c.direction='sell' then t.qty_total * coalesce(t.sell_price,0) end),0) as used_amount,
  coalesce(sum(case when c.direction='buy' then t.mine_qty_total else t.qty_total end),0) as used_volume
from contracts c
left join trips t on (t.buy_contract_id=c.id or t.sell_contract_id=c.id) and t.status <> 'draft'
group by c.id;

-- Công nợ theo đối tác (mua: ta nợ mỏ; bán: công trình nợ ta)
create view v_partner_balance as
select p.id as partner_id, p.name, p.type,
  coalesce(sum(case when t.mine_id=p.id then t.mine_qty_total*coalesce(t.buy_price,0) end),0) as bought,
  coalesce(sum(case when t.site_id=p.id then t.qty_total*coalesce(t.sell_price,0) end),0) as sold,
  (select coalesce(sum(amount),0) from payments x where x.partner_id=p.id and x.direction='out') as paid_out,
  (select coalesce(sum(amount),0) from payments x where x.partner_id=p.id and x.direction='in') as paid_in
from partners p
left join trips t on (t.mine_id=p.id or t.site_id=p.id) and t.status <> 'draft'
group by p.id;

-- Bảo mật: chỉ người đã đăng nhập mới đọc/ghi (phân quyền chi tiết theo vai trò làm ở tuần 2)
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table %I enable row level security', r.tablename);
    execute format('create policy "auth all" on %I for all to authenticated using (true) with check (true)', r.tablename);
  end loop; end $$;

-- Tự tạo profile khi có người dùng mới
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email)); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Kho lưu ảnh phiếu / chứng từ
insert into storage.buckets (id, name, public) values ('documents','documents',false) on conflict do nothing;
create policy "auth read docs" on storage.objects for select to authenticated using (bucket_id='documents');
create policy "auth upload docs" on storage.objects for insert to authenticated with check (bucket_id='documents');
