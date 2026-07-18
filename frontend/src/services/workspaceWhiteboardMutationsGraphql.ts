import type {
  CreateWhiteboardPayload,
  WhiteboardPayload,
} from './api';
import { graphqlMutationRequest } from './graphqlClient';
import {
  mapWhiteboard,
  type GraphqlWorkspaceWhiteboard,
  type LegacyWorkspaceWhiteboard,
  whiteboardFields,
} from './workspaceContentGraphql';
import {
  enqueueWorkspaceWhiteboardUpdate,
  forgetWorkspaceWhiteboardRevision,
  requireWorkspaceWhiteboardRevision,
} from './workspaceWhiteboardRevision';

const createWhiteboardMutation = `
  mutation CreateWorkspaceWhiteboard($input: CreateWorkspaceWhiteboardInput!) {
    createWorkspaceWhiteboard(input: $input) { ${whiteboardFields} }
  }
`;

const updateWhiteboardMutation = `
  mutation UpdateWorkspaceWhiteboard(
    $id: Int!
    $input: UpdateWorkspaceWhiteboardInput!
  ) {
    updateWorkspaceWhiteboard(id: $id, input: $input) {
      ${whiteboardFields}
    }
  }
`;

const deleteWhiteboardMutation = `
  mutation DeleteWorkspaceWhiteboard($id: Int!, $mutationId: String!) {
    deleteWorkspaceWhiteboard(id: $id, mutationId: $mutationId) {
      deletedId
    }
  }
`;

const serializeCanvas = (
  value: CreateWhiteboardPayload['canvas_data'],
): string => typeof value === 'string' ? value : JSON.stringify(value);

const mapInput = (
  input: CreateWhiteboardPayload | WhiteboardPayload,
) => ({
  ...(input.title === undefined ? {} : { title: input.title }),
  ...(input.category === undefined ? {} : { category: input.category }),
  ...(input.canvas_data === undefined
    ? {}
    : { canvasData: serializeCanvas(input.canvas_data) }),
  ...(input.canvas_width === undefined
    ? {}
    : { canvasWidth: input.canvas_width }),
  ...(input.canvas_height === undefined
    ? {}
    : { canvasHeight: input.canvas_height }),
  ...(input.background_color === undefined
    ? {}
    : { backgroundColor: input.background_color }),
  ...(input.position_x === undefined
    ? {}
    : { positionX: input.position_x }),
  ...(input.position_y === undefined
    ? {}
    : { positionY: input.position_y }),
  ...(input.z_index === undefined ? {} : { zIndex: input.z_index }),
  ...(input.color_value === undefined
    ? {}
    : { colorValue: input.color_value }),
});

export const createWorkspaceWhiteboardViaGraphql = async (
  input: CreateWhiteboardPayload,
): Promise<LegacyWorkspaceWhiteboard> => {
  const variables = { input: mapInput(input) };
  const data = await graphqlMutationRequest<{
    createWorkspaceWhiteboard: GraphqlWorkspaceWhiteboard;
  }, typeof variables>(createWhiteboardMutation, variables);
  return mapWhiteboard(data.createWorkspaceWhiteboard);
};

export const updateWorkspaceWhiteboardViaGraphql = async (
  id: number,
  input: WhiteboardPayload,
): Promise<LegacyWorkspaceWhiteboard> =>
  enqueueWorkspaceWhiteboardUpdate(id, async () => {
    const variables = {
      id,
      input: {
        mutationId: crypto.randomUUID(),
        expectedUpdatedAt: requireWorkspaceWhiteboardRevision(id),
        ...mapInput(input),
      },
    };
    const data = await graphqlMutationRequest<{
      updateWorkspaceWhiteboard: GraphqlWorkspaceWhiteboard;
    }, typeof variables>(updateWhiteboardMutation, variables);
    return mapWhiteboard(data.updateWorkspaceWhiteboard);
  });

export const deleteWorkspaceWhiteboardViaGraphql = async (
  id: number,
): Promise<{ message: string }> => {
  const variables = { id, mutationId: crypto.randomUUID() };
  const data = await graphqlMutationRequest<{
    deleteWorkspaceWhiteboard: { deletedId: number };
  }, typeof variables>(deleteWhiteboardMutation, variables);
  if (data.deleteWorkspaceWhiteboard.deletedId !== id) {
    throw new Error(
      'GraphQL whiteboard deletion returned an unexpected identity',
    );
  }
  forgetWorkspaceWhiteboardRevision(id);
  return { message: 'Whiteboard deleted successfully' };
};
