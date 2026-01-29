/**
 * Pipelines API Service
 * Handles all pipeline and deal-related API calls
 */
import api from '@/lib/api';
import { Pipeline, Deal, PipelineStage } from '@/types';

const unwrapResponse = <T>(payload: any): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T;
  }
  return payload as T;
};

// ======================
// Pipelines API
// ======================

export const getPipelines = async (organizationId?: number): Promise<Pipeline[]> => {
  const response = await api.get('/api/pipelines', {
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
  return unwrapResponse<Pipeline[]>(response.data);
};

export const getPipeline = async (id: number, organizationId?: number): Promise<Pipeline & { deals: Deal[] }> => {
  const response = await api.get(`/api/pipelines/${id}`, {
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
  return unwrapResponse<Pipeline & { deals: Deal[] }>(response.data);
};

export interface CreatePipelineData {
  name: string;
  description?: string;
  stages?: PipelineStage[];
  is_default?: boolean;
  organization_id?: number;
}

export const createPipeline = async (data: CreatePipelineData): Promise<Pipeline> => {
  const response = await api.post('/api/pipelines', data, {
    headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {}
  });
  return unwrapResponse<Pipeline>(response.data);
};

export const updatePipeline = async (id: number, data: Partial<CreatePipelineData>): Promise<Pipeline> => {
  const response = await api.put(`/api/pipelines/${id}`, data, {
    headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {}
  });
  return unwrapResponse<Pipeline>(response.data);
};

export const deletePipeline = async (id: number, organizationId?: number): Promise<void> => {
  await api.delete(`/api/pipelines/${id}`, {
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
};

// ======================
// Deals API
// ======================

export interface DealsQueryParams {
  pipeline_id?: number;
  stage_id?: string;
  contact_id?: number;
  assigned_to?: number;
  status?: 'open' | 'won' | 'lost';
  sort_by?: 'created_at' | 'updated_at' | 'value' | 'expected_close_date' | 'title';
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  organization_id?: number;
}

export interface DealsResponse {
  deals: Deal[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const getDeals = async (params: DealsQueryParams = {}): Promise<DealsResponse> => {
  const response = await api.get('/api/pipelines/deals/all', {
    params,
    headers: params.organization_id ? { 'x-organization-id': params.organization_id.toString() } : {}
  });
  return unwrapResponse<DealsResponse>(response.data);
};

export const getDeal = async (id: number, organizationId?: number): Promise<Deal> => {
  const response = await api.get(`/api/pipelines/deals/${id}`, {
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
  return unwrapResponse<Deal>(response.data);
};

export interface CreateDealData {
  pipeline_id: number;
  contact_id?: number;
  stage_id?: string;
  title: string;
  value?: number;
  currency?: string;
  probability?: number;
  expected_close_date?: string;
  assigned_to?: number;
  custom_fields?: Record<string, any>;
  tags?: string[];
  organization_id?: number;
}

export const createDeal = async (data: CreateDealData): Promise<Deal> => {
  const response = await api.post('/api/pipelines/deals', data, {
    headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {}
  });
  return unwrapResponse<Deal>(response.data);
};

export const updateDeal = async (id: number, data: Partial<CreateDealData>): Promise<Deal> => {
  const response = await api.put(`/api/pipelines/deals/${id}`, data, {
    headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {}
  });
  return unwrapResponse<Deal>(response.data);
};

export const moveDealToStage = async (id: number, stageId: string, organizationId?: number): Promise<Deal> => {
  const response = await api.patch(`/api/pipelines/deals/${id}/stage`, 
    { stage_id: stageId },
    { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
  );
  return unwrapResponse<Deal>(response.data);
};

export const markDealWon = async (id: number, organizationId?: number): Promise<Deal> => {
  const response = await api.post(`/api/pipelines/deals/${id}/won`, {}, {
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
  return unwrapResponse<Deal>(response.data);
};

export const markDealLost = async (id: number, reason?: string, organizationId?: number): Promise<Deal> => {
  const response = await api.post(`/api/pipelines/deals/${id}/lost`, { reason }, {
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
  return unwrapResponse<Deal>(response.data);
};

export const reopenDeal = async (id: number, organizationId?: number): Promise<Deal> => {
  const response = await api.post(`/api/pipelines/deals/${id}/reopen`, {}, {
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
  return unwrapResponse<Deal>(response.data);
};

export const deleteDeal = async (id: number, organizationId?: number): Promise<void> => {
  await api.delete(`/api/pipelines/deals/${id}`, {
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
};

export default {
  // Pipelines
  getPipelines,
  getPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline,
  // Deals
  getDeals,
  getDeal,
  createDeal,
  updateDeal,
  moveDealToStage,
  markDealWon,
  markDealLost,
  reopenDeal,
  deleteDeal,
};
