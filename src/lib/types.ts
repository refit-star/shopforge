export interface Tech {
  id: string;
  name: string;
  color: string;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  tags?: string[];
  created_at: string;
  // computed
  vehicle_count?: number;
  last_visit?: string | null;
  total_spend?: number;
}

export const CUSTOMER_TAGS = ['Fleet', 'VIP', 'Wholesale', 'Insurance', 'Warranty', 'Problem'] as const;
export type CustomerTag = typeof CUSTOMER_TAGS[number];

export const TAG_COLORS: Record<CustomerTag, { bg: string; text: string; border: string }> = {
  Fleet:     { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30' },
  VIP:       { bg: 'bg-purple-500/15',  text: 'text-purple-400',  border: 'border-purple-500/30' },
  Wholesale: { bg: 'bg-green-500/15',   text: 'text-green-400',   border: 'border-green-500/30' },
  Insurance: { bg: 'bg-orange-500/15',  text: 'text-orange-400',  border: 'border-orange-500/30' },
  Warranty:  { bg: 'bg-teal-500/15',    text: 'text-teal-400',    border: 'border-teal-500/30' },
  Problem:   { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30' },
};

export interface Vehicle {
  id: string;
  customer_id: string;
  year: number | null;
  make: string;
  model: string;
  vin: string | null;
  mileage: number | null;
  plate: string | null;
}

export type WOStatus = 'Unscheduled' | 'Scheduled' | 'Check-In' | 'In Progress' | 'Waiting on Parts' | 'Ready for Pickup' | 'Completed';
export type Priority = 'low' | 'medium' | 'high';

export interface LaborLine {
  id?: string;
  description: string;
  hours: number;
  rate: number;
  sort_order?: number;
}

export interface PartsLine {
  id?: string;
  name: string;
  qty: number;
  price: number;
  sort_order?: number;
  source?: 'manual' | 'inventory' | 'partstech';
  part_number?: string;
  brand?: string;
}

export interface WorkOrder {
  id: string;
  display_id: string;
  customer_id: string;
  vehicle_id: string;
  tech_id: string | null;
  job: string;
  status: WOStatus;
  priority: Priority;
  notes: string | null;
  mileage_in: number | null;
  mileage_out: number | null;
  created_at: string;
  updated_at: string;
  // joined
  customer?: Customer;
  vehicle?: Vehicle;
  tech?: Tech;
  labor_lines?: LaborLine[];
  parts_lines?: PartsLine[];
  // computed
  labor_total?: number;
  parts_total?: number;
  estimated_total?: number;
  labor_hours?: number;
  scheduled_date?: string | null;
}

export interface Appointment {
  id: string;
  customer_id: string;
  vehicle_id: string | null;
  tech_id: string | null;
  job: string;
  start_time: string;
  duration_minutes: number;
  notes: string | null;
  source: 'manual' | 'online';
  // joined
  customer?: Customer;
  vehicle?: Vehicle;
  tech?: Tech;
  // reminder
  has_reminder?: boolean;
  reminder?: Notification | null;
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Void';

export interface Invoice {
  id: string;
  display_id: string;
  work_order_id: string | null;
  customer_id: string;
  vehicle_id: string | null;
  status: InvoiceStatus;
  labor_total: number;
  parts_total: number;
  tax: number;
  total: number;
  payment_method: string | null;
  stripe_payment_intent_id: string | null;
  stripe_payment_link: string | null;
  paid_at: string | null;
  qb_invoice_id: string | null;
  qb_sync_error: string | null;
  created_at: string;
  // joined
  customer?: Customer;
  vehicle?: Vehicle;
  labor_lines?: LaborLine[];
  parts_lines?: PartsLine[];
}

export const WO_STATUSES: WOStatus[] = ['Unscheduled', 'Scheduled', 'Check-In', 'In Progress', 'Waiting on Parts', 'Ready for Pickup', 'Completed'];
export const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
export const INVOICE_STATUSES: InvoiceStatus[] = ['Draft', 'Sent', 'Paid', 'Overdue', 'Void'];

export const STATUS_COLORS: Record<string, string> = {
  'Unscheduled': '#64748b',
  'Scheduled': '#8b5cf6',
  'Check-In': '#3b82f6',
  'In Progress': '#f97316',
  'Waiting on Parts': '#fbbf24',
  'Ready for Pickup': '#22c55e',
  'Completed': '#64748b',
  'Draft': '#64748b',
  'Sent': '#3b82f6',
  'Paid': '#22c55e',
  'Overdue': '#ef4444',
  'Void': '#64748b',
  'Ordered': '#3b82f6',
  'Partial': '#f59e0b',
  'Received': '#22c55e',
  'Cancelled': '#ef4444',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  high: '#ef4444',
  medium: '#fbbf24',
  low: '#22c55e',
};

export type EstimateStatus = 'Draft' | 'Sent' | 'Approved' | 'Declined';

export interface Estimate {
  id: string;
  display_id: string;
  customer_id: string;
  vehicle_id: string;
  job: string;
  notes: string | null;
  status: EstimateStatus;
  valid_until: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  vehicle?: Vehicle;
  labor_lines?: LaborLine[];
  parts_lines?: PartsLine[];
  labor_total?: number;
  parts_total?: number;
  estimated_total?: number;
}

export const ESTIMATE_STATUSES: EstimateStatus[] = ['Draft', 'Sent', 'Approved', 'Declined'];

export interface CannedJob {
  id: string;
  name: string;
  description: string | null;
  labor_lines: LaborLine[];
  parts_lines: PartsLine[];
  active: boolean;
  bookable: boolean;
  duration_minutes: number;
}

export interface PartInventory {
  id: string;
  name: string;
  part_number: string | null;
  category: string | null;
  qty_on_hand: number;
  cost: number;
  price: number;
  min_stock: number;
  active: boolean;
  vendor_id: string | null;
  created_at: string;
  // joined
  vendor?: { id: string; name: string } | null;
}

export interface WOPhoto {
  id: string;
  work_order_id: string;
  url: string;
  caption: string | null;
  created_at: string;
}

export interface ServiceReminder {
  id: string;
  vehicle_id: string;
  customer_id: string;
  service_type: string;
  due_date: string | null;
  due_mileage: number | null;
  status: 'Pending' | 'Sent' | 'Completed' | 'Dismissed';
  created_at: string;
  vehicle?: Vehicle;
  customer?: Customer;
}

export type InspectionStatus = 'pass' | 'fail' | 'attention' | 'not_checked';

export interface InspectionItemMedia {
  id: string;
  inspection_item_id: string;
  url: string;
  annotated_url: string | null;
  media_type: 'image' | 'video';
  sort_order: number;
  created_at: string;
}

export interface InspectionItem {
  id: string;
  inspection_id: string;
  category: string;
  item: string;
  status: InspectionStatus;
  notes: string | null;
  sort_order: number;
  media?: InspectionItemMedia[];
}

export interface Inspection {
  id: string;
  work_order_id: string;
  created_at: string;
  items: InspectionItem[];
}

export const INSPECTION_CATEGORIES: Record<string, string[]> = {
  'Brakes': ['Front pads', 'Rear pads', 'Rotors', 'Brake fluid', 'Brake lines'],
  'Tires': ['Front left', 'Front right', 'Rear left', 'Rear right', 'Tire pressure', 'Tread depth'],
  'Fluids': ['Engine oil', 'Coolant', 'Transmission fluid', 'Power steering', 'Windshield washer'],
  'Electrical': ['Battery', 'Alternator', 'Headlights', 'Tail lights', 'Turn signals', 'Wipers'],
  'Suspension': ['Shocks/Struts', 'Ball joints', 'Tie rods', 'CV boots'],
  'Under Hood': ['Air filter', 'Belts', 'Hoses', 'Spark plugs'],
  'Exhaust': ['Exhaust system', 'Catalytic converter', 'Muffler'],
};

export type TimeEntryType = 'shift' | 'job';

export interface TimeEntry {
  id: string;
  tech_id: string;
  type: TimeEntryType;
  work_order_id: string | null;
  clock_in: string;
  clock_out: string | null;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
  // joined
  tech?: Tech;
  work_order?: { id: string; display_id: string; job: string };
}

export interface Vendor {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  account_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type POStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

export const PO_STATUSES: POStatus[] = ['draft', 'ordered', 'partially_received', 'received', 'cancelled'];

export const PO_STATUS_COLORS: Record<POStatus, string> = {
  draft: '#64748b',
  ordered: '#3b82f6',
  partially_received: '#f59e0b',
  received: '#22c55e',
  cancelled: '#ef4444',
};

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  partially_received: 'Partial',
  received: 'Received',
  cancelled: 'Cancelled',
};

export interface POLine {
  id?: string;
  name: string;
  part_number: string | null;
  qty_ordered: number;
  qty_received: number;
  unit_cost: number;
  sort_order?: number;
  wo_parts_line_id?: string | null;
}

export interface PurchaseOrder {
  id: string;
  display_id: string;
  vendor_id: string | null;
  work_order_id: string | null;
  status: POStatus;
  notes: string | null;
  ordered_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  vendor?: Vendor;
  work_order?: { id: string; display_id: string; job: string };
  lines?: POLine[];
  // computed
  line_count?: number;
  total_cost?: number;
}

export interface WOActivity {
  id: string;
  work_order_id: string;
  action: string;
  details: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  work_order_id: string | null;
  appointment_id: string | null;
  customer_id: string;
  type: string;
  channel: string;
  message: string;
  status: string;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  customer?: Customer;
}

export interface SmsMessage {
  id: string;
  shop_id: string;
  customer_id: string | null;
  direction: 'inbound' | 'outbound';
  phone_number: string;
  body: string;
  twilio_message_sid: string | null;
  created_at: string;
  customer?: Customer;
}

export interface ShopSettings {
  shop_name: string;
  address: string;
  phone: string;
  email: string;
  owner_name: string;
  owner_initials: string;
  default_labor_rate: number;
  tax_rate: number;
  hours_start: number;
  hours_end: number;
  invoice_footer: string;
  wo_prefix: string;
  invoice_prefix: string;
  logo_url: string | null;
  resend_api_key: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
  stripe_secret_key: string | null;
  stripe_publishable_key: string | null;
  stripe_webhook_secret: string | null;
  partstech_username: string | null;
  partstech_api_key: string | null;
  sms_auto_templates: Record<string, { enabled: boolean; template: string }> | null;
  text_to_pay_enabled: boolean;
  dvi_auto_send: boolean;
  dvi_estimate_auto_send: boolean;
  setup_completed_at: string | null;
  online_booking_enabled: boolean;
  booking_lead_hours: number;
  booking_window_days: number;
  qb_realm_id: string | null;
  qb_access_token: string | null;
  qb_refresh_token: string | null;
  qb_token_expires_at: string | null;
}
