-- Phase 2: Photo annotation support
ALTER TABLE inspection_item_media ADD COLUMN IF NOT EXISTS annotated_url text;
