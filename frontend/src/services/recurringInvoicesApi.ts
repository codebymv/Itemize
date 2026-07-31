import {
  createRecurringInvoiceViaGraphql,
  deleteRecurringInvoiceViaGraphql,
  generateRecurringInvoiceNowViaGraphql,
  getRecurringInvoiceViaGraphql,
  getRecurringInvoiceHistoryViaGraphql,
  getRecurringInvoiceNumberPreviewViaGraphql,
  getRecurringInvoicesViaGraphql,
  pauseRecurringInvoiceViaGraphql,
  resumeRecurringInvoiceViaGraphql,
  updateRecurringInvoiceViaGraphql,
} from './recurringInvoicesGraphql';

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringStatus = 'active' | 'paused' | 'completed';

export interface RecurringInvoiceItem {
  product_id?: number | null;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
}

export interface RecurringInvoice {
  id: number;
  organization_id: number;
  template_name: string;
  contact_id?: number | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  frequency: RecurringFrequency;
  start_date: string;
  end_date?: string | null;
  next_run_date?: string | null;
  last_generated_at?: string | null;
  status: RecurringStatus;
  items?: RecurringInvoiceItem[];
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  discount_type?: 'fixed' | 'percent' | null;
  discount_value: number;
  total: number;
  currency: string;
  notes?: string | null;
  payment_terms?: string | null;
  custom_fields?: Record<string, unknown>;
  source_invoice_id?: number | null;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  contact_email?: string | null;
  source_invoice_number?: string | null;
  invoices_generated: number;
}

export interface RecurringInvoiceWriteInput {
  template_name?: string;
  contact_id?: number | null;
  customer_name?: string | null;
  customer_email?: string | null;
  frequency?: RecurringFrequency;
  start_date?: string;
  end_date?: string | null;
  items?: RecurringInvoiceItem[];
  discount_type?: 'fixed' | 'percent' | null;
  discount_value?: number;
  notes?: string | null;
  payment_terms?: string | null;
}

export interface RecurringInvoiceHistoryEntry {
  id: number;
  invoice_number: string;
  total: number;
  status: string;
  created_at: string;
}

export const getRecurringInvoices = async (
  status: RecurringStatus | 'all' = 'all',
  organizationId?: number,
): Promise<RecurringInvoice[]> => {
  return getRecurringInvoicesViaGraphql(status, organizationId);
};

export const getRecurringInvoice = async (
  id: number,
  organizationId?: number,
): Promise<RecurringInvoice> => {
  return getRecurringInvoiceViaGraphql(id, organizationId);
};

export const createRecurringInvoice = async (
  input: RecurringInvoiceWriteInput & {
    template_name: string;
    frequency: RecurringFrequency;
    start_date: string;
    items: RecurringInvoiceItem[];
  },
  organizationId?: number,
): Promise<RecurringInvoice> => {
  return createRecurringInvoiceViaGraphql(input, organizationId);
};

export const updateRecurringInvoice = async (
  id: number,
  input: RecurringInvoiceWriteInput,
  organizationId?: number,
): Promise<RecurringInvoice> => {
  return updateRecurringInvoiceViaGraphql(id, input, organizationId);
};

export const deleteRecurringInvoice = async (
  id: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  return deleteRecurringInvoiceViaGraphql(id, organizationId);
};

export const pauseRecurringInvoice = async (
  id: number,
  organizationId?: number,
): Promise<void> => {
  await pauseRecurringInvoiceViaGraphql(id, organizationId);
};

export const resumeRecurringInvoice = async (
  id: number,
  organizationId?: number,
): Promise<void> => {
  await resumeRecurringInvoiceViaGraphql(id, organizationId);
};

export const getRecurringInvoiceHistory = async (
  id: number,
  organizationId?: number,
): Promise<RecurringInvoiceHistoryEntry[]> => {
  return getRecurringInvoiceHistoryViaGraphql(id, organizationId);
};

export const generateRecurringInvoiceNow = async (
  id: number,
  organizationId?: number,
): Promise<{ invoice_number: string }> => {
  return generateRecurringInvoiceNowViaGraphql(id, organizationId);
};

export const getRecurringInvoiceNumberPreview = async (
  organizationId?: number,
): Promise<string> => {
  return getRecurringInvoiceNumberPreviewViaGraphql(organizationId);
};
