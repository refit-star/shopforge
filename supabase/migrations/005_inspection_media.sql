-- Phase 1: Inspection item media (photos/videos on DVI items)

-- inspection_item_media: stores uploaded photos/videos per inspection item
CREATE TABLE inspection_item_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  inspection_item_id uuid NOT NULL REFERENCES inspection_items(id) ON DELETE CASCADE,
  url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',  -- 'image' | 'video'
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspection_item_media_shop_id ON inspection_item_media(shop_id);
CREATE INDEX idx_inspection_item_media_item_id ON inspection_item_media(inspection_item_id);

ALTER TABLE inspection_item_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_isolation ON inspection_item_media FOR ALL
  USING (shop_id = get_shop_id());

CREATE TRIGGER trg_set_shop_id BEFORE INSERT ON inspection_item_media
  FOR EACH ROW EXECUTE FUNCTION set_shop_id();

-- Add portal_token to inspections for future customer-facing DVI report (Phase 3)
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS portal_token uuid DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_inspections_portal_token ON inspections(portal_token);
