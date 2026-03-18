# ShopForge — Architecture Rules

## Multi-Tenant SaaS

This is a multi-tenant mechanic shop management platform. Every data table is scoped by `shop_id` via Row Level Security (RLS). A single deployment serves all tenants — isolation is enforced at the database layer, not the application layer.

### get_shop_id() Resolution Order

The PostgreSQL function `get_shop_id()` resolves the current shop in this order:

1. **JWT `app_metadata.shop_id`** — Fast path, zero-cost. Set once via trigger on `user_shops` INSERT.
2. **Session variable `app.current_shop_id`** — Reserved for future multi-shop switching.
3. **`user_shops` table lookup by `auth.uid()`** — Fallback for stale JWTs.

If a user is moved between shops, their JWT retains the old `shop_id` until re-login. The `user_shops` fallback covers this.

## New Tables

Every new data table MUST include:

```sql
shop_id uuid NOT NULL REFERENCES shops(id),
-- + index:
CREATE INDEX idx_{table}_shop_id ON {table}(shop_id);
-- + RLS:
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_isolation ON {table} FOR ALL USING (shop_id = get_shop_id());
-- + auto-set trigger:
CREATE TRIGGER trg_set_shop_id BEFORE INSERT ON {table}
  FOR EACH ROW EXECUTE FUNCTION set_shop_id();
```

The `set_shop_id()` trigger auto-populates `shop_id` on INSERT — API code should never manually set `shop_id` in INSERT payloads.

## Supabase Client Rules

- **`createServerClient()`** — Uses anon key + user JWT. RLS is enforced. Use for all dashboard/authenticated API routes.
- **`createAdminClient()`** — Uses service_role key. Bypasses RLS. Use ONLY for:
  - Portal routes (`/api/portal/...`) — token-based auth
  - Stripe webhooks (`/api/stripe/webhook`)
  - Twilio webhooks (`/api/twilio/webhook`) — signature-validated
  - QuickBooks callback (`/api/quickbooks/callback`) — OAuth redirect
  - Admin provisioning (`/api/admin/...`) — admin key auth
  - Storage bucket uploads (bucket policies require service role)
  - Reading secrets from `shop_secrets` table (deny-all RLS, service_role only)

Never use `createAdminClient()` for dashboard data operations.

## Shop Secrets

All sensitive credentials live in `shop_secrets` (NOT `shops`). The `shop_secrets` table has RLS enabled with zero policies (deny-all for anon/authenticated — only service_role can access).

- **`getShopSecrets()`** (`src/lib/secrets-server.ts`) — Resolves shop via RLS, reads secrets via admin client. Use in authenticated routes.
- **`getShopSecretsById(shopId)`** — For webhook/portal routes where shop_id is already validated.
- **`getFullSettings()`** (`src/lib/settings-server.ts`) — Merges `shops` data + `shop_secrets` for server-side use. Never send raw result to client.
- Secret columns: `twilio_account_sid`, `twilio_auth_token`, `stripe_secret_key`, `stripe_webhook_secret`, `qb_access_token`, `qb_refresh_token`, `qb_token_expires_at`, `qb_realm_id`, `qb_oauth_state`, `resend_api_key`, `partstech_api_key`, `plate_lookup_api_key`
- Non-secret columns that stay on `shops`: `twilio_phone_number`, `stripe_publishable_key`, `partstech_username`

## Error Handling

Use `internalError()` from `src/lib/api-error.ts` for all 500 responses. It logs the real error server-side via `console.error` and returns a generic message to the client. Never return `error.message` from Supabase/Stripe/Twilio in responses.

## Unauthenticated Routes (Middleware Skip List)

These routes skip auth in `src/middleware.ts`:

- `/api/portal/*` — token-based customer portal (estimates, invoices, DVI reports)
- `/portal/*` — customer portal pages (estimates, invoices, DVI reports)
- `/api/book/*` — public booking API (slug-based)
- `/api/auth/*` — session cookie management (login/logout)
- `/api/stripe/webhook` — Stripe signature verification
- `/api/twilio/webhook` — Twilio signature validation
- `/api/quickbooks/callback` — OAuth redirect from Intuit
- `/api/admin/*` — admin key auth (timingSafeEqual + 5/hr/IP rate limit)
- `/login/*` — public login pages
- `/book/*` — public online booking pages

## ID Generation

The functions `next_wo_id()`, `next_est_id()`, `next_inv_id()` accept an optional `p_shop_id uuid` parameter and scope counters per-shop. They fall back to `get_shop_id()` when called without arguments. Do not create parameterless overloads — this causes PostgREST PGRST203 ambiguity errors.

## Sensitive Fields

The following fields are masked in `GET /api/settings` responses:

- `qb_access_token`, `qb_refresh_token`
- `twilio_auth_token`
- `stripe_secret_key`, `stripe_publishable_key`, `stripe_webhook_secret`
- `resend_api_key`
- `partstech_api_key`
- `plate_lookup_api_key`

