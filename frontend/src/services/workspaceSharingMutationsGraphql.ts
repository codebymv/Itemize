import { graphqlMutationRequest } from './graphqlClient';

export type WorkspaceShareKind = 'list' | 'note' | 'whiteboard';

export type WorkspaceShareLink = {
  shareToken: string;
  shareUrl: string;
};

const operations: Record<WorkspaceShareKind, {
  enableField: string;
  enableDocument: string;
  disableField: string;
  disableDocument: string;
}> = {
  list: {
    enableField: 'enableListSharing',
    enableDocument: `
      mutation EnableListSharing($id: Int!) {
        enableListSharing(id: $id) { shareToken shareUrl }
      }
    `,
    disableField: 'disableListSharing',
    disableDocument: `
      mutation DisableListSharing($id: Int!, $mutationId: String!) {
        disableListSharing(id: $id, mutationId: $mutationId) {
          sharingDisabled
        }
      }
    `,
  },
  note: {
    enableField: 'enableNoteSharing',
    enableDocument: `
      mutation EnableNoteSharing($id: Int!) {
        enableNoteSharing(id: $id) { shareToken shareUrl }
      }
    `,
    disableField: 'disableNoteSharing',
    disableDocument: `
      mutation DisableNoteSharing($id: Int!, $mutationId: String!) {
        disableNoteSharing(id: $id, mutationId: $mutationId) {
          sharingDisabled
        }
      }
    `,
  },
  whiteboard: {
    enableField: 'enableWhiteboardSharing',
    enableDocument: `
      mutation EnableWhiteboardSharing($id: Int!) {
        enableWhiteboardSharing(id: $id) { shareToken shareUrl }
      }
    `,
    disableField: 'disableWhiteboardSharing',
    disableDocument: `
      mutation DisableWhiteboardSharing($id: Int!, $mutationId: String!) {
        disableWhiteboardSharing(id: $id, mutationId: $mutationId) {
          sharingDisabled
        }
      }
    `,
  },
};

export const enableWorkspaceSharingViaGraphql = async (
  kind: WorkspaceShareKind,
  id: number,
): Promise<WorkspaceShareLink> => {
  const operation = operations[kind];
  const data = await graphqlMutationRequest<
    Record<string, WorkspaceShareLink>,
    { id: number }
  >(operation.enableDocument, { id });
  const result = data[operation.enableField];
  if (!result?.shareToken || !result.shareUrl) {
    throw new Error('GraphQL sharing mutation returned an invalid link');
  }
  return result;
};

export const disableWorkspaceSharingViaGraphql = async (
  kind: WorkspaceShareKind,
  id: number,
): Promise<void> => {
  const operation = operations[kind];
  const variables = { id, mutationId: crypto.randomUUID() };
  const data = await graphqlMutationRequest<
    Record<string, { sharingDisabled: boolean }>,
    typeof variables
  >(operation.disableDocument, variables);
  if (!data[operation.disableField]?.sharingDisabled) {
    throw new Error('GraphQL sharing revocation did not commit');
  }
};

export const enableListSharingViaGraphql = (id: number) =>
  enableWorkspaceSharingViaGraphql('list', id);
export const disableListSharingViaGraphql = (id: number) =>
  disableWorkspaceSharingViaGraphql('list', id);
export const enableNoteSharingViaGraphql = (id: number) =>
  enableWorkspaceSharingViaGraphql('note', id);
export const disableNoteSharingViaGraphql = (id: number) =>
  disableWorkspaceSharingViaGraphql('note', id);
export const enableWhiteboardSharingViaGraphql = (id: number) =>
  enableWorkspaceSharingViaGraphql('whiteboard', id);
export const disableWhiteboardSharingViaGraphql = (id: number) =>
  disableWorkspaceSharingViaGraphql('whiteboard', id);
