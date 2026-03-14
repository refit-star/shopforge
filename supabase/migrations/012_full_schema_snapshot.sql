-- Full schema snapshot for version control.
-- This captures the complete live database state as of 2026-03-12.
-- DO NOT RUN this migration — it is a reference-only snapshot.
-- The live database already has this schema applied.

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_shop_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
    DECLARE
      jwt_shop uuid;
      session_shop uuid;
      lookup_shop uuid;
    BEGIN
      -- Fast path: read from JWT app_metadata (set once when user is linked to a shop)
      BEGIN
        jwt_shop := (auth.jwt()->'app_metadata'->>'shop_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        jwt_shop := NULL;
      END;

      IF jwt_shop IS NOT NULL THEN
        RETURN jwt_shop;
      END IF;

      -- Second: try session variable (for future multi-shop switching)
      BEGIN
        session_shop := current_setting('app.current_shop_id', true)::uuid;
      EXCEPTION WHEN OTHERS THEN
        session_shop := NULL;
      END;

      IF session_shop IS NOT NULL THEN
        IF EXISTS (
          SELECT 1 FROM user_shops
          WHERE user_id = auth.uid() AND shop_id = session_shop
        ) THEN
          RETURN session_shop;
        END IF;
      END IF;

      -- Fallback: lookup from user_shops
      SELECT shop_id INTO lookup_shop
      FROM user_shops
      WHERE user_id = auth.uid()
      ORDER BY created_at ASC
      LIMIT 1;

      RETURN lookup_shop;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.next_est_id(p_shop_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE 
  next_num int;
  sid uuid;
BEGIN
  sid := COALESCE(p_shop_id, get_shop_id());
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(display_id FROM '[0-9]+$') AS int)), 0) + 1
  INTO next_num 
  FROM estimates
  WHERE shop_id = sid;
  
  RETURN 'EST-' || LPAD(next_num::text, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_inv_id(p_shop_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE 
  max_num int;
  sid uuid;
  prefix text;
BEGIN
  sid := COALESCE(p_shop_id, get_shop_id());
  
  SELECT invoice_prefix INTO prefix FROM shops WHERE id = sid;
  prefix := COALESCE(prefix, 'INV');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(display_id FROM '[0-9]+$') AS int)), 2000)
  INTO max_num 
  FROM invoices
  WHERE shop_id = sid;
  
  RETURN prefix || '-' || (max_num + 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_po_id(p_shop_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_shop_id uuid;
  max_num int;
BEGIN
  v_shop_id := COALESCE(p_shop_id, get_shop_id());
  SELECT COALESCE(MAX(CAST(SUBSTRING(display_id FROM 4) AS int)), 5000)
    INTO max_num
    FROM purchase_orders
    WHERE shop_id = v_shop_id;
  RETURN 'PO-' || (max_num + 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_wo_id(p_shop_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE 
  max_num int;
  sid uuid;
  prefix text;
BEGIN
  sid := COALESCE(p_shop_id, get_shop_id());
  
  SELECT wo_prefix INTO prefix FROM shops WHERE id = sid;
  prefix := COALESCE(prefix, 'WO');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(display_id FROM '[0-9]+$') AS int)), 1000)
  INTO max_num 
  FROM work_orders
  WHERE shop_id = sid;
  
  RETURN prefix || '-' || (max_num + 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_shop_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    BEGIN
      IF NEW.shop_id IS NULL THEN
        NEW.shop_id := get_shop_id();
      END IF;
      IF NEW.shop_id IS NULL THEN
        RAISE EXCEPTION 'shop_id could not be determined';
      END IF;
      RETURN NEW;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.set_user_shop_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    BEGIN
      UPDATE auth.users
      SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('shop_id', NEW.shop_id::text)
      WHERE id = NEW.user_id;
      RETURN NEW;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.update_modified_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE shops (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  address text DEFAULT ''::text,
  phone text DEFAULT ''::text,
  email text DEFAULT ''::text,
  owner_name text DEFAULT ''::text,
  owner_initials text DEFAULT ''::text,
  default_labor_rate numeric DEFAULT 120.00,
  tax_rate numeric DEFAULT 0.08,
  hours_start integer DEFAULT 8,
  hours_end integer DEFAULT 18,
  invoice_footer text DEFAULT 'Thank you for your business!'::text,
  wo_prefix text DEFAULT 'WO'::text,
  invoice_prefix text DEFAULT 'INV'::text,
  logo_url text,
  resend_api_key text,
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_phone_number text,
  stripe_secret_key text,
  stripe_publishable_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  partstech_username text,
  partstech_api_key text,
  sms_auto_templates jsonb DEFAULT '{"Check-In": {"enabled": false, "template": "Your vehicle has been checked in at {{shop_name}}."}, "Completed": {"enabled": false, "template": "Service on your {{vehicle}} has been completed. Thank you for choosing {{shop_name}}!"}, "In Progress": {"enabled": false, "template": "Work has begun on your {{vehicle}}."}, "Ready for Pickup": {"enabled": false, "template": "Your {{vehicle}} is ready for pickup at {{shop_name}}!"}, "Waiting on Parts": {"enabled": false, "template": "We are waiting on parts for your {{vehicle}}. We will update you when they arrive."}}'::jsonb,
  text_to_pay_enabled boolean DEFAULT false,
  qb_realm_id text,
  qb_access_token text,
  qb_refresh_token text,
  qb_token_expires_at timestamptz,
  online_booking_enabled boolean DEFAULT false NOT NULL,
  booking_slot_duration integer DEFAULT 60 NOT NULL,
  booking_lead_hours integer DEFAULT 2 NOT NULL,
  booking_window_days integer DEFAULT 14 NOT NULL,
  dvi_auto_send boolean DEFAULT false NOT NULL,
  plate_lookup_api_key text,
  CONSTRAINT shops_pkey PRIMARY KEY (id),
  CONSTRAINT shops_slug_key UNIQUE (slug)
);

CREATE TABLE user_shops (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  role text DEFAULT 'owner'::text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT user_shops_pkey PRIMARY KEY (id),
  CONSTRAINT user_shops_user_id_shop_id_key UNIQUE (user_id, shop_id)
);

CREATE TABLE appointments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  vehicle_id uuid,
  tech_id uuid,
  job text NOT NULL,
  start_time timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  shop_id uuid NOT NULL,
  source text DEFAULT 'manual'::text NOT NULL,
  CONSTRAINT appointments_pkey PRIMARY KEY (id)
);

CREATE TABLE canned_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  labor_lines jsonb DEFAULT '[]'::jsonb,
  parts_lines jsonb DEFAULT '[]'::jsonb,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  shop_id uuid NOT NULL,
  bookable boolean DEFAULT false NOT NULL,
  duration_minutes integer DEFAULT 60 NOT NULL,
  CONSTRAINT canned_jobs_pkey PRIMARY KEY (id)
);

