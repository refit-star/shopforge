-- Tech time clocking: shift clock + job timers

CREATE TABLE time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  tech_id uuid NOT NULL REFERENCES techs(id),
  type text NOT NULL CHECK (type IN ('shift', 'job')),
  work_order_id uuid REFERENCES work_orders(id),
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  duration_minutes int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_entries_shop_id ON time_entries(shop_id);
CREATE INDEX idx_time_entries_tech_id ON time_entries(tech_id);
CREATE INDEX idx_time_entries_work_order_id ON time_entries(work_order_id);
CREATE INDEX idx_time_entries_active ON time_entries(tech_id, clock_out) WHERE clock_out IS NULL;

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_isolation ON time_entries FOR ALL
  USING (shop_id = get_shop_id());

CREATE TRIGGER trg_set_shop_id BEFORE INSERT ON time_entries
  FOR EACH ROW EXECUTE FUNCTION set_shop_id();
