-- 011_plate_lookup.sql
-- License plate lookup: cache table + per-shop API key

-- Per-shop override for plate lookup API key
ALTER TABLE shops ADD COLUMN IF NOT EXISTS plate_lookup_api_key text;

-- Cache table for plate lookup results (avoids re-hitting API for same plate)
CREATE TABLE plate_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  plate text NOT NULL,
  state text NOT NULL,
  vin text,
  year int,
  make text,
  model text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_plate_lookups_shop_id ON plate_lookups(shop_id);
CREATE INDEX idx_plate_lookups_cache ON plate_lookups(shop_id, plate, state, created_at DESC);

ALTER TABLE plate_lookups ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_isolation ON plate_lookups FOR ALL USING (shop_id = get_shop_id());

CREATE TRIGGER trg_set_shop_id BEFORE INSERT ON plate_lookups
  FOR EACH ROW EXECUTE FUNCTION set_shop_id();