CREATE TABLE customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  created_at timestamptz DEFAULT now() NOT NULL,
  tags text[] DEFAULT ARRAY[]::text[],
  shop_id uuid NOT NULL,
  qb_customer_id text,
  address text,
  city text,
  state text,
  zip text,
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);

CREATE TABLE estimate_labor_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  estimate_id uuid,
  description text NOT NULL,
  hours numeric(6,2) DEFAULT 1,
  rate numeric(10,2) DEFAULT 120,
  sort_order integer DEFAULT 0,
  shop_id uuid NOT NULL,
  CONSTRAINT estimate_labor_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE estimate_parts_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  estimate_id uuid,
  name text NOT NULL,
  qty integer DEFAULT 1,
  price numeric(10,2) DEFAULT 0,
  sort_order integer DEFAULT 0,
  shop_id uuid NOT NULL,
  CONSTRAINT estimate_parts_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE estimate_signatures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  estimate_id uuid NOT NULL,
  signer_name text NOT NULL,
  signature_url text NOT NULL,
  ip_address inet,
  user_agent text,
  approved_at timestamptz DEFAULT now() NOT NULL,
  estimate_snapshot jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT estimate_signatures_pkey PRIMARY KEY (id),
  CONSTRAINT estimate_signatures_estimate_id_key UNIQUE (estimate_id)
);

CREATE TABLE estimates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  display_id text NOT NULL,
  customer_id uuid,
  vehicle_id uuid,
  job text NOT NULL,
  notes text,
  status text DEFAULT 'Draft'::text NOT NULL,
  valid_until date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  portal_token uuid DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  approved_at timestamptz,
  approved_by text,
  CONSTRAINT estimates_pkey PRIMARY KEY (id),
  CONSTRAINT estimates_display_id_key UNIQUE (display_id),
  CONSTRAINT estimates_portal_token_key UNIQUE (portal_token),
  CONSTRAINT estimates_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Sent'::text, 'Approved'::text, 'Declined'::text])))
);

