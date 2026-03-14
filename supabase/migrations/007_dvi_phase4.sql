-- Phase 4: DVI auto-send setting + report-sent guard

-- Shop-level toggle for auto-sending DVI report when inspection is completed
ALTER TABLE shops ADD COLUMN IF NOT EXISTS dvi_auto_send boolean NOT NULL DEFAULT false;

-- Guard to prevent re-sending the DVI report on subsequent item edits
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS dvi_report_sent boolean NOT NULL DEFAULT false;
