import type { ListPayload } from './api';
import { graphqlMutationRequest } from './graphqlClient';
import type { LegacyWorkspaceList } from './workspaceContentGraphql';

type GraphqlWorkspaceList = {
  id: number;
  userId: number;
  title: string;
  category: string;
  categoryId: number | null;
  items: Array<{ id: string; text: string; completed: boolean }>;
  colorValue: string | null;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  zIndex: number;
  shareToken: string | null;
  isPublic: boolean;
  sharedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const listFields = `
  id userId title category categoryId
  items { id text completed }
  colorValue positionX positionY width height zIndex
  shareToken isPublic sharedAt createdAt updatedAt
`;

const createListMutation = `
  mutation CreateWorkspaceList($input: CreateWorkspaceListInput!) {
    createWorkspaceList(input: $input) { ${listFields} }
  }
`;

const updateListMutation = `
  mutation UpdateWorkspaceList($id: Int!, $input: UpdateWorkspaceListInput!) {
    updateWorkspaceList(id: $id, input: $input) { ${listFields} }
  }
`;

const deleteListMutation = `
  mutation DeleteWorkspaceList($id: Int!, $mutationId: String!) {
    deleteWorkspaceList(id: $id, mutationId: $mutationId) { deletedId }
  }
`;

const mapList = (list: GraphqlWorkspaceList): LegacyWorkspaceList => ({
  id: list.id,
  user_id: list.userId,
  title: list.title,
  category: list.category,
  type: list.category,
  category_id: list.categoryId,
  items: list.items,
  color_value: list.colorValue,
  position_x: list.positionX,
  position_y: list.positionY,
  width: list.width,
  height: list.height,
  z_index: list.zIndex,
  share_token: list.shareToken,
  is_public: list.isPublic,
  shared_at: list.sharedAt,
  created_at: list.createdAt,
  updated_at: list.updatedAt,
});

const mapInput = (input: ListPayload) => ({
  title: input.title,
  category: input.type || input.category || 'General',
  ...(input.items === undefined ? {} : { items: input.items }),
  ...(input.color_value === undefined
    ? {}
    : { colorValue: input.color_value }),
  ...(input.position_x === undefined
    ? {}
    : { positionX: input.position_x }),
  ...(input.position_y === undefined
    ? {}
    : { positionY: input.position_y }),
  ...(input.width === undefined ? {} : { width: input.width }),
  ...(input.height === undefined ? {} : { height: input.height }),
});

export const createWorkspaceListViaGraphql = async (
  input: ListPayload,
): Promise<LegacyWorkspaceList> => {
  const variables = { input: mapInput(input) };
  const data = await graphqlMutationRequest<
    { createWorkspaceList: GraphqlWorkspaceList },
    typeof variables
  >(createListMutation, variables);
  return mapList(data.createWorkspaceList);
};

export const updateWorkspaceListViaGraphql = async (
  input: ListPayload & { id: string | number },
): Promise<LegacyWorkspaceList> => {
  if (!input.updated_at) {
    throw new Error(
      'List revision is unavailable; reload the list before updating it',
    );
  }
  const variables = {
    id: Number(input.id),
    input: {
      mutationId: crypto.randomUUID(),
      expectedUpdatedAt: input.updated_at,
      ...mapInput(input),
    },
  };
  const data = await graphqlMutationRequest<
    { updateWorkspaceList: GraphqlWorkspaceList },
    typeof variables
  >(updateListMutation, variables);
  return mapList(data.updateWorkspaceList);
};

export const deleteWorkspaceListViaGraphql = async (
  id: string | number,
): Promise<{ message: string }> => {
  const numericId = Number(id);
  const variables = { id: numericId, mutationId: crypto.randomUUID() };
  const data = await graphqlMutationRequest<
    { deleteWorkspaceList: { deletedId: number } },
    typeof variables
  >(deleteListMutation, variables);
  if (data.deleteWorkspaceList.deletedId !== numericId) {
    throw new Error('GraphQL list deletion returned an unexpected identity');
  }
  return { message: 'List deleted successfully' };
};
