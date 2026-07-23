import type {
  CreateWireframePayload,
  WireframePayload,
} from './api';
import { graphqlMutationRequest } from './graphqlClient';
import {
  mapWireframe,
  type GraphqlWorkspaceWireframe,
  type LegacyWorkspaceWireframe,
  wireframeFields,
} from './workspaceContentGraphql';
import {
  enqueueWorkspaceWireframeUpdate,
  forgetWorkspaceWireframeRevision,
  requireWorkspaceWireframeRevision,
} from './workspaceWireframeRevision';

const createWireframeMutation = `
  mutation CreateWorkspaceWireframe($input: CreateWorkspaceWireframeInput!) {
    createWorkspaceWireframe(input: $input) { ${wireframeFields} }
  }
`;

const updateWireframeMutation = `
  mutation UpdateWorkspaceWireframe(
    $id: Int!
    $input: UpdateWorkspaceWireframeInput!
  ) {
    updateWorkspaceWireframe(id: $id, input: $input) {
      ${wireframeFields}
    }
  }
`;

const deleteWireframeMutation = `
  mutation DeleteWorkspaceWireframe($id: Int!, $mutationId: String!) {
    deleteWorkspaceWireframe(id: $id, mutationId: $mutationId) {
      deletedId
    }
  }
`;

const serializeFlow = (
  value: CreateWireframePayload['flow_data'],
): string => typeof value === 'string' ? value : JSON.stringify(value);

const mapInput = (
  input: CreateWireframePayload | WireframePayload,
) => ({
  ...(input.title === undefined ? {} : { title: input.title }),
  ...(input.category === undefined ? {} : { category: input.category }),
  ...(input.flow_data === undefined
    ? {}
    : { flowData: serializeFlow(input.flow_data) }),
  ...(input.position_x === undefined
    ? {}
    : { positionX: input.position_x }),
  ...(input.position_y === undefined
    ? {}
    : { positionY: input.position_y }),
  ...(input.width === undefined ? {} : { width: input.width }),
  ...(input.height === undefined ? {} : { height: input.height }),
  ...(input.z_index === undefined ? {} : { zIndex: input.z_index }),
  ...(input.color_value === undefined
    ? {}
    : { colorValue: input.color_value }),
});

export const createWorkspaceWireframeViaGraphql = async (
  input: CreateWireframePayload,
): Promise<LegacyWorkspaceWireframe> => {
  const variables = { input: mapInput(input) };
  const data = await graphqlMutationRequest<{
    createWorkspaceWireframe: GraphqlWorkspaceWireframe;
  }, typeof variables>(createWireframeMutation, variables);
  return mapWireframe(data.createWorkspaceWireframe);
};

export const updateWorkspaceWireframeViaGraphql = async (
  id: number,
  input: WireframePayload,
): Promise<LegacyWorkspaceWireframe> =>
  enqueueWorkspaceWireframeUpdate(id, async () => {
    const variables = {
      id,
      input: {
        mutationId: crypto.randomUUID(),
        expectedUpdatedAt: requireWorkspaceWireframeRevision(id),
        ...mapInput(input),
      },
    };
    const data = await graphqlMutationRequest<{
      updateWorkspaceWireframe: GraphqlWorkspaceWireframe;
    }, typeof variables>(updateWireframeMutation, variables);
    return mapWireframe(data.updateWorkspaceWireframe);
  });

export const deleteWorkspaceWireframeViaGraphql = async (
  id: number,
): Promise<{ message: string }> => {
  const variables = { id, mutationId: crypto.randomUUID() };
  const data = await graphqlMutationRequest<{
    deleteWorkspaceWireframe: { deletedId: number };
  }, typeof variables>(deleteWireframeMutation, variables);
  if (data.deleteWorkspaceWireframe.deletedId !== id) {
    throw new Error(
      'GraphQL wireframe deletion returned an unexpected identity',
    );
  }
  forgetWorkspaceWireframeRevision(id);
  return { message: 'Wireframe deleted successfully' };
};
