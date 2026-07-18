import type { CreateNotePayload, NotePayload } from './api';
import { graphqlMutationRequest } from './graphqlClient';
import type { LegacyWorkspaceNote } from './workspaceContentGraphql';

type GraphqlWorkspaceNote = {
  id: number;
  userId: number;
  title: string;
  content: string;
  category: string;
  categoryId: number | null;
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

const noteFields = `
  id userId title content category categoryId
  colorValue positionX positionY width height zIndex
  shareToken isPublic sharedAt createdAt updatedAt
`;

const createNoteMutation = `
  mutation CreateWorkspaceNote($input: CreateWorkspaceNoteInput!) {
    createWorkspaceNote(input: $input) { ${noteFields} }
  }
`;

const updateNoteMutation = `
  mutation UpdateWorkspaceNote($id: Int!, $input: UpdateWorkspaceNoteInput!) {
    updateWorkspaceNote(id: $id, input: $input) { ${noteFields} }
  }
`;

const deleteNoteMutation = `
  mutation DeleteWorkspaceNote($id: Int!, $mutationId: String!) {
    deleteWorkspaceNote(id: $id, mutationId: $mutationId) { deletedId }
  }
`;

const mapNote = (note: GraphqlWorkspaceNote): LegacyWorkspaceNote => ({
  id: note.id,
  user_id: note.userId,
  title: note.title,
  content: note.content,
  category: note.category,
  category_id: note.categoryId,
  color_value: note.colorValue,
  position_x: note.positionX,
  position_y: note.positionY,
  width: note.width,
  height: note.height,
  z_index: note.zIndex,
  share_token: note.shareToken,
  is_public: note.isPublic,
  shared_at: note.sharedAt,
  created_at: note.createdAt,
  updated_at: note.updatedAt,
});

const mapInput = (input: CreateNotePayload | NotePayload) => ({
  ...(input.title === undefined ? {} : { title: input.title }),
  ...(input.content === undefined ? {} : { content: input.content }),
  ...(input.category === undefined ? {} : { category: input.category }),
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
  ...(input.z_index === undefined ? {} : { zIndex: input.z_index }),
});

export const createWorkspaceNoteViaGraphql = async (
  input: CreateNotePayload,
): Promise<LegacyWorkspaceNote> => {
  const variables = { input: mapInput(input) };
  const data = await graphqlMutationRequest<
    { createWorkspaceNote: GraphqlWorkspaceNote },
    typeof variables
  >(createNoteMutation, variables);
  return mapNote(data.createWorkspaceNote);
};

export const updateWorkspaceNoteViaGraphql = async (
  id: number,
  input: NotePayload,
): Promise<LegacyWorkspaceNote> => {
  const variables = {
    id,
    input: {
      mutationId: crypto.randomUUID(),
      ...mapInput(input),
    },
  };
  const data = await graphqlMutationRequest<
    { updateWorkspaceNote: GraphqlWorkspaceNote },
    typeof variables
  >(updateNoteMutation, variables);
  return mapNote(data.updateWorkspaceNote);
};

export const deleteWorkspaceNoteViaGraphql = async (
  id: number,
): Promise<{ message: string }> => {
  const variables = { id, mutationId: crypto.randomUUID() };
  const data = await graphqlMutationRequest<
    { deleteWorkspaceNote: { deletedId: number } },
    typeof variables
  >(deleteNoteMutation, variables);
  if (data.deleteWorkspaceNote.deletedId !== id) {
    throw new Error('GraphQL note deletion returned an unexpected identity');
  }
  return { message: 'Note deleted successfully' };
};