## Storage Namespacing

All Supabase Storage uploads must be namespaced by shop:

- Logos: `logos/{shop_id}/logo-{timestamp}.{ext}`
- WO photos: `wo-photos/{shop_id}/{work_order_id}/{timestamp}-{filename}`
- Signatures: `signatures/{shop_id}/{estimate_id}.png`
- Inspection media: `inspection-media/{shop_id}/inspections/{item_id}/{timestamp}-{filename}`
- Any new uploads: `{bucket}/{shop_id}/...`

Use `createAdminClient()` for storage operations (bucket policies), but resolve `shop_id` from an RLS-scoped query first.

## No Hardcoded Shop Identity

All shop branding (name, logo, owner, phone, address, rates) comes from the `shops` table via `/api/settings`, which is RLS-scoped. Never read shop identity from:

- `NEXT_PUBLIC_SHOP_*` environment variables (these are legacy/unused)
- Hardcoded strings (except "ShopForge" as the platform brand name)
- `src/lib/config.ts` (deleted)

The Sidebar receives shop branding via props from the dashboard layout. The branded login page (`/login/[slug]`) fetches by slug. The portal fetches shop info inline with the document response.

## Best-Effort External Integrations

External services (QuickBooks, Stripe, Twilio) are best-effort — never block core operations on their failures.

- QB sync: fire-and-forget `.catch(() => {})` — errors stored in `qb_sync_error` column
- Stripe: payment link creation can fail without blocking invoice creation
- Twilio: SMS send failures logged, never prevent status changes
- Auto-SMS on WO status changes: best-effort, template-driven

## Features

### Work Orders & Estimates
- Full CRUD with labor/parts line items, drag-and-drop kanban
- Estimate workflow: Draft → Sent → Approved → Convert to WO (copies lines)
- WO scheduling: Unscheduled/Scheduled columns, date picker on convert
- Digital vehicle inspections with status grid
- Rich DVI system (see Digital Vehicle Inspections section below)
- Tech time clocking (see Time Clocking section below)
- Purchase orders for parts procurement (see Purchase Orders section below)
- WO activity log, photo attachments
- Inspection quick-nav pill button in WO detail — smooth-scrolls to inspection panel via ref
- Cross-links: customer name, vehicle info, WO#, invoice#, PO# are all clickable to their detail views
- Toast + redirect after creation (WO, invoice, check-in) — auto-opens the new entity's slide-over

### Invoicing & Payments
- Invoice creation from WO (snapshots lines) or standalone
- Stripe payment links (checkout sessions, webhook on payment) — per-shop keys with platform env var fallback
- Text-to-pay via SMS
- Invoice tax rate from shops table
- QB sync error banner on invoice detail — shows `qb_sync_error` with "Retry Sync" button
- Route: `POST /api/invoices/[id]/retry-sync` — clears error, re-calls `syncInvoiceToQB()`, re-checks result

### E-Signatures on Estimates
- Canvas-based signature pad on customer portal (`signature_pad` library)
- Signature stored in Supabase Storage (`signatures/{shop_id}/{estimate_id}.png`)
- Authorization record in `estimate_signatures` table (IP, user-agent, line item snapshot)
- PDF download with embedded signature via `/api/portal/[token]/pdf` (jspdf)
- Staff approve/decline flow unchanged — signature only for customer portal approval

### QuickBooks Online Integration
- OAuth2 connect/disconnect in settings page (per-shop, multi-tenant)
- One-way sync: ShopForge → QB (ShopForge is source of truth)
- Customer sync: dedup by email, create if not found, stores `qb_customer_id`
- Invoice sync: primary trigger on creation (POST), backup on Sent status (PATCH)
- Payment sync: on Paid status (manual mark or Stripe webhook)
- Token auto-refresh via `getAccessToken()` (5-min buffer before expiry)
- Sandbox vs production: `QB_SANDBOX` env var controls API base URL
- Service layer: `src/lib/quickbooks.ts`
- Routes: `/api/quickbooks/connect` (auth), `/api/quickbooks/callback` (unauth), `/api/quickbooks/disconnect` (auth)
- Env vars: `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_SANDBOX`

### Two-Way SMS
- Inbound webhook (`/api/twilio/webhook`) — signature-validated
- Conversation UI on `/messages` page
- Auto-SMS on WO status changes (template-driven, per-shop settings)
- Text-to-pay links via SMS
- Estimate SMS: "Text to Customer" button on estimates page sends portal link via `/api/estimates/[id]/share`
- Service reminder SMS: auto-sends when reminders come due (triggered on dashboard load)
  - Template-driven via `sms_auto_templates['Service Reminder']` on shops table
  - Variables: `{{shop_name}}`, `{{customer_name}}`, `{{service_type}}`, `{{due_date}}`, `{{shop_phone}}`
  - Route: `POST /api/service-reminders/send-due` — sends to all pending reminders with `due_date <= today`, marks as 'Sent'
  - Toggleable in Settings → Notifications tab