CREATE TABLE inspection_item_media (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  inspection_item_id uuid NOT NULL,
  url text NOT NULL,
  media_type text DEFAULT 'image'::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  annotated_url text,
  CONSTRAINT inspection_item_media_pkey PRIMARY KEY (id)
);

CREATE TABLE inspection_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  inspection_id uuid,
  category text NOT NULL,
  item text NOT NULL,
  status text DEFAULT 'not_checked'::text NOT NULL,
  notes text,
  sort_order integer DEFAULT 0,
  shop_id uuid NOT NULL,
  CONSTRAINT inspection_items_pkey PRIMARY KEY (id),
  CONSTRAINT inspection_items_status_check CHECK ((status = ANY (ARRAY['pass'::text, 'fail'::text, 'attention'::text, 'not_checked'::text])))
);

CREATE TABLE inspections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  work_order_id uuid,
  created_at timestamptz DEFAULT now(),
  shop_id uuid NOT NULL,
  portal_token uuid DEFAULT gen_random_uuid(),
  dvi_report_sent boolean DEFAULT false NOT NULL,
  CONSTRAINT inspections_pkey PRIMARY KEY (id),
  CONSTRAINT inspections_work_order_id_unique UNIQUE (work_order_id)
);

CREATE TABLE invoice_labor_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  description text NOT NULL,
  hours numeric(5,2) NOT NULL,
  rate numeric(8,2) NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  shop_id uuid NOT NULL,
  CONSTRAINT invoice_labor_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE invoice_parts_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  name text NOT NULL,
  qty integer DEFAULT 1 NOT NULL,
  price numeric(8,2) NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  shop_id uuid NOT NULL,
  CONSTRAINT invoice_parts_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  display_id text NOT NULL,
  work_order_id uuid,
  customer_id uuid NOT NULL,
  vehicle_id uuid,
  status text DEFAULT 'Draft'::text NOT NULL,
  labor_total numeric(10,2) DEFAULT 0 NOT NULL,
  parts_total numeric(10,2) DEFAULT 0 NOT NULL,
  tax numeric(10,2) DEFAULT 0 NOT NULL,
  total numeric(10,2) DEFAULT 0 NOT NULL,
  payment_method text,
  stripe_payment_intent_id text,
  stripe_payment_link text,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  voided_at timestamptz,
  portal_token uuid DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  qb_invoice_id text,
  qb_sync_error text,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_display_id_key UNIQUE (display_id),
  CONSTRAINT invoices_portal_token_key UNIQUE (portal_token),
  CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Sent'::text, 'Paid'::text, 'Overdue'::text, 'Void'::text])))
);

CREATE TABLE notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  work_order_id uuid,
  customer_id uuid,
  type text NOT NULL,
  channel text DEFAULT 'sms'::text NOT NULL,
  message text NOT NULL,
  status text DEFAULT 'Sent'::text,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  shop_id uuid NOT NULL,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Sent'::text, 'Failed'::text])))
);

CREATE TABLE parts_inventory (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  part_number text,
  category text,
  qty_on_hand integer DEFAULT 0,
  cost numeric(10,2) DEFAULT 0,
  price numeric(10,2) DEFAULT 0,
  min_stock integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  shop_id uuid NOT NULL,
  vendor_id uuid,
  CONSTRAINT parts_inventory_pkey PRIMARY KEY (id)
);

CREATE TABLE partstech_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  work_order_id uuid,
  partstech_order_id text,
  status text DEFAULT 'pending'::text NOT NULL,
  items jsonb DEFAULT '[]'::jsonb NOT NULL,
  total numeric(10,2),
  ordered_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT partstech_orders_pkey PRIMARY KEY (id)
);

CREATE TABLE plate_lookups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  plate text NOT NULL,
  state text NOT NULL,
  vin text,
  year integer,
  make text,
  model text,
  raw_response jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT plate_lookups_pkey PRIMARY KEY (id)
);

