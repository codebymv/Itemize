/**
 * Pipelines API Service
 * Handles all pipeline and deal-related API calls
 */
import { Pipeline, Deal, PipelineStage, JsonRecord } from '@/types';
import {
  createPipelineViaGraphql,
  deletePipelineViaGraphql,
  getPipelineViaGraphql,
  getPipelineWorkspaceViaGraphql,
  getPipelinesViaGraphql,
  type PipelineWorkspace,
  updatePipelineViaGraphql,
} from './pipelinesGraphql';
export type { PipelineWorkspace } from './pipelinesGraphql';
import {
  createDealViaGraphql,
  deleteDealViaGraphql,
  getDealViaGraphql,
  getDealsViaGraphql,
  markDealLostViaGraphql,
  markDealWonViaGraphql,
  moveDealViaGraphql,
  reopenDealViaGraphql,
  updateDealViaGraphql,
} from './dealsGraphql';

// ======================
// Pipelines API
// ======================

export const getPipelines = async (organizationId?: number): Promise<Pipeline[]> => {
  return getPipelinesViaGraphql(organizationId);
};

export const getPipeline = async (id: number, organizationId?: number): Promise<Pipeline & { deals: Deal[] }> => {
  return getPipelineViaGraphql(id, organizationId);
};

export const getPipelineWorkspace = async (
  selectedPipelineId: number | null | undefined,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<PipelineWorkspace> => (
  getPipelineWorkspaceViaGraphql(selectedPipelineId, organizationId, signal)
);

export interface CreatePipelineData {
  name: string;
  description?: string | null;
  stages?: PipelineStage[] | null;
  is_default?: boolean;
  organization_id?: number;
}

export const createPipeline = async (data: CreatePipelineData): Promise<Pipeline> => {
  return createPipelineViaGraphql(data);
};

export const updatePipeline = async (id: number, data: Partial<CreatePipelineData>): Promise<Pipeline> => {
  return updatePipelineViaGraphql(id, data);
};

export const deletePipeline = async (id: number, organizationId?: number): Promise<void> => {
  return deletePipelineViaGraphql(id, organizationId);
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
  return getDealsViaGraphql(params);
};

export const getDeal = async (id: number, organizationId?: number): Promise<Deal> => {
  return getDealViaGraphql(id, organizationId);
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
  custom_fields?: JsonRecord;
  tags?: string[];
  organization_id?: number;
}

export const createDeal = async (
  data: CreateDealData,
  idempotencyKey: string,
): Promise<Deal> => {
  return createDealViaGraphql(data, idempotencyKey);
};

export const updateDeal = async (id: number, data: Partial<CreateDealData>): Promise<Deal> => {
  return updateDealViaGraphql(id, data);
};

export const moveDealToStage = async (id: number, stageId: string, organizationId?: number): Promise<Deal> => {
  return moveDealViaGraphql(id, stageId, organizationId);
};

export const markDealWon = async (id: number, organizationId?: number): Promise<Deal> => {
  return markDealWonViaGraphql(id, organizationId);
};

export const markDealLost = async (id: number, reason?: string, organizationId?: number): Promise<Deal> => {
  return markDealLostViaGraphql(id, reason, organizationId);
};

export const reopenDeal = async (id: number, organizationId?: number): Promise<Deal> => {
  return reopenDealViaGraphql(id, organizationId);
};

export const deleteDeal = async (id: number, organizationId?: number): Promise<void> => {
  return deleteDealViaGraphql(id, organizationId);
};

export default {
  // Pipelines
  getPipelines,
  getPipeline,
  getPipelineWorkspace,
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
