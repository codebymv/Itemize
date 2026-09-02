import {
  createRecurringInvoiceViaGraphql,
  deleteRecurringInvoiceViaGraphql,
  generateRecurringInvoiceNowViaGraphql,
  getRecurringInvoiceViaGraphql,
  getRecurringInvoiceHistoryViaGraphql,
  getRecurringInvoiceNumberPreviewViaGraphql,
  getRecurringInvoicePageViaGraphql,
  getRecurringInvoicesViaGraphql,
  pauseRecurringInvoiceViaGraphql,
  resumeRecurringInvoiceViaGraphql,
  updateRecurringInvoiceViaGraphql,
} from './recurringInvoicesGraphql';
import type {
  RecurringInvoiceListParams,
  RecurringInvoiceListResponse,
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
  signal?: AbortSignal,
): Promise<RecurringInvoice[]> => {
  return signal === undefined
    ? getRecurringInvoicesViaGraphql(status, organizationId)
    : getRecurringInvoicesViaGraphql(status, organizationId, signal);
};

export const getRecurringInvoicePage = async (
  params: RecurringInvoiceListParams = {},
  organizationId?: number,
  signal?: AbortSignal,
): Promise<RecurringInvoiceListResponse> => {
  return getRecurringInvoicePageViaGraphql(params, organizationId, signal);
};

export const getRecurringInvoice = async (
  id: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<RecurringInvoice> => {
  return signal === undefined
    ? getRecurringInvoiceViaGraphql(id, organizationId)
    : getRecurringInvoiceViaGraphql(id, organizationId, signal);
};

export const createRecurringInvoice = async (
  input: RecurringInvoiceWriteInput & {
    template_name: string;
    frequency: RecurringFrequency;
    start_date: string;
    items: RecurringInvoiceItem[];
  },
  idempotencyKey: string,
  organizationId?: number,
): Promise<RecurringInvoice> => {
  return createRecurringInvoiceViaGraphql(input, idempotencyKey, organizationId);
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
): Promise<RecurringInvoice> => {
  return pauseRecurringInvoiceViaGraphql(id, organizationId);
};

export const resumeRecurringInvoice = async (
  id: number,
  organizationId?: number,
): Promise<RecurringInvoice> => {
  return resumeRecurringInvoiceViaGraphql(id, organizationId);
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
  idempotencyKey?: string,
): Promise<{
  invoice_number: string;
  next_run_date: string | null;
  template_status: RecurringStatus;
  replayed: boolean;
}> => {
  return idempotencyKey === undefined
    ? generateRecurringInvoiceNowViaGraphql(id, organizationId)
    : generateRecurringInvoiceNowViaGraphql(id, organizationId, idempotencyKey);
};

export const getRecurringInvoiceNumberPreview = async (
  organizationId?: number,
  signal?: AbortSignal,
): Promise<string> => {
  return signal === undefined
    ? getRecurringInvoiceNumberPreviewViaGraphql(organizationId)
    : getRecurringInvoiceNumberPreviewViaGraphql(organizationId, signal);
};