CREATE TABLE po_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  name text NOT NULL,
  part_number text,
  qty_ordered integer DEFAULT 1 NOT NULL,
  qty_received integer DEFAULT 0 NOT NULL,
  unit_cost numeric(8,2) DEFAULT 0 NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  wo_parts_line_id uuid,
  CONSTRAINT po_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE purchase_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  display_id text NOT NULL,
  vendor_id uuid,
  work_order_id uuid,
  status text DEFAULT 'draft'::text NOT NULL,
  notes text,
  ordered_at timestamptz,
  received_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT purchase_orders_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_orders_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'ordered'::text, 'partially_received'::text, 'received'::text, 'cancelled'::text])))
);

CREATE TABLE service_reminders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  vehicle_id uuid,
  customer_id uuid,
  service_type text NOT NULL,
  due_date date,
  due_mileage integer,
  status text DEFAULT 'Pending'::text,
  created_at timestamptz DEFAULT now(),
  shop_id uuid NOT NULL,
  CONSTRAINT service_reminders_pkey PRIMARY KEY (id),
  CONSTRAINT service_reminders_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Sent'::text, 'Completed'::text, 'Dismissed'::text])))
);

CREATE TABLE sms_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  customer_id uuid,
  direction text NOT NULL,
  phone_number text NOT NULL,
  body text NOT NULL,
  twilio_message_sid text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT sms_messages_pkey PRIMARY KEY (id),
  CONSTRAINT sms_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);

CREATE TABLE techs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#f97316'::text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  shop_id uuid NOT NULL,
  CONSTRAINT techs_pkey PRIMARY KEY (id)
);

CREATE TABLE time_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  tech_id uuid NOT NULL,
  type text NOT NULL,
  work_order_id uuid,
  clock_in timestamptz DEFAULT now() NOT NULL,
  clock_out timestamptz,
  duration_minutes integer,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT time_entries_pkey PRIMARY KEY (id),
  CONSTRAINT time_entries_type_check CHECK ((type = ANY (ARRAY['shift'::text, 'job'::text])))
);

CREATE TABLE vehicles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  year integer,
  make text NOT NULL,
  model text NOT NULL,
  vin text,
  mileage integer,
  plate text,
  created_at timestamptz DEFAULT now() NOT NULL,
  shop_id uuid NOT NULL,
  CONSTRAINT vehicles_pkey PRIMARY KEY (id)
);

CREATE TABLE vendors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  account_number text,
  address text,
  city text,
  state text,
  zip text,
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT vendors_pkey PRIMARY KEY (id)
);

CREATE TABLE wo_activity_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  work_order_id uuid,
  action text NOT NULL,
  details text,
  created_at timestamptz DEFAULT now(),
  shop_id uuid NOT NULL,
  CONSTRAINT wo_activity_log_pkey PRIMARY KEY (id)
);

CREATE TABLE wo_labor_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  work_order_id uuid NOT NULL,
  description text NOT NULL,
  hours numeric(5,2) NOT NULL,
  rate numeric(8,2) NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  shop_id uuid NOT NULL,
  CONSTRAINT wo_labor_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE wo_parts_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  work_order_id uuid NOT NULL,
  name text NOT NULL,
  qty integer DEFAULT 1 NOT NULL,
  price numeric(8,2) NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  shop_id uuid NOT NULL,
  source text DEFAULT 'manual'::text,
  part_number text,
  brand text,
  unit_cost numeric(8,2),
  CONSTRAINT wo_parts_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE wo_photos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  work_order_id uuid,
  url text NOT NULL,
  caption text,
  created_at timestamptz DEFAULT now(),
  shop_id uuid NOT NULL,
  CONSTRAINT wo_photos_pkey PRIMARY KEY (id)
);

CREATE TABLE work_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  display_id text NOT NULL,
  customer_id uuid NOT NULL,
  vehicle_id uuid NOT NULL,
  tech_id uuid,
  job text NOT NULL,
  status text DEFAULT 'Check-In'::text NOT NULL,
  priority text DEFAULT 'low'::text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  mileage_in integer,
  mileage_out integer,
  scheduled_date date,
  shop_id uuid NOT NULL,
  CONSTRAINT work_orders_pkey PRIMARY KEY (id),
  CONSTRAINT work_orders_display_id_key UNIQUE (display_id),
  CONSTRAINT work_orders_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
  CONSTRAINT work_orders_status_check CHECK ((status = ANY (ARRAY['Unscheduled'::text, 'Scheduled'::text, 'Check-In'::text, 'In Progress'::text, 'Waiting on Parts'::text, 'Ready for Pickup'::text, 'Completed'::text])))
);

