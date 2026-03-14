-- Add mileage tracking to work orders (MaxxTraxx-style)
alter table work_orders add column if not exists mileage_in int;
alter table work_orders add column if not exists mileage_out int;
