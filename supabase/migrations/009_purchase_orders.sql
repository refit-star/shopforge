-- Purchase Orders: vendors, purchase orders, PO line items, receiving

-- ============================================================
-- VENDORS
-- ============================================================
CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
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
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendors_shop_id ON vendors(shop_id);
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_isolation ON vendors FOR ALL USING (shop_id = get_shop_id());
CREATE TRIGGER trg_set_shop_id BEFORE INSERT ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_shop_id();
CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  display_id text NOT NULL,
  vendor_id uuid REFERENCES vendors(id),
  work_order_id uuid REFERENCES work_orders(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ordered','partially_received','received','cancelled')),
  notes text,
  ordered_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_orders_shop_id ON purchase_orders(shop_id);
CREATE INDEX idx_purchase_orders_vendor_id ON purchase_orders(vendor_id);
CREATE INDEX idx_purchase_orders_work_order_id ON purchase_orders(work_order_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_isolation ON purchase_orders FOR ALL USING (shop_id = get_shop_id());
CREATE TRIGGER trg_set_shop_id BEFORE INSERT ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_shop_id();
CREATE TRIGGER trg_purchase_orders_updated BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ============================================================
-- PO LINE ITEMS
-- ============================================================
CREATE TABLE po_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  name text NOT NULL,
  part_number text,
  qty_ordered int NOT NULL DEFAULT 1,
  qty_received int NOT NULL DEFAULT 0,
  unit_cost numeric(8,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  wo_parts_line_id uuid REFERENCES wo_parts_lines(id) ON DELETE SET NULL
);

CREATE INDEX idx_po_lines_shop_id ON po_lines(shop_id);
CREATE INDEX idx_po_lines_purchase_order_id ON po_lines(purchase_order_id);
ALTER TABLE po_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_isolation ON po_lines FOR ALL USING (shop_id = get_shop_id());
CREATE TRIGGER trg_set_shop_id BEFORE INSERT ON po_lines
  FOR EACH ROW EXECUTE FUNCTION set_shop_id();

-- ============================================================
-- next_po_id() — per-shop sequential PO numbers
-- ============================================================
CREATE OR REPLACE FUNCTION next_po_id(p_shop_id uuid DEFAULT NULL)
RETURNS text AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Add unit_cost to wo_parts_lines for cost tracking
-- ============================================================
ALTER TABLE wo_parts_lines ADD COLUMN IF NOT EXISTS unit_cost numeric(8,2);