-- ============================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================

ALTER TABLE user_shops ADD CONSTRAINT user_shops_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE user_shops ADD CONSTRAINT user_shops_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE appointments ADD CONSTRAINT appointments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE appointments ADD CONSTRAINT appointments_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE appointments ADD CONSTRAINT appointments_tech_id_fkey FOREIGN KEY (tech_id) REFERENCES techs(id);
ALTER TABLE appointments ADD CONSTRAINT appointments_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id);
ALTER TABLE canned_jobs ADD CONSTRAINT canned_jobs_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE customers ADD CONSTRAINT customers_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE estimate_labor_lines ADD CONSTRAINT estimate_labor_lines_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE;
ALTER TABLE estimate_labor_lines ADD CONSTRAINT estimate_labor_lines_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE estimate_parts_lines ADD CONSTRAINT estimate_parts_lines_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE;
ALTER TABLE estimate_parts_lines ADD CONSTRAINT estimate_parts_lines_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE estimate_signatures ADD CONSTRAINT estimate_signatures_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE;
ALTER TABLE estimate_signatures ADD CONSTRAINT estimate_signatures_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE estimates ADD CONSTRAINT estimates_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE estimates ADD CONSTRAINT estimates_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE estimates ADD CONSTRAINT estimates_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id);
ALTER TABLE inspection_item_media ADD CONSTRAINT inspection_item_media_inspection_item_id_fkey FOREIGN KEY (inspection_item_id) REFERENCES inspection_items(id) ON DELETE CASCADE;
ALTER TABLE inspection_item_media ADD CONSTRAINT inspection_item_media_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE inspection_items ADD CONSTRAINT inspection_items_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE;
ALTER TABLE inspection_items ADD CONSTRAINT inspection_items_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE inspections ADD CONSTRAINT inspections_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE inspections ADD CONSTRAINT inspections_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE invoice_labor_lines ADD CONSTRAINT invoice_labor_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE invoice_labor_lines ADD CONSTRAINT invoice_labor_lines_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE invoice_parts_lines ADD CONSTRAINT invoice_parts_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE invoice_parts_lines ADD CONSTRAINT invoice_parts_lines_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE invoices ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE invoices ADD CONSTRAINT invoices_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE invoices ADD CONSTRAINT invoices_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id);
ALTER TABLE invoices ADD CONSTRAINT invoices_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE notifications ADD CONSTRAINT notifications_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE notifications ADD CONSTRAINT notifications_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE notifications ADD CONSTRAINT notifications_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE parts_inventory ADD CONSTRAINT parts_inventory_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE parts_inventory ADD CONSTRAINT parts_inventory_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
ALTER TABLE partstech_orders ADD CONSTRAINT partstech_orders_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE partstech_orders ADD CONSTRAINT partstech_orders_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL;
ALTER TABLE plate_lookups ADD CONSTRAINT plate_lookups_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE po_lines ADD CONSTRAINT po_lines_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE po_lines ADD CONSTRAINT po_lines_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE po_lines ADD CONSTRAINT po_lines_wo_parts_line_id_fkey FOREIGN KEY (wo_parts_line_id) REFERENCES wo_parts_lines(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE service_reminders ADD CONSTRAINT service_reminders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE service_reminders ADD CONSTRAINT service_reminders_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE service_reminders ADD CONSTRAINT service_reminders_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE;
ALTER TABLE sms_messages ADD CONSTRAINT sms_messages_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE sms_messages ADD CONSTRAINT sms_messages_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE techs ADD CONSTRAINT techs_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE time_entries ADD CONSTRAINT time_entries_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE time_entries ADD CONSTRAINT time_entries_tech_id_fkey FOREIGN KEY (tech_id) REFERENCES techs(id);
ALTER TABLE time_entries ADD CONSTRAINT time_entries_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE vehicles ADD CONSTRAINT vehicles_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE vendors ADD CONSTRAINT vendors_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE wo_activity_log ADD CONSTRAINT wo_activity_log_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE wo_activity_log ADD CONSTRAINT wo_activity_log_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE;
ALTER TABLE wo_labor_lines ADD CONSTRAINT wo_labor_lines_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE wo_labor_lines ADD CONSTRAINT wo_labor_lines_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE;
ALTER TABLE wo_parts_lines ADD CONSTRAINT wo_parts_lines_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE wo_parts_lines ADD CONSTRAINT wo_parts_lines_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE;
ALTER TABLE wo_photos ADD CONSTRAINT wo_photos_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE wo_photos ADD CONSTRAINT wo_photos_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE work_orders ADD CONSTRAINT work_orders_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE work_orders ADD CONSTRAINT work_orders_tech_id_fkey FOREIGN KEY (tech_id) REFERENCES techs(id);
ALTER TABLE work_orders ADD CONSTRAINT work_orders_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_user_shops_shop_id ON public.user_shops USING btree (shop_id);
CREATE INDEX idx_user_shops_user_id ON public.user_shops USING btree (user_id);
CREATE INDEX idx_appointments_shop_id ON public.appointments USING btree (shop_id);
CREATE INDEX idx_appointments_tech ON public.appointments USING btree (tech_id);
CREATE INDEX idx_appointments_time ON public.appointments USING btree (start_time);
CREATE INDEX idx_canned_jobs_shop_id ON public.canned_jobs USING btree (shop_id);
CREATE INDEX idx_customers_shop_id ON public.customers USING btree (shop_id);
CREATE INDEX idx_estimate_labor_lines_shop_id ON public.estimate_labor_lines USING btree (shop_id);
CREATE INDEX idx_estimate_parts_lines_shop_id ON public.estimate_parts_lines USING btree (shop_id);
CREATE INDEX idx_estimate_signatures_estimate_id ON public.estimate_signatures USING btree (estimate_id);
CREATE INDEX idx_estimate_signatures_shop_id ON public.estimate_signatures USING btree (shop_id);
CREATE INDEX idx_estimates_shop_id ON public.estimates USING btree (shop_id);
CREATE INDEX idx_inspection_item_media_item_id ON public.inspection_item_media USING btree (inspection_item_id);
CREATE INDEX idx_inspection_item_media_shop_id ON public.inspection_item_media USING btree (shop_id);
CREATE INDEX idx_inspection_items_shop_id ON public.inspection_items USING btree (shop_id);
CREATE UNIQUE INDEX idx_inspections_portal_token ON public.inspections USING btree (portal_token);
CREATE INDEX idx_inspections_shop_id ON public.inspections USING btree (shop_id);
CREATE INDEX idx_invoice_labor_lines_shop_id ON public.invoice_labor_lines USING btree (shop_id);
CREATE INDEX idx_invoice_parts_lines_shop_id ON public.invoice_parts_lines USING btree (shop_id);
CREATE INDEX idx_invoices_customer ON public.invoices USING btree (customer_id);
CREATE INDEX idx_invoices_shop_id ON public.invoices USING btree (shop_id);
CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);
CREATE INDEX idx_notifications_shop_id ON public.notifications USING btree (shop_id);
CREATE INDEX idx_parts_inventory_shop_id ON public.parts_inventory USING btree (shop_id);
CREATE INDEX idx_parts_inventory_vendor_id ON public.parts_inventory USING btree (vendor_id);
CREATE INDEX idx_partstech_orders_shop_id ON public.partstech_orders USING btree (shop_id);
CREATE INDEX idx_plate_lookups_cache ON public.plate_lookups USING btree (shop_id, plate, state, created_at DESC);
CREATE INDEX idx_plate_lookups_shop_id ON public.plate_lookups USING btree (shop_id);
CREATE INDEX idx_po_lines_purchase_order_id ON public.po_lines USING btree (purchase_order_id);
CREATE INDEX idx_po_lines_shop_id ON public.po_lines USING btree (shop_id);
CREATE INDEX idx_purchase_orders_shop_id ON public.purchase_orders USING btree (shop_id);
CREATE INDEX idx_purchase_orders_status ON public.purchase_orders USING btree (status);
CREATE INDEX idx_purchase_orders_vendor_id ON public.purchase_orders USING btree (vendor_id);
CREATE INDEX idx_purchase_orders_work_order_id ON public.purchase_orders USING btree (work_order_id);
CREATE INDEX idx_service_reminders_shop_id ON public.service_reminders USING btree (shop_id);
CREATE INDEX idx_sms_messages_customer_id ON public.sms_messages USING btree (customer_id);
CREATE INDEX idx_sms_messages_phone ON public.sms_messages USING btree (phone_number);
CREATE INDEX idx_sms_messages_shop_id ON public.sms_messages USING btree (shop_id);
CREATE INDEX idx_techs_shop_id ON public.techs USING btree (shop_id);
CREATE INDEX idx_time_entries_active ON public.time_entries USING btree (tech_id, clock_out) WHERE (clock_out IS NULL);
CREATE INDEX idx_time_entries_shop_id ON public.time_entries USING btree (shop_id);
CREATE INDEX idx_time_entries_tech_id ON public.time_entries USING btree (tech_id);
CREATE INDEX idx_time_entries_work_order_id ON public.time_entries USING btree (work_order_id);
CREATE INDEX idx_vehicles_customer ON public.vehicles USING btree (customer_id);
CREATE INDEX idx_vehicles_shop_id ON public.vehicles USING btree (shop_id);
CREATE INDEX idx_vendors_shop_id ON public.vendors USING btree (shop_id);
CREATE INDEX idx_wo_activity_log_shop_id ON public.wo_activity_log USING btree (shop_id);
CREATE INDEX idx_wo_labor_lines_shop_id ON public.wo_labor_lines USING btree (shop_id);
CREATE INDEX idx_wo_parts_lines_shop_id ON public.wo_parts_lines USING btree (shop_id);
CREATE INDEX idx_wo_photos_shop_id ON public.wo_photos USING btree (shop_id);
CREATE INDEX idx_wo_customer ON public.work_orders USING btree (customer_id);
CREATE INDEX idx_wo_status ON public.work_orders USING btree (status);
CREATE INDEX idx_wo_tech ON public.work_orders USING btree (tech_id);
CREATE INDEX idx_work_orders_shop_id ON public.work_orders USING btree (shop_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE canned_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_labor_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_parts_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_item_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_labor_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_parts_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE partstech_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE plate_lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE techs ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE wo_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE wo_labor_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE wo_parts_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE wo_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

CREATE POLICY shop_isolation ON appointments TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON canned_jobs TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON customers TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON estimate_labor_lines TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON estimate_parts_lines TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON estimate_signatures TO public
  USING (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON estimates TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON inspection_item_media TO public
  USING (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON inspection_items TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON inspections TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON invoice_labor_lines TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON invoice_parts_lines TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON invoices TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON notifications TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON parts_inventory TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON partstech_orders TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON plate_lookups TO public
  USING (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON po_lines TO public
  USING (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON purchase_orders TO public
  USING (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON service_reminders TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_read ON shops FOR SELECT TO public
  USING (id = get_shop_id());

CREATE POLICY shop_update ON shops FOR UPDATE TO public
  USING (id = get_shop_id())
  WITH CHECK (id = get_shop_id());

CREATE POLICY shop_isolation ON sms_messages TO public
  USING (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON techs TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON time_entries TO public
  USING (shop_id = get_shop_id());

CREATE POLICY user_shops_read ON user_shops FOR SELECT TO public
  USING (user_id = auth.uid());

CREATE POLICY shop_isolation ON vehicles TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON vendors TO public
  USING (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON wo_activity_log TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON wo_labor_lines TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON wo_parts_lines TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON wo_photos TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

CREATE POLICY shop_isolation ON work_orders TO public
  USING (shop_id = get_shop_id())
  WITH CHECK (shop_id = get_shop_id());

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON canned_jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON customers
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON estimate_labor_lines
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON estimate_parts_lines
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON estimate_signatures
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON estimates
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON inspection_item_media
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON inspection_items
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON inspections
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON invoice_labor_lines
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON invoice_parts_lines
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON parts_inventory
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON partstech_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON plate_lookups
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON po_lines
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_purchase_orders_updated
  BEFORE UPDATE
  ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON service_reminders
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON techs
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_user_shop_metadata
  AFTER INSERT
  ON user_shops
  FOR EACH ROW
  EXECUTE FUNCTION set_user_shop_metadata();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_vendors_updated
  BEFORE UPDATE
  ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON wo_activity_log
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON wo_labor_lines
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON wo_parts_lines
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON wo_photos
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE
  ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER trg_set_shop_id
  BEFORE INSERT
  ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_id();
