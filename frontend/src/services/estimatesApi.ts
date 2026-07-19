import api from '@/lib/api';
import {
  isEstimateGraphqlMutationsEnabled,
  isEstimateGraphqlReadsEnabled,
} from './graphqlClient';
import {
  createEstimateViaGraphql,
  deleteEstimateViaGraphql,
  getEstimateViaGraphql,
  getEstimatesViaGraphql,
  updateEstimateViaGraphql,
} from './estimatesGraphql';

export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export interface EstimateItem {
  id?: number;
  estimate_id?: number;
  organization_id?: number;
  product_id?: number | null;
  product_name?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount?: number;
  discount_amount?: number;
  total?: number;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Estimate {
  id: number;
  organization_id: number;
  estimate_number: string;
  contact_id?: number | null;
  business_id?: number | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  issue_date: string;
  valid_until: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  discount_type?: 'fixed' | 'percent' | null;
  discount_value: number;
  total: number;
  currency: string;
  status: EstimateStatus;
  notes?: string | null;
  terms_and_conditions?: string | null;
  sent_at?: string | null;
  viewed_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  converted_invoice_id?: number | null;
  custom_fields?: Record<string, unknown>;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  contact_email?: string | null;
  items?: EstimateItem[];
}

export interface EstimateWriteInput {
  contact_id?: number | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  valid_until?: string;
  items?: EstimateItem[];
  discount_type?: 'fixed' | 'percent' | null;
  discount_value?: number;
  notes?: string | null;
  terms_and_conditions?: string | null;
}

export interface EstimateListParams {
  status?: EstimateStatus | 'all';
  contact_id?: number;
  page?: number;
  limit?: number;
  search?: string;
}

export interface EstimateListResponse {
  estimates: Estimate[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const headers = (organizationId?: number) =>
  organizationId ? { 'x-organization-id': organizationId.toString() } : {};

export const getEstimates = async (
  params: EstimateListParams = {},
  organizationId?: number,
): Promise<EstimateListResponse> => {
  if (isEstimateGraphqlReadsEnabled()) {
    return getEstimatesViaGraphql(params, organizationId);
  }
  const response = await api.get('/api/invoices/estimates', {
    params,
    headers: headers(organizationId),
  });
  return response.data as EstimateListResponse;
};

export const getEstimate = async (
  id: number,
  organizationId?: number,
): Promise<Estimate> => {
  if (isEstimateGraphqlReadsEnabled()) {
    return getEstimateViaGraphql(id, organizationId);
  }
  const response = await api.get(`/api/invoices/estimates/${id}`, {
    headers: headers(organizationId),
  });
  return response.data as Estimate;
};

export const createEstimate = async (
  input: EstimateWriteInput & { items: EstimateItem[] },
  organizationId?: number,
): Promise<Estimate> => {
  if (isEstimateGraphqlMutationsEnabled()) {
    return createEstimateViaGraphql(input, organizationId);
  }
  const response = await api.post('/api/invoices/estimates', input, {
    headers: headers(organizationId),
  });
  return response.data as Estimate;
};

export const updateEstimate = async (
  id: number,
  input: EstimateWriteInput,
  organizationId?: number,
): Promise<Estimate> => {
  if (isEstimateGraphqlMutationsEnabled()) {
    return updateEstimateViaGraphql(id, input, organizationId);
  }
  const response = await api.put(`/api/invoices/estimates/${id}`, input, {
    headers: headers(organizationId),
  });
  return response.data as Estimate;
};

export const deleteEstimate = async (
  id: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  if (isEstimateGraphqlMutationsEnabled()) {
    return deleteEstimateViaGraphql(id, organizationId);
  }
  const response = await api.delete(`/api/invoices/estimates/${id}`, {
    headers: headers(organizationId),
  });
  return response.data as { success: boolean };
};

export const sendEstimate = async (
  id: number,
  organizationId?: number,
): Promise<void> => {
  await api.post(`/api/invoices/estimates/${id}/send`, {}, {
    headers: headers(organizationId),
  });
};

export const convertEstimateToInvoice = async (
  id: number,
  organizationId?: number,
): Promise<{ invoice_id: number }> => {
  const response = await api.post(
    `/api/invoices/estimates/${id}/convert-to-invoice`,
    {},
    { headers: headers(organizationId) },
  );
  return response.data as { invoice_id: number };
};
