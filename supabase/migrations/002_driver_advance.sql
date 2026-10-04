-- Lái xe chi: tiền lái xe ứng ngoài để chi trong chuyến (cột "Chi" trong sổ tổng hợp)
alter table trips add column if not exists driver_advance numeric not null default 0;
