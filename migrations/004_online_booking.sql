-- Online booking feature: add columns to shops, canned_jobs, appointments

-- Shops: booking configuration
ALTER TABLE shops ADD COLUMN IF NOT EXISTS online_booking_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS booking_slot_duration integer NOT NULL DEFAULT 60;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS booking_lead_hours integer NOT NULL DEFAULT 2;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS booking_window_days integer NOT NULL DEFAULT 14;

-- Canned jobs: which services are bookable online + default duration
ALTER TABLE canned_jobs ADD COLUMN IF NOT EXISTS bookable boolean NOT NULL DEFAULT false;
ALTER TABLE canned_jobs ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 60;

-- Appointments: track source (manual vs online)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
