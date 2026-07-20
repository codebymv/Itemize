import api from '@/lib/api';
import {
  isRecurringInvoiceGraphqlGenerationEnabled,
  isRecurringInvoiceGraphqlLifecycleEnabled,
  isRecurringInvoiceGraphqlMutationsEnabled,
  isRecurringInvoiceGraphqlReadsEnabled,
} from './graphqlClient';
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

const headers = (organizationId?: number) =>
  organizationId ? { 'x-organization-id': organizationId.toString() } : {};

export const getRecurringInvoices = async (
  status: RecurringStatus | 'all' = 'all',
  organizationId?: number,
): Promise<RecurringInvoice[]> => {
  if (isRecurringInvoiceGraphqlReadsEnabled()) {
    return getRecurringInvoicesViaGraphql(status, organizationId);
  }
  const response = await api.get('/api/invoices/recurring', {
    params: status === 'all' ? {} : { status },
    headers: headers(organizationId),
  });
  return (response.data.recurring || response.data || []) as RecurringInvoice[];
};

export const getRecurringInvoice = async (
  id: number,
  organizationId?: number,
): Promise<RecurringInvoice> => {
  if (isRecurringInvoiceGraphqlReadsEnabled()) {
    return getRecurringInvoiceViaGraphql(id, organizationId);
  }
  const response = await api.get(`/api/invoices/recurring/${id}`, {
    headers: headers(organizationId),
  });
  return response.data as RecurringInvoice;
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
  if (isRecurringInvoiceGraphqlMutationsEnabled()) {
    return createRecurringInvoiceViaGraphql(input, organizationId);
  }
  const response = await api.post('/api/invoices/recurring', input, {
    headers: headers(organizationId),
  });
  return response.data as RecurringInvoice;
};

export const updateRecurringInvoice = async (
  id: number,
  input: RecurringInvoiceWriteInput,
  organizationId?: number,
): Promise<RecurringInvoice> => {
  if (isRecurringInvoiceGraphqlMutationsEnabled()) {
    return updateRecurringInvoiceViaGraphql(id, input, organizationId);
  }
  const response = await api.put(`/api/invoices/recurring/${id}`, input, {
    headers: headers(organizationId),
  });
  return response.data as RecurringInvoice;
};

export const deleteRecurringInvoice = async (
  id: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  if (isRecurringInvoiceGraphqlMutationsEnabled()) {
    return deleteRecurringInvoiceViaGraphql(id, organizationId);
  }
  const response = await api.delete(`/api/invoices/recurring/${id}`, {
    headers: headers(organizationId),
  });
  return response.data as { success: boolean };
};

export const pauseRecurringInvoice = async (
  id: number,
  organizationId?: number,
): Promise<void> => {
  if (isRecurringInvoiceGraphqlLifecycleEnabled()) {
    await pauseRecurringInvoiceViaGraphql(id, organizationId);
    return;
  }
  await api.post(`/api/invoices/recurring/${id}/pause`, {}, {
    headers: headers(organizationId),
  });
};

export const resumeRecurringInvoice = async (
  id: number,
  organizationId?: number,
): Promise<void> => {
  if (isRecurringInvoiceGraphqlLifecycleEnabled()) {
    await resumeRecurringInvoiceViaGraphql(id, organizationId);
    return;
  }
  await api.post(`/api/invoices/recurring/${id}/resume`, {}, {
    headers: headers(organizationId),
  });
};

export const getRecurringInvoiceHistory = async (
  id: number,
  organizationId?: number,
): Promise<RecurringInvoiceHistoryEntry[]> => {
  if (isRecurringInvoiceGraphqlReadsEnabled()) {
    return getRecurringInvoiceHistoryViaGraphql(id, organizationId);
  }
  const response = await api.get(`/api/invoices/recurring/${id}/history`, {
    headers: headers(organizationId),
  });
  return (response.data.invoices || []) as RecurringInvoiceHistoryEntry[];
};

export const generateRecurringInvoiceNow = async (
  id: number,
  organizationId?: number,
): Promise<{ invoice_number: string }> => {
  if (isRecurringInvoiceGraphqlGenerationEnabled()) {
    return generateRecurringInvoiceNowViaGraphql(id, organizationId);
  }
  const response = await api.post(`/api/invoices/recurring/${id}/generate-now`, {}, {
    headers: headers(organizationId),
  });
  return response.data as { invoice_number: string };
};

export const getRecurringInvoiceNumberPreview = async (
  organizationId?: number,
): Promise<string> => {
  if (isRecurringInvoiceGraphqlReadsEnabled()) {
    return getRecurringInvoiceNumberPreviewViaGraphql(organizationId);
  }
  const response = await api.get('/api/invoices/recurring/preview-invoice-number', {
    headers: headers(organizationId),
  });
  return response.data.invoice_number || 'INV-00001';
};