- Estimate approval notification: optional SMS to shop phone on customer approval (toggleable via `sms_auto_templates`)

### Digital Vehicle Inspections (DVI)
- `inspection_item_media` table: photos/videos per inspection item with `url`, `annotated_url`, `media_type`
- Storage bucket: `inspection-media` (namespaced `{shop_id}/inspections/{item_id}/...`)
- Photo capture with `capture="environment"` for rear camera on mobile
- Canvas-based `PhotoAnnotator` component: freehand, circle, arrow, text tools (red #EF4444)
  - Image loaded via `fetch()` → blob → `URL.createObjectURL()` to avoid CORS canvas tainting
  - Drawing state in refs (not React state) for real-time performance
  - Exports annotated image at full resolution with stroke scaling
- Customer-facing DVI report at `/portal/inspection/[token]` (unauthenticated, uses `createAdminClient()`)
  - Items grouped by severity (Needs Attention → Failed → Passed)
  - Photo lightbox, approve-to-estimate flow with checkboxes
  - Approval behavior controlled by `dvi_estimate_auto_send` setting (default: true):
    - **autoSend ON**: Creates Sent estimate + auto-sends SMS with estimate portal link + creates notification "Estimate created and sent"
    - **autoSend OFF**: Creates Draft estimate + creates notification "Draft estimate created — review and send to customer"
  - Collapses DVI → estimate into a single customer approval step (no more double-approval)
- Auto-send DVI report: `dvi_auto_send` toggle on shops table, `dvi_report_sent` boolean on inspections table
  - When all items are checked and actionable items exist, auto-sends DVI link via SMS (best-effort)
  - `dvi_report_sent` guard prevents re-sending on subsequent item updates
- Quick Inspection shortcut: `QuickInspectionModal` on work orders page
  - Customer search + vehicle picker → creates WO with "Vehicle Inspection" job → starts inspection
- Routes: `/api/work-orders/[id]/inspection` (GET/POST/PATCH), `/api/work-orders/[id]/inspection/media` (POST/PATCH/DELETE), `/api/work-orders/[id]/inspection/share` (POST), `/api/portal/inspection/[token]` (GET), `/api/portal/inspection/[token]/approve` (POST)

### Tech Time Clocking
- `time_entries` table: `tech_id`, `type` ('shift'|'job'), `work_order_id`, `clock_in`, `clock_out`, `duration_minutes`
- Partial index `idx_time_entries_active` on `(tech_id, clock_out) WHERE clock_out IS NULL` for fast active-entry lookups
- Shift clock in/out: one active shift per tech (409 on double clock-in)
- Job timers: per work order, prevents duplicate active timer on same WO
- `/time-clock` page: tech cards with live shift timers, active job timers, today's hours summary, full time log
  - Assigned jobs section on tech cards: shows tech's WOs with "Start Timer" buttons
  - Job timer start/stop accessible directly from time clock page (not just WO detail)
  - Clock-out confirmation modal: warns if active job timers exist, offers to auto-stop them
  - Time entry editing: inline time inputs on completed entries, save/cancel buttons
  - PATCH `/api/time-clock/[id]` accepts `clock_in` edits, recalculates `duration_minutes`, validates `clock_in < clock_out` (400 on invalid)
- WO detail: time tracking section with start/stop job timer, completed entries list, actual vs billed hours comparison
- Dashboard: green/gray clock status dot on tech avatars in dispatch board (fetches active shifts)
- Routes: `/api/time-clock` (GET/POST), `/api/time-clock/[id]` (PATCH), `/api/time-clock/summary` (GET), `/api/work-orders/[id]/time` (GET)

### Inspections UX
- Multi-photo upload: file input with `multiple` attribute, handler loops through files
- "Mark All Pass" button: sets all `not_checked` items to `pass` in single API call, with confirmation count
- Inspection quick-nav: pill button at top of WO detail, smooth-scrolls to inspection section via `scrollIntoView`

### Customer Portal
- Token-based access (no auth required)
- Estimate approval with e-signature
- Invoice viewing
- DVI report viewing and approve-to-estimate
- PDF download

### Online Booking
- Public booking page at `/book/[slug]` (unauthenticated, uses `createAdminClient()`)
- Multi-step form: service selection → date/time picker → customer info → confirmation
- Availability API prevents double-booking (checks existing appointments for time conflicts)
- Customer matching uses `normalizePhone()` from `src/lib/phone.ts` for phone dedup
- Creates customer if not found, optionally creates vehicle record
- Sends confirmation SMS via Twilio (best-effort)
- Creates dashboard notification for shop staff
- Appointments have `source` column: 'manual' (default) or 'online'
- Per-shop settings: `online_booking_enabled`, `booking_lead_hours`, `booking_window_days`
- Canned jobs have `bookable` (bool) and `duration_minutes` (int) columns
- Settings UI: toggle booking on/off, configure lead time/window, mark services as bookable
- Routes: `/api/book/[slug]` (POST), `/api/book/[slug]/services` (GET), `/api/book/[slug]/availability` (GET)
- Middleware skips auth for `/book/*` and `/api/book/*`
- Slot increment is fixed at 30 minutes (`booking_slot_duration` DB column exists but is unused — removed from app code)
- Server-side enforcement: both availability and submission routes reject past dates and dates beyond `booking_window_days`
- Spam protection: max 5 online bookings per phone number per day (uses `normalizePhone()`, returns 429)
- Unassigned bookings: scheduling page shows amber banner for appointments with no `tech_id`, with inline tech assignment dropdowns
- "WEB" badge on calendar blocks and "Online Booking" badge in detail modal for `source: 'online'` appointments
- Detail modal shows tech assignment dropdown (instead of "Unassigned" text) for unassigned appointments

### Multi-Tenant Provisioning
- Admin endpoint: `POST /api/admin/provision-shop` (x-admin-key auth)
- Creates shop → auth user → user_shops mapping
- Branded login pages per shop (`/login/[slug]`)

### Purchase Orders
- `vendors` table: name, contact info, account number, notes, active flag (soft-delete)
- `purchase_orders` table: display_id (PO-5001+), vendor_id, work_order_id (nullable), status, notes, ordered_at, received_at
- `po_lines` table: name, part_number, qty_ordered, qty_received, unit_cost, wo_parts_line_id (links PO line → WO part)
- Status lifecycle: draft → ordered → partially_received → received (auto-computed on receive); any → cancelled
- `wo_parts_lines.unit_cost` column: cost tracking (what shop paid vs `price` which is what customer pays)
- Receiving: POST `/api/purchase-orders/[id]/receive` with per-line qty updates; auto-syncs unit_cost to linked WO parts
- WO integration: "Order Parts" button in RODetail creates Draft PO pre-filled with WO parts; linked POs shown below parts table
- PO list page: `/purchase-orders` with status tabs, vendor filter, search; SlideOver for detail/edit/receive
- Vendor management: Settings page "Vendors" section (add/edit/deactivate)
- `next_po_id(p_shop_id)` function: per-shop sequential, seed 5000
- Routes: `/api/vendors` (GET/POST), `/api/vendors/[id]` (GET/PATCH/DELETE), `/api/purchase-orders` (GET/POST), `/api/purchase-orders/[id]` (GET/PATCH/DELETE), `/api/purchase-orders/[id]/receive` (POST), `/api/work-orders/[id]/purchase-orders` (GET)
- Migration: `009_purchase_orders.sql`

### Margin Reports
- `/reports` page: profitability analytics with date range filtering (presets: Today, This Week, This Month, Last Month, Quarter, YTD + custom)
- Revenue Summary: 8 KPI cards (total, labor, parts, tax, invoice count, avg ticket, paid, outstanding)
- Revenue Trend: CSS bar chart (last 6 months, no chart library)
- Labor Profitability: per-tech table (billed hours, actual hours, efficiency %, revenue, $/actual hr)
- Parts Margin: total KPIs + table by job (WO#, job, revenue, cost, profit, margin %)
- Job Profitability: table (WO#, job, customer, labor rev, parts rev, total rev, parts cost, parts profit)
- Top Services + Shop Status cards
- CSV export for all data sections
- API: `GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Maintains dashboard backward compatibility (revenue_this_month, tech_hours, monthly_revenue, parts_margin)
- Contextual hints when time clock or cost data is missing

### Parts Inventory Vendor Link
- `parts_inventory.vendor_id` nullable FK to `vendors` table
- Inventory UI: vendor dropdown in add/edit modal, vendor column in table
- Migration: `010_inventory_vendor.sql`

### PartsTech Integration
- Per-shop credentials in `shops` table
- Service layer: `src/lib/partstech.ts` (stubbed — swap for real API when partner access granted)
- WO parts lines have `source` ('manual'|'inventory'|'partstech'), `part_number`, `brand`

### License Plate Lookup
- `plate_lookups` cache table: stores plate+state→VIN/year/make/model results (30-day TTL, multi-tenant)
- `shops.plate_lookup_api_key`: per-shop API key override; falls back to `PLATE_LOOKUP_API_KEY` env var (platform-level)
- Provider: PlateToVIN (`https://platetovin.net/api/convert`) — $0.05/lookup
- Rate limit: 100 lookups/day per shop
- `PlateInput` component: reusable plate+state input with lookup button, mirrors `VinInput` pattern
- Available on Customers page "Add Vehicle" form (auto-fills year, make, model, VIN)
- `plate_lookup_api_key` is in SENSITIVE_FIELDS (masked in GET /api/settings)
- Settings UI: "Plate Lookup (PlateToVIN)" section under integrations with optional API key override
- Route: `POST /api/vehicles/plate-lookup` (plate, state → vin, year, make, model)
- Migration: `011_plate_lookup.sql`

### CSV Data Import & Export
- `/import` page: 4-step wizard (select type → upload & map columns → validate → import results)
- Three import types: Customers, Vehicles, Parts Inventory
- Column mapping: auto-detects CSV headers using fuzzy alias matching, manual override via dropdowns
- CSV parser: client-side, handles quoted fields and commas in values
- Dedup:
  - Customers: match by normalized phone (via `normalizePhone()`), then email. User chooses "skip" or "update existing"
  - Vehicles: match by VIN (skip dupes). Customer matching by name then email (unmatched rows skipped)
  - Parts: match by part_number. User chooses "skip" or "update existing"
- Validation: shows valid/invalid row counts, issues table, preview of mapped data
- Bulk insert via Supabase `.insert([])` — all records get `shop_id` from RLS/trigger
- Import routes: `POST /api/import/customers`, `POST /api/import/vehicles`, `POST /api/import/parts-inventory`
- Import sanitization: all string fields run through `sanitizeImport()` (`src/lib/csv.ts`) before DB write to strip formula injection chars (`=`, `+`, `-`, `@`, tab)
- CSV export: 3 GET routes return `text/csv` attachments, RLS-scoped, `.range(0, 49999)` to avoid Supabase 1,000-row default cap
  - `GET /api/export/customers` — name, phone, email, address, city, state, zip, tags, created_at
  - `GET /api/export/vehicles` — customer name (join), year, make, model, VIN, plate, mileage
  - `GET /api/export/parts-inventory` — name, part_number, category, qty_on_hand, cost, price, vendor name (join), active
- CSV formula sanitization: `csvCell()` in `src/lib/csv.ts` prepends `'` to values starting with `=`, `+`, `-`, `@`, or tab. Used by export routes and reports CSV export (`esc()` in `reports/page.tsx`)
- Accessible via Settings → Import / Export Data tab (not a standalone sidebar item)

### Global Search
- Unified search endpoint: `GET /api/search?q=` — queries customers, vehicles, work orders, invoices, estimates, purchase orders in parallel
- Returns `{ type, id, display_id?, label, subtitle, customer_id? }` per result, RLS-scoped
- Topbar search input: 300ms debounce, 2-character minimum, Cmd+K keyboard shortcut to focus
- Results dropdown: grouped by entity type (`RESULT_GROUPS` map), clickable to navigate to detail views
- Customers: searched by name, phone, email (ILIKE)
- Vehicles: searched by plate, VIN, make, model (ILIKE), deduplicated across two queries
- Work Orders: searched by display_id, job (ILIKE), with customer name join
- Invoices: searched by display_id (ILIKE), with customer name join
- Estimates: searched by display_id (ILIKE), with customer name join
- Purchase Orders: searched by display_id (ILIKE), with vendor name join
- Each entity type limited to 5 results

### Notification System
- `notifications` table: work_order_id, appointment_id, customer_id, type, channel, message, status, sent_at, read_at
- Notification bell in topbar with unread count badge (red dot, "9+" max display)
- Dropdown panel: shows all notifications, "Mark all read" button, relative timestamps via `timeAgo()`
- 30-second polling interval for new notifications
- `GET /api/notifications` — supports `?unread=true` filter
- `PATCH /api/notifications` — accepts `{ ids: string[] }` to mark as read
- Notifications created for: estimate approvals, online bookings, DVI approvals, WO status changes

### Canned Jobs (Service Templates)
- Full labor and parts line editing in Settings → Team & Services tab
- `canned_jobs` table stores `labor_lines` and `parts_lines` as JSONB arrays
- Labor lines: description, hours, rate (per line)
- Parts lines: name, qty, price (per line)
- When canned job selected on WO, auto-populates labor and parts lines from template
- Quick-add suggestions during setup wizard: Oil Change, Brake Pad Replacement, Tire Rotation, etc.
- Routes: `/api/canned-jobs` (GET/POST), `/api/canned-jobs/[id]` (GET/PATCH/DELETE)

### Settings Organization
- 6-tab layout: Profile, Team & Services, Integrations, Notifications, Booking, Import / Export Data
- Tab navigation via `?tab=xxx` query params (default: 'profile')
- **Profile**: shop name, address, phone, email, owner info, logo, labor rate, tax rate, hours, WO/invoice prefixes, invoice footer
- **Team & Services**: technicians (CRUD with color picker), canned jobs with labor/parts line editors, vendors
- **Integrations**: Twilio, Stripe, Resend, QuickBooks, PartsTech, Plate Lookup
- **Notifications**: auto-SMS toggles per WO status, estimate approval alert, DVI auto-send estimates toggle, service reminder SMS toggle
- **Booking**: online booking on/off, lead time, booking window, bookable services
- **Import / Export Data**: CSV import wizard (dynamically loaded) + export data section with 3 download buttons (customers, vehicles, parts inventory)

### First-Run Setup Wizard
- `SetupWizard` component (`src/components/SetupWizard.tsx`)
- 5 steps: Shop Info → Rates & Hours → Add Techs → Add Services → (optional) Integrations
- Shows when `setup_completed_at` is null AND no techs AND no canned jobs (DB-backed, per-shop)
- Uses existing APIs: `PATCH /api/settings`, `POST /api/techs`, `POST /api/canned-jobs`
- On completion/dismiss: PATCHes `setup_completed_at` timestamp on shops table
- Color picker for techs, skip buttons per step
- Quick-add service suggestions with pre-filled labor/parts

### Dashboard Completion Checklist
- Shows when `setup_completed_at` is set but not all items are complete
- 5 checks: shop name & phone, labor rate, at least 1 tech, at least 1 service template, SMS or payments connected
- Progress bar with done count, links to relevant settings tabs
- Dismissible via X button

### Sidebar Navigation
- Grouped into sections with uppercase labels: Operations, Customers, Financial
- **Operations**: Dashboard, Work Orders, Estimates, Scheduling, Time Clock
- **Customers**: Customers, Messages
- **Financial**: Invoicing, Parts (links to `/inventory`), Reports
- Settings below a divider (not in a group)
- `NAV_GROUPS` / `NavGroup` / `NavItem` interfaces in `Sidebar.tsx`
- `NavItem.icon` uses `readonly string[]` (matches `icons.*` type from Icon component)
- `matchPaths` support: Parts nav item highlights on both `/inventory` and `/purchase-orders`
- Parts tab bar: both `/inventory` and `/purchase-orders` pages show a tab bar at the top for cross-navigation
- Import removed from sidebar — accessible via Settings → Import Data tab

### PO Receiving → Inventory Sync
- `/api/purchase-orders/[id]/receive` auto-updates `parts_inventory.qty_on_hand`
- Matches received PO lines to inventory by name or part_number
- Increments `qty_on_hand` by received quantity

### Dashboard KPI Cards
- 4 stat cards: Open Work Orders, Monthly Revenue, Vehicles In Shop, Parts Low Stock
- All clickable — link to relevant pages with appropriate filters
- Expandable full-screen view with larger display

### Service Reminders Dashboard Widget
- Shows reminders due within 7 days, split into overdue (red) and due-this-week (amber) sections
- Each item links to the customer detail page (`/customers?open={customer_id}`)
- Conditionally rendered (hidden when no reminders are due)
- Auto-sends SMS for due reminders on dashboard load (fire-and-forget POST to `/api/service-reminders/send-due`)

### Dashboard Activity Feed
- "Recent Activity" card showing last 20 entries from `wo_activity_log` across all work orders
- `GET /api/activity` — queries `wo_activity_log` with `work_orders(id, display_id)` join, ordered by `created_at` desc
- Each entry is clickable, links to the WO detail
- Shows WO display_id, action text, details, and relative timestamp
- RLS-scoped — only shows activity for the current shop

### Vehicle Mileage History
- Customer detail page: vehicle cards show mileage history from work orders
- Filters service history WOs by vehicle and non-null `mileage_in` or `mileage_out`
- Shows up to 5 most recent entries: date, WO display_id, mileage_in → mileage_out
- Sorted by `created_at` descending

### Customer Tags
- Tags: Fleet, VIP, Wholesale, Insurance, Warranty, Problem
- `CUSTOMER_TAGS` constant and `TAG_COLORS` map with per-tag bg/text/border colors
- Visible in customer list table, editable on customer detail
- Defined in `src/lib/types.ts`

### Estimate SMS
- "Text to Customer" / "Text Again" buttons on estimates page
- Route: `POST /api/estimates/[id]/share` — fetches estimate, builds portal URL, sends SMS via `/api/send-sms`
- SMS success banner, `smsSending`/`smsSent` state tracking

## UX Overhaul — Completed Fixes (2026-03-12)

Systematic 5-wave UX overhaul completed. Each wave's fixes are documented below.

### Wave 1: Critical Data Flow + Dead Ends
1. **PO receiving → inventory sync** — receiving parts now auto-updates `parts_inventory.qty_on_hand`
2. **Global search** — unified `/api/search?q=` endpoint + topbar search with debounce, 2-char min, Cmd+K, grouped results dropdown
3. **Cross-links everywhere** — customer names, WO#s, invoice#s, PO#s all clickable to detail views
4. **Toast + redirect after creation** — WO created → auto-open detail; invoice generated → auto-open; check-in → redirect
5. **Dashboard KPIs clickable** — stat cards link to filtered views
6. **Import moved into Settings** — accessible via Settings → Import Data tab, removed from sidebar

### Wave 2: Service Templates + Notifications
1. **Canned jobs labor/parts** — full line item editors in Settings, auto-populate WO lines on template selection
2. **Notification bell** — topbar bell icon with unread count, 30s polling, mark-all-read, dropdown panel
3. **Estimate approval notification** — creates notification + optional SMS to shop on portal approval
4. **Estimate SMS** — "Text to Customer" button sends portal link via Twilio

### Wave 3: Workflow Improvements
1. **DVI double-approval fix** — `dvi_estimate_auto_send` setting controls whether DVI approval creates Sent estimate (auto-SMS) or Draft (notify shop). Collapses to single approval step.
2. **Settings tabs** — restructured from single scroll page to 6 tabs (Profile, Team & Services, Integrations, Notifications, Booking, Import Data)
3. **First-run setup wizard** — 5-step guided onboarding, DB-backed via `setup_completed_at` on shops table, completion checklist on dashboard
4. **Sidebar restructure** — grouped sections (Operations, Customers, Financial) with labels, Parts consolidation via tab bars, Import removed

### Wave 4: Time Clock + Tech Experience
1. **Assigned jobs on tech cards** — time clock page shows tech's WOs with Start Timer buttons
2. **Job timer controls** — start/stop timers accessible from time clock page (not just WO detail)
3. **Clock-out warning** — confirmation modal when active job timers exist on clock-out
4. **Time entry editing** — inline clock_in/clock_out editing with validation (`clock_in < clock_out`), duration recalculation
5. **Mark All Pass** — batch button on inspection panel for unchecked items
6. **Inspection quick-nav** — pill button at top of WO detail, smooth-scrolls to inspection section

### Wave 5: Data Surfacing
1. **Service reminders widget** — dashboard card showing overdue/due-this-week reminders + auto-SMS on load
2. **QB sync error visibility** — red banner on invoice detail with error message + "Retry Sync" button
3. **Vehicle mileage history** — customer detail vehicle cards show mileage readings from WOs
4. **Dashboard activity feed** — "Recent Activity" card with last 20 entries from `wo_activity_log`

## Remaining Known Issues

These issues remain after the 5-wave UX overhaul.

### Scheduling
- No drag-and-drop for rescheduling. Must delete and recreate appointments.
- Week view only. No month or day view.
- No tech availability display (vacations, off days).

### Invoicing
- Tax rate not editable per invoice. Must use shop-wide setting.
- No partial payment support. Invoice is either Paid or not.
- Stripe payment link expiration not handled (no regeneration flow).
- No batch invoicing — "Generate Invoice" only in WO detail, not on kanban cards.

### Inventory
- No qty adjustment UI outside full-edit modal. No "Receive parts" shortcut.
- No inventory history / audit trail (who changed qty, when).
- No barcode scanning.
- Low stock alerts exist but don't suggest PO creation.

### Reports
- No chart interactivity (CSS bars only, can't drill into a month).
- No forecasting or goal tracking.

### Import/Export
- No undo after import (must manually delete or re-import with update mode).
- No file size validation (could hang on large CSVs).

### Messages (SMS)
- No SMS character count warning (Twilio 160-char limit).
- No delivery status indicators.
- No message templates for common responses.

### Online Booking
- No real-time availability conflict detection (stale slots can be booked between page load and submit).
- Confirmation SMS sent but no confirmation visible in UI.

### Customer Management
- Can't edit vehicle details once created (only delete and re-add).
- No bulk communication (email/SMS to all customers with overdue reminders).

### Work Orders
- WO detail slide-over sections could benefit from a tabbed layout (Details | Inspection | Time | Activity) instead of a long scroll.
- `valid_until` on estimates not enforced — expired estimates can still be approved.
- No "Save & Invoice" one-click on WO completion.

### Time Clock
- No break tracking. Shift hours include all time clocked in. No unpaid break support.
- No time entry audit trail (edit history).

### Data Visibility Gaps
- `plate_lookups` cache: no visibility into cache hits/misses or quota usage in UI.
- No mileage-based service reminder triggers (mileage history displayed but not used for automation).
- Page-level search gaps: WO search is client-side only (won't scale), Messages loads 2000 into memory, Inventory search doesn't cover vendor name.

## Post-Wave Review Fixes (2026-03-13)

Deep code review of all 5 waves identified 20 issues. Items 1-13 fixed, 14-20 remain as low-priority backlog.

### Completed — Critical

1. **Booking tab settings now save** — `settings/page.tsx`
   - Save button renders for both `profile` and `booking` tabs.

2. **Notification bell items clickable** — `Topbar.tsx`
   - Added `getNotificationHref()` route mapper + `handleNotifClick()` for per-item navigation and mark-as-read. Notifications changed from `<div>` to `<button>`.

3. **Dashboard "Vehicles In Shop" KPI filter works** — `work-orders/page.tsx`
   - Added `searchParams.get('status')` handling + status filter dropdown in toolbar.

### Completed — High

4. **WO linked POs now clickable** — `work-orders/page.tsx`
   - PO `display_id` wrapped in `<Link href={'/purchase-orders?open=${po.id}'}}>`.

5. **QB retry-sync: banner correctly persists on failure** — `invoicing/page.tsx`
   - Already correct — `qb_sync_error` clear was inside `res.ok` block. No change needed.

6. **Server-side guard on editing running time entries** — `time-clock/[id]/route.ts`
   - PATCH returns 400 if entry has no `clock_out` and body edits `clock_in`/`notes` without clocking out.

### Completed — Medium

7. **Service reminder SMS race condition fixed** — `send-due/route.ts`
   - Replaced SELECT+UPDATE with atomic UPDATE...WHERE claim pattern. Failed sends revert to 'Pending'.

8. **Search: SQL wildcards sanitized** — `search/route.ts`
   - `%`, `_`, `\` escaped before ILIKE interpolation. Known remaining concern: commas in search input can still break PostgREST `.or()` filter parsing.

9. **PO receive: atomic inventory update** — `receive/route.ts`
   - Replaced read-modify-write with `supabase.rpc('increment_inventory_qty')`. Migration `014_post_wave_fixes.sql` adds the RPC function.

10. **Time clock: 5-second timer tick** — `time-clock/page.tsx`
    - `setInterval` reduced from 30s to 5s.

11. **Clock-out: parallel job stop with error handling** — `time-clock/page.tsx`
    - Replaced sequential `for...of` with `Promise.allSettled` + alert on failures.

12. **Booking tab copy fixed** — `settings/page.tsx`
    - Changed "in the Service Templates section above" → "in the Team & Services tab".

13. **Pre-existing shops backfilled** — migration `014_post_wave_fixes.sql`
    - Added `setup_completed_at` and `dvi_estimate_auto_send` columns to `shops`. Backfilled `setup_completed_at` for shops with existing techs + canned jobs.

### Per-Shop Stripe Credentials
- `stripe_secret_key`, `stripe_publishable_key`, `stripe_webhook_secret` columns on `shops` table (nullable)
- Per-shop keys take priority; falls back to platform env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) with console warning
- `src/lib/stripe.ts`: `getStripeClient(key)` factory with instance cache, `resolveStripeKey(shopKey)` helper
- Payment link route (`/api/invoices/[id]/payment-link`): fetches shop's `stripe_secret_key`, creates per-shop Stripe client
- Webhook route (`/api/stripe/webhook`): pre-parses payload to extract `invoice_id` → looks up shop → uses per-shop `stripe_webhook_secret` for signature verification
- Settings UI: 3 fields (secret key, publishable key, webhook secret) + Test Connection button (calls `stripe.accounts.retrieve()`)
- Test endpoint: `POST /api/integrations/test` with `service: 'stripe'`
- Migration: `015_stripe_per_shop.sql`

### Low (nice to have)

14. **Mark All Pass: no optimistic UI update** — `InspectionPanel.tsx:292`
    - Unlike single-item status changes, "Mark All Pass" waits for server re-fetch (`fetchInspection()`) before updating UI. Could feel sluggish with many items.

15. **Notification bell: flat list, no grouping** — `Topbar.tsx:324-339`
    - Chronological flat list. Grouping by day (Today / Earlier) or by type would improve scannability.

16. **QB sync errors + service reminders don't create notification rows** — `quickbooks.ts`, `send-due/route.ts`
    - Bell has blind spots for these events. QB sync failures store error on invoice but never INSERT into `notifications` table. Service reminder sends are silent in the bell.

17. **Vendors not in global search** — `search/route.ts`
    - Searching for a vendor name to find associated POs is a plausible user workflow. Currently only 6 entity types are searched.

18. **Inspection jump button always visible** — `work-orders/page.tsx:1014-1022`
    - Pill button renders on every WO detail regardless of whether an inspection exists. Could confuse users into thinking an inspection is already started.

19. **Time clock page doesn't poll for WO reassignment** — `time-clock/page.tsx:33-44`
    - Assigned jobs list on tech cards is stale until next clock action. No polling or real-time subscription for WO reassignment changes.

20. **Inventory name fallback is exact match** — `receive/route.ts:82`
    - PO receive inventory sync uses `ilike` for name matching — exact case-insensitive, not fuzzy. Slightly different naming conventions between PO line and inventory item will miss.

## Stack

- Next.js 14 (App Router, TypeScript), Tailwind CSS 3
- Supabase (Postgres + Auth + RLS + Storage)
- Stripe (payment links, webhooks)
- Twilio (SMS)
- QuickBooks Online (OAuth2, REST API)
- Deployed on Vercel — production domain: `app.refit.build`

## Deploy

```
npm_config_cache=/tmp/npm-cache2 npx vercel deploy --prod --yes
```
