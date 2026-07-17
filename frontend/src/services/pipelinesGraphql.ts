import type { Deal, JsonRecord, Pipeline, PipelineStage } from '@/types';
import type { CreatePipelineData } from './pipelinesApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlStage = {
  id: string;
  name: string;
  order: number;
  color: string;
};

type GraphqlDeal = {
  id: number;
  organizationId: number;
  pipelineId: number;
  contactId: number | null;
  stageId: string;
  title: string;
  value: number;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  assignedToId: number | null;
  assignedToName: string | null;
  createdById: number | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  customFields: JsonRecord;
  tags: string[];
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

type GraphqlPipeline = {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  stages: GraphqlStage[];
  isDefault: boolean;
  createdById: number | null;
  dealCount: number;
  totalValue: number;
  deals?: GraphqlDeal[];
  createdAt: string;
  updatedAt: string;
};

const pipelineFields = `
  id
  organizationId
  name
  description
  stages { id name order color }
  isDefault
  createdById
  dealCount
  totalValue
  createdAt
  updatedAt
`;

const dealFields = `
  id
  organizationId
  pipelineId
  contactId
  stageId
  title
  value
  currency
  probability
  expectedCloseDate
  assignedToId
  assignedToName
  createdById
  wonAt
  lostAt
  lostReason
  customFields
  tags
  contactFirstName
  contactLastName
  contactEmail
  createdAt
  updatedAt
`;

const pipelinesQuery = `
  query PipelineReads {
    pipelines { ${pipelineFields} }
  }
`;

const pipelineQuery = `
  query PipelineRead($id: Int!) {
    pipeline(id: $id) {
      ${pipelineFields}
      deals { ${dealFields} }
    }
  }
`;

const createPipelineMutation = `
  mutation CreatePipeline($input: CreatePipelineInput!) {
    createPipeline(input: $input) { ${pipelineFields} }
  }
`;

const updatePipelineMutation = `
  mutation UpdatePipeline($id: Int!, $input: UpdatePipelineInput!) {
    updatePipeline(id: $id, input: $input) { ${pipelineFields} }
  }
`;

const deletePipelineMutation = `
  mutation DeletePipeline($id: Int!) {
    deletePipeline(id: $id) { deletedId }
  }
`;

const mapStage = (stage: GraphqlStage): PipelineStage => ({
  id: stage.id,
  name: stage.name,
  order: stage.order,
  color: stage.color,
});

const mapDeal = (deal: GraphqlDeal): Deal => ({
  id: deal.id,
  organization_id: deal.organizationId,
  pipeline_id: deal.pipelineId,
  ...(deal.contactId === null ? {} : { contact_id: deal.contactId }),
  stage_id: deal.stageId,
  title: deal.title,
  value: deal.value,
  currency: deal.currency,
  probability: deal.probability,
  ...(deal.expectedCloseDate === null
    ? {}
    : { expected_close_date: deal.expectedCloseDate }),
  ...(deal.assignedToId === null ? {} : { assigned_to: deal.assignedToId }),
  ...(deal.assignedToName === null
    ? {}
    : { assigned_to_name: deal.assignedToName }),
  ...(deal.createdById === null ? {} : { created_by: deal.createdById }),
  ...(deal.wonAt === null ? {} : { won_at: deal.wonAt }),
  ...(deal.lostAt === null ? {} : { lost_at: deal.lostAt }),
  ...(deal.lostReason === null ? {} : { lost_reason: deal.lostReason }),
  custom_fields: deal.customFields ?? {},
  tags: deal.tags ?? [],
  ...(deal.contactFirstName === null
    ? {}
    : { contact_first_name: deal.contactFirstName }),
  ...(deal.contactLastName === null
    ? {}
    : { contact_last_name: deal.contactLastName }),
  created_at: deal.createdAt,
  updated_at: deal.updatedAt,
});

const mapPipeline = (pipeline: GraphqlPipeline): Pipeline & { deals?: Deal[] } => ({
  id: pipeline.id,
  organization_id: pipeline.organizationId,
  name: pipeline.name,
  ...(pipeline.description === null ? {} : { description: pipeline.description }),
  stages: pipeline.stages.map(mapStage),
  is_default: pipeline.isDefault,
  ...(pipeline.createdById === null ? {} : { created_by: pipeline.createdById }),
  deal_count: pipeline.dealCount,
  total_value: pipeline.totalValue,
  ...(pipeline.deals ? { deals: pipeline.deals.map(mapDeal) } : {}),
  created_at: pipeline.createdAt,
  updated_at: pipeline.updatedAt,
});

const has = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const mapPipelineInput = (data: Partial<CreatePipelineData>) => ({
  ...(has(data, 'name') && data.name !== undefined ? { name: data.name } : {}),
  ...(has(data, 'description') && data.description !== undefined
    ? { description: data.description }
    : {}),
  ...(has(data, 'stages') && data.stages !== undefined
    ? {
        stages:
          data.stages?.map((stage) => ({
            id: stage.id,
            name: stage.name,
            color: stage.color,
            order: stage.order,
          })) ?? null,
      }
    : {}),
  ...(has(data, 'is_default') && data.is_default !== undefined
    ? { isDefault: data.is_default }
    : {}),
});

export const getPipelinesViaGraphql = async (
  organizationId?: number,
): Promise<Pipeline[]> => {
  const data = await graphqlRequest<
    { pipelines: GraphqlPipeline[] },
    Record<string, never>
  >(pipelinesQuery, {}, organizationId);
  return data.pipelines.map(mapPipeline);
};

export const getPipelineViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<Pipeline & { deals: Deal[] }> => {
  const data = await graphqlRequest<
    { pipeline: GraphqlPipeline },
    { id: number }
  >(pipelineQuery, { id }, organizationId);
  const pipeline = mapPipeline(data.pipeline);
  return { ...pipeline, deals: pipeline.deals ?? [] };
};

export const createPipelineViaGraphql = async (
  data: CreatePipelineData,
): Promise<Pipeline> => {
  const response = await graphqlMutationRequest<
    { createPipeline: GraphqlPipeline },
    { input: ReturnType<typeof mapPipelineInput> }
  >(
    createPipelineMutation,
    { input: mapPipelineInput(data) },
    data.organization_id,
  );
  return mapPipeline(response.createPipeline);
};

export const updatePipelineViaGraphql = async (
  id: number,
  data: Partial<CreatePipelineData>,
): Promise<Pipeline> => {
  const response = await graphqlMutationRequest<
    { updatePipeline: GraphqlPipeline },
    { id: number; input: ReturnType<typeof mapPipelineInput> }
  >(
    updatePipelineMutation,
    { id, input: mapPipelineInput(data) },
    data.organization_id,
  );
  return mapPipeline(response.updatePipeline);
};

export const deletePipelineViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<void> => {
  await graphqlMutationRequest<
    { deletePipeline: { deletedId: number } },
    { id: number }
  >(deletePipelineMutation, { id }, organizationId);
};
