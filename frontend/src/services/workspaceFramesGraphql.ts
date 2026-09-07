import type { WorkspaceFrame } from '@/types';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import { reconcileWorkspaceUpdate } from './workspaceMutationReconciliation';

/** Field selection shared by the snapshot loader and every frame mutation. */
export const frameFields = `
  id userId title category colorValue positionX positionY width height zIndex
  contactId contactName createdAt updatedAt archivedAt
`;

export type GraphqlWorkspaceFrame = {
  id: number;
  userId: number;
  title: string;
  category: string | null;
  colorValue: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  contactId: number | null;
  contactName: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type WorkspaceFramePayload = {
  title?: string;
  category?: string | null;
  color_value?: string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  contact_id?: number | null;
};

// Revisions: the frame editor sends the `updatedAt` it last saw; a stale one is
// refused server-side (STALE_FRAME_REVISION). Position moves never bump it.
const revisions = new Map<number, string>();

export const rememberWorkspaceFrameRevision = (id: number, updatedAt?: string | null): void => {
  if (updatedAt) revisions.set(id, updatedAt);
};

export const forgetWorkspaceFrameRevision = (id: number): void => {
  revisions.delete(id);
};

const requireRevision = (id: number): string => {
  const revision = revisions.get(id);
  if (!revision) {
    throw new Error('Frame revision is unavailable; reload the canvas before updating it');
  }
  return revision;
};

export const mapFrame = (row: GraphqlWorkspaceFrame): WorkspaceFrame => {
  rememberWorkspaceFrameRevision(row.id, row.updatedAt);
  return {
    id: row.id,
    user_id: row.userId,
    title: row.title,
    category: row.category ?? null,
    color_value: row.colorValue,
    position_x: row.positionX,
    position_y: row.positionY,
    width: row.width,
    height: row.height,
    z_index: row.zIndex,
    contact_id: row.contactId,
    contact_name: row.contactName,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    archived_at: row.archivedAt ?? null,
  };
};

const mapInput = (input: WorkspaceFramePayload) => ({
  ...(input.title === undefined ? {} : { title: input.title }),
  ...(input.category === undefined ? {} : { category: input.category }),
  ...(input.color_value === undefined ? {} : { colorValue: input.color_value }),
  ...(input.position_x === undefined ? {} : { positionX: input.position_x }),
  ...(input.position_y === undefined ? {} : { positionY: input.position_y }),
  ...(input.width === undefined ? {} : { width: input.width }),
  ...(input.height === undefined ? {} : { height: input.height }),
  ...(input.contact_id === undefined ? {} : { contactId: input.contact_id }),
});

const framesQuery = `
  query WorkspaceFrames($page: PageInput) {
    workspaceFrames(page: $page) { nodes { ${frameFields} } pageInfo { total hasNextPage } }
  }
`;

const createFrameMutation = `
  mutation CreateWorkspaceFrame($input: CreateWorkspaceFrameInput!) {
    createWorkspaceFrame(input: $input) { ${frameFields} }
  }
`;

const updateFrameMutation = `
  mutation UpdateWorkspaceFrame($id: Int!, $input: UpdateWorkspaceFrameInput!) {
    updateWorkspaceFrame(id: $id, input: $input) { ${frameFields} }
  }
`;

const deleteFrameMutation = `
  mutation DeleteWorkspaceFrame($id: Int!, $mutationId: String!) {
    deleteWorkspaceFrame(id: $id, mutationId: $mutationId) { deletedId }
  }
`;

export const getWorkspaceFramesViaGraphql = async (signal?: AbortSignal): Promise<WorkspaceFrame[]> => {
  const variables = { page: { page: 1, pageSize: 100 } };
  const data = await graphqlRequest<{
    workspaceFrames: { nodes: GraphqlWorkspaceFrame[] };
  }, typeof variables>(framesQuery, variables, undefined, signal);
  return data.workspaceFrames.nodes.map(mapFrame);
};

export const createWorkspaceFrameViaGraphql = async (
  input: WorkspaceFramePayload,
  idempotencyKey: string,
): Promise<WorkspaceFrame> => {
  const variables = { input: { idempotencyKey, ...mapInput(input) } };
  const data = await graphqlMutationRequest<{
    createWorkspaceFrame: GraphqlWorkspaceFrame;
  }, typeof variables>(createFrameMutation, variables);
  return mapFrame(data.createWorkspaceFrame);
};

const getWorkspaceFrameViaGraphql = async (id: number): Promise<WorkspaceFrame> => {
  const frames = await getWorkspaceFramesViaGraphql();
  const frame = frames.find((candidate) => candidate.id === id);
  if (!frame) throw new Error('Frame no longer exists');
  return frame;
};

export const updateWorkspaceFrameViaGraphql = async (
  id: number,
  input: WorkspaceFramePayload,
): Promise<WorkspaceFrame> => {
  const variables = {
    id,
    input: {
      mutationId: crypto.randomUUID(),
      expectedUpdatedAt: requireRevision(id),
      ...mapInput(input),
    },
  };
  try {
    const data = await graphqlMutationRequest<{
      updateWorkspaceFrame: GraphqlWorkspaceFrame;
    }, typeof variables>(updateFrameMutation, variables);
    return mapFrame(data.updateWorkspaceFrame);
  } catch (error) {
    return reconcileWorkspaceUpdate(error, () => getWorkspaceFrameViaGraphql(id), input);
  }
};

export const deleteWorkspaceFrameViaGraphql = async (id: number): Promise<void> => {
  const variables = { id, mutationId: crypto.randomUUID() };
  const data = await graphqlMutationRequest<{
    deleteWorkspaceFrame: { deletedId: number };
  }, typeof variables>(deleteFrameMutation, variables);
  if (data.deleteWorkspaceFrame.deletedId !== id) {
    throw new Error('GraphQL frame deletion returned an unexpected identity');
  }
  forgetWorkspaceFrameRevision(id);
};
