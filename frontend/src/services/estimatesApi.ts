import {
  createEstimateViaGraphql,
  convertEstimateToInvoiceViaGraphql,
  deleteEstimateViaGraphql,
  getEstimateViaGraphql,
  getEstimatesViaGraphql,
  sendEstimateViaGraphql,
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

export const getEstimates = async (
  params: EstimateListParams = {},
  organizationId?: number,
): Promise<EstimateListResponse> => {
  return getEstimatesViaGraphql(params, organizationId);
};

export const getEstimate = async (
  id: number,
  organizationId?: number,
): Promise<Estimate> => {
  return getEstimateViaGraphql(id, organizationId);
};

export const createEstimate = async (
  input: EstimateWriteInput & { items: EstimateItem[] },
  organizationId?: number,
): Promise<Estimate> => {
  return createEstimateViaGraphql(input, organizationId);
};

export const updateEstimate = async (
  id: number,
  input: EstimateWriteInput,
  organizationId?: number,
): Promise<Estimate> => {
  return updateEstimateViaGraphql(id, input, organizationId);
};

export const deleteEstimate = async (
  id: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  return deleteEstimateViaGraphql(id, organizationId);
};

export const sendEstimate = async (
  id: number,
  organizationId?: number,
): Promise<void> => {
  return sendEstimateViaGraphql(id, organizationId);
};

export const convertEstimateToInvoice = async (
  id: number,
  organizationId?: number,
): Promise<{ invoice_id: number; invoice_number?: string }> => {
  return convertEstimateToInvoiceViaGraphql(id, organizationId);
};
