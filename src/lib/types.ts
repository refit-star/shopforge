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
  created_at: string;
  // computed
  vehicle_count?: number;
  last_visit?: string | null;
  total_spend?: number;
}

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

export type WOStatus = 'Check-In' | 'In Progress' | 'Waiting on Parts' | 'Ready for Pickup' | 'Completed';
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
  // joined
  customer?: Customer;
  vehicle?: Vehicle;
  tech?: Tech;
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue';

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
  created_at: string;
  // joined
  customer?: Customer;
  vehicle?: Vehicle;
  labor_lines?: LaborLine[];
  parts_lines?: PartsLine[];
}

export const WO_STATUSES: WOStatus[] = ['Check-In', 'In Progress', 'Waiting on Parts', 'Ready for Pickup', 'Completed'];
export const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
export const INVOICE_STATUSES: InvoiceStatus[] = ['Draft', 'Sent', 'Paid', 'Overdue'];

export const STATUS_COLORS: Record<string, string> = {
  'Check-In': '#3b82f6',
  'In Progress': '#f97316',
  'Waiting on Parts': '#fbbf24',
  'Ready for Pickup': '#22c55e',
  'Completed': '#64748b',
  'Draft': '#64748b',
  'Sent': '#3b82f6',
  'Paid': '#22c55e',
  'Overdue': '#ef4444',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  high: '#ef4444',
  medium: '#fbbf24',
  low: '#22c55e',
};
