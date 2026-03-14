-- Post-wave review fixes

-- Atomic inventory quantity increment (prevents race conditions on PO receive)
CREATE OR REPLACE FUNCTION increment_inventory_qty(p_id uuid, p_delta int)
RETURNS void AS $$
BEGIN
  UPDATE parts_inventory
  SET qty_on_hand = COALESCE(qty_on_hand, 0) + p_delta
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add missing columns to shops table (used by setup wizard & DVI estimate flow)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS dvi_estimate_auto_send boolean DEFAULT true NOT NULL;

-- Backfill setup_completed_at for existing shops that already have techs and canned jobs
-- so they see the completion checklist instead of nothing
UPDATE shops s
SET setup_completed_at = s.created_at
WHERE s.setup_completed_at IS NULL
  AND EXISTS (SELECT 1 FROM techs t WHERE t.shop_id = s.id)
  AND EXISTS (SELECT 1 FROM canned_jobs cj WHERE cj.shop_id = s.id);
