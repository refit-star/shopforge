-- ShopForge: Mechanic Shop Management Schema
-- Run this in Supabase SQL editor to set up a new client

-- Technicians
create table techs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#f97316',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Customers
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

-- Vehicles
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  year int,
  make text not null,
  model text not null,
  vin text,
  mileage int,
  plate text,
  created_at timestamptz not null default now()
);

-- Work Orders
create table work_orders (
  id uuid primary key default gen_random_uuid(),
  display_id text not null unique,
  customer_id uuid not null references customers(id),
  vehicle_id uuid not null references vehicles(id),
  tech_id uuid references techs(id),
  job text not null,
  status text not null default 'Check-In'
    check (status in ('Check-In','In Progress','Waiting on Parts','Ready for Pickup','Completed')),
  priority text not null default 'low'
    check (priority in ('low','medium','high')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Work Order Labor Lines
create table wo_labor_lines (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  description text not null,
  hours numeric(5,2) not null,
  rate numeric(8,2) not null,
  sort_order int not null default 0
);

-- Work Order Parts Lines
create table wo_parts_lines (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  name text not null,
  qty int not null default 1,
  price numeric(8,2) not null,
  sort_order int not null default 0
);

-- Appointments
create table appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  vehicle_id uuid references vehicles(id),
  tech_id uuid references techs(id),
  job text not null,
  start_time timestamptz not null,
  duration_minutes int not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Invoices
create table invoices (
  id uuid primary key default gen_random_uuid(),
  display_id text not null unique,
  work_order_id uuid references work_orders(id),
  customer_id uuid not null references customers(id),
  vehicle_id uuid references vehicles(id),
  status text not null default 'Draft'
    check (status in ('Draft','Sent','Paid','Overdue')),
  labor_total numeric(10,2) not null default 0,
  parts_total numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  payment_method text,
  stripe_payment_intent_id text,
  stripe_payment_link text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Invoice Labor Lines (snapshot from WO)
create table invoice_labor_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  hours numeric(5,2) not null,
  rate numeric(8,2) not null,
  sort_order int not null default 0
);

-- Invoice Parts Lines
create table invoice_parts_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  name text not null,
  qty int not null default 1,
  price numeric(8,2) not null,
  sort_order int not null default 0
);

-- Auto-increment display ID functions
create or replace function next_wo_id() returns text as $$
declare max_num int;
begin
  select coalesce(max(cast(substring(display_id from 4) as int)), 1000)
  into max_num from work_orders;
  return 'WO-' || (max_num + 1);
end;
$$ language plpgsql;

create or replace function next_inv_id() returns text as $$
declare max_num int;
begin
  select coalesce(max(cast(substring(display_id from 5) as int)), 2000)
  into max_num from invoices;
  return 'INV-' || (max_num + 1);
end;
$$ language plpgsql;

-- Updated_at trigger
create or replace function update_modified_column()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger set_updated_at before update on work_orders
  for each row execute function update_modified_column();

-- Row Level Security (single-tenant: all authenticated users are staff)
alter table techs enable row level security;
alter table customers enable row level security;
alter table vehicles enable row level security;
alter table work_orders enable row level security;
alter table wo_labor_lines enable row level security;
alter table wo_parts_lines enable row level security;
alter table appointments enable row level security;
alter table invoices enable row level security;
alter table invoice_labor_lines enable row level security;
alter table invoice_parts_lines enable row level security;

create policy "Staff access" on techs for all using (auth.role() = 'authenticated');
create policy "Staff access" on customers for all using (auth.role() = 'authenticated');
create policy "Staff access" on vehicles for all using (auth.role() = 'authenticated');
create policy "Staff access" on work_orders for all using (auth.role() = 'authenticated');
create policy "Staff access" on wo_labor_lines for all using (auth.role() = 'authenticated');
create policy "Staff access" on wo_parts_lines for all using (auth.role() = 'authenticated');
create policy "Staff access" on appointments for all using (auth.role() = 'authenticated');
create policy "Staff access" on invoices for all using (auth.role() = 'authenticated');
create policy "Staff access" on invoice_labor_lines for all using (auth.role() = 'authenticated');
create policy "Staff access" on invoice_parts_lines for all using (auth.role() = 'authenticated');

-- Indexes for common queries
create index idx_wo_status on work_orders(status);
create index idx_wo_tech on work_orders(tech_id);
create index idx_wo_customer on work_orders(customer_id);
create index idx_vehicles_customer on vehicles(customer_id);
create index idx_appointments_time on appointments(start_time);
create index idx_appointments_tech on appointments(tech_id);
create index idx_invoices_status on invoices(status);
create index idx_invoices_customer on invoices(customer_id);
