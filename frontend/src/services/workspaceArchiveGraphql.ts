import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import {
  listFields,
  mapList,
  mapNote,
  mapWhiteboard,
  mapWireframe,
  noteFields,
  whiteboardFields,
  wireframeFields,
  type GraphqlWorkspaceList,
  type GraphqlWorkspaceNote,
  type GraphqlWorkspaceWhiteboard,
  type GraphqlWorkspaceWireframe,
} from './workspaceContentGraphql';
import { frameFields, mapFrame, type GraphqlWorkspaceFrame } from './workspaceFramesGraphql';
import type { Note, Whiteboard, Wireframe, WorkspaceFrame } from '@/types';
import type { LegacyWorkspaceList } from './workspaceContentGraphql';

/** What can be archived: every card type with a text surface, plus frames. Vaults wait. */
export type ArchivableKind = 'list' | 'note' | 'whiteboard' | 'wireframe' | 'frame';

export interface WorkspaceArchiveResult {
  type: ArchivableKind;
  id: number;
  archivedAt: string | null;
}

const setArchivedMutation = `
  mutation SetWorkspaceContentArchived($input: SetWorkspaceContentArchivedInput!) {
    setWorkspaceContentArchived(input: $input) { type id archivedAt }
  }
`;

export const setWorkspaceContentArchivedViaGraphql = async (
  type: ArchivableKind,
  id: number,
  archived: boolean,
): Promise<WorkspaceArchiveResult> => {
  const variables = { input: { mutationId: crypto.randomUUID(), type, id, archived } };
  const data = await graphqlMutationRequest<{
    setWorkspaceContentArchived: WorkspaceArchiveResult;
  }, typeof variables>(setArchivedMutation, variables);
  return data.setWorkspaceContentArchived;
};

export interface ArchivedWorkspaceContent {
  lists: LegacyWorkspaceList[];
  notes: Note[];
  whiteboards: Whiteboard[];
  wireframes: Wireframe[];
  frames: WorkspaceFrame[];
}

const archivedQuery = `
  query ArchivedWorkspaceContent($filter: WorkspaceContentFilterInput, $page: PageInput) {
    workspaceLists(filter: $filter, page: $page) { nodes { ${listFields} } }
    workspaceNotes(filter: $filter, page: $page) { nodes { ${noteFields} } }
    workspaceWhiteboards(filter: $filter, page: $page) { nodes { ${whiteboardFields} } }
    workspaceWireframes(filter: $filter, page: $page) { nodes { ${wireframeFields} } }
    workspaceFrames(page: $page, archived: "archived") { nodes { ${frameFields} } }
  }
`;

/** Everything the owner has archived, newest first per family, in one read. */
export const getArchivedWorkspaceContentViaGraphql = async (
  signal?: AbortSignal,
): Promise<ArchivedWorkspaceContent> => {
  const variables = { filter: { archived: 'archived' }, page: { page: 1, pageSize: 100 } };
  const data = await graphqlRequest<{
    workspaceLists: { nodes: GraphqlWorkspaceList[] };
    workspaceNotes: { nodes: GraphqlWorkspaceNote[] };
    workspaceWhiteboards: { nodes: GraphqlWorkspaceWhiteboard[] };
    workspaceWireframes: { nodes: GraphqlWorkspaceWireframe[] };
    workspaceFrames: { nodes: GraphqlWorkspaceFrame[] };
  }, typeof variables>(archivedQuery, variables, undefined, signal);
  return {
    lists: data.workspaceLists.nodes.map(mapList),
    notes: data.workspaceNotes.nodes.map(mapNote) as Note[],
    whiteboards: data.workspaceWhiteboards.nodes.map(mapWhiteboard) as Whiteboard[],
    wireframes: data.workspaceWireframes.nodes.map(mapWireframe) as Wireframe[],
    frames: data.workspaceFrames.nodes.map(mapFrame),
  };
};
