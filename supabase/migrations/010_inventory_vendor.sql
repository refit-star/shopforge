-- Add vendor_id to parts_inventory
ALTER TABLE parts_inventory ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id);
CREATE INDEX IF NOT EXISTS idx_parts_inventory_vendor_id ON parts_inventory(vendor_id);
