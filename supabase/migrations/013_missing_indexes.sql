-- Missing FK indexes for query performance
CREATE INDEX IF NOT EXISTS idx_wo_labor_lines_wo_id ON wo_labor_lines(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_parts_lines_wo_id ON wo_parts_lines(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_photos_wo_id ON wo_photos(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_activity_log_wo_id ON wo_activity_log(work_order_id);
CREATE INDEX IF NOT EXISTS idx_estimates_customer_id ON estimates(customer_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- QB OAuth CSRF nonce column
ALTER TABLE shops ADD COLUMN IF NOT EXISTS qb_oauth_state text;
