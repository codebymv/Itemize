import type { List, Note, Vault, Whiteboard, Wireframe } from '@/types';
import { graphqlRequest } from './graphqlClient';
import {
  listFields,
  mapList,
  mapNote,
  mapWhiteboard,
  mapWireframe,
  noteFields,
  whiteboardFields,
  wireframeFields,
  type GraphqlPageInfo,
  type GraphqlWorkspaceList,
  type GraphqlWorkspaceNote,
  type GraphqlWorkspaceWhiteboard,
  type GraphqlWorkspaceWireframe,
} from './workspaceContentGraphql';
import {
  legacyVault,
  VAULT_FIELDS,
  type GraphqlVault,
} from './workspaceVaultGraphql';

type WorkspaceContentKind =
  | 'lists'
  | 'notes'
  | 'whiteboards'
  | 'wireframes'
  | 'vaults';

type WorkspaceContentPageState = Record<WorkspaceContentKind, {
  total: number;
  hasNextPage: boolean;
}>;

export type WorkspaceContentSnapshot = {
  lists: List[];
  notes: Note[];
  whiteboards: Whiteboard[];
  wireframes: Wireframe[];
  vaults: Vault[];
  pages: WorkspaceContentPageState;
};

type Page<T> = { nodes: T[]; pageInfo: GraphqlPageInfo };

const pageState = (page: GraphqlPageInfo) => ({
  total: page.total,
  hasNextPage: page.hasNextPage,
});

const mapCanvasList = (row: GraphqlWorkspaceList): List => {
  const list = mapList(row);
  return {
    id: list.id as unknown as string,
    title: list.title,
    type: list.type,
    items: list.items,
    createdAt: new Date(list.created_at),
    created_at: list.created_at,
    updated_at: list.updated_at,
    color_value: list.color_value,
    position_x: list.position_x,
    position_y: list.position_y,
    ...(list.width === null ? {} : { width: list.width }),
    ...(list.height === null ? {} : { height: list.height }),
    ...(list.share_token === null ? {} : { share_token: list.share_token }),
    is_public: list.is_public,
    ...(list.shared_at === null ? {} : { shared_at: list.shared_at }),
  };
};

export const getWorkspaceContentSnapshotViaGraphql = async (
  signal?: AbortSignal,
): Promise<WorkspaceContentSnapshot> => {
  type Data = {
    workspaceLists: Page<GraphqlWorkspaceList>;
    workspaceNotes: Page<GraphqlWorkspaceNote>;
    workspaceWhiteboards: Page<GraphqlWorkspaceWhiteboard>;
    workspaceWireframes: Page<GraphqlWorkspaceWireframe>;
    workspaceVaults: Page<GraphqlVault>;
  };
  const variables = { page: { page: 1, pageSize: 50 } };
  const data = await graphqlRequest<Data, typeof variables>(
    `query WorkspaceContentSnapshot($page: PageInput!) {
      workspaceLists(page: $page) {
        nodes { ${listFields} }
        pageInfo { page pageSize total totalPages hasNextPage hasPreviousPage }
      }
      workspaceNotes(page: $page) {
        nodes { ${noteFields} }
        pageInfo { page pageSize total totalPages hasNextPage hasPreviousPage }
      }
      workspaceWhiteboards(page: $page) {
        nodes { ${whiteboardFields} }
        pageInfo { page pageSize total totalPages hasNextPage hasPreviousPage }
      }
      workspaceWireframes(page: $page) {
        nodes { ${wireframeFields} }
        pageInfo { page pageSize total totalPages hasNextPage hasPreviousPage }
      }
      workspaceVaults(page: $page) {
        nodes { ${VAULT_FIELDS} }
        pageInfo { page pageSize total totalPages hasNextPage hasPreviousPage }
      }
    }`,
    variables,
    undefined,
    signal,
  );

  return {
    lists: data.workspaceLists.nodes.map(mapCanvasList),
    notes: data.workspaceNotes.nodes.map(mapNote) as Note[],
    whiteboards: data.workspaceWhiteboards.nodes.map(mapWhiteboard) as Whiteboard[],
    wireframes: data.workspaceWireframes.nodes.map(mapWireframe) as Wireframe[],
    vaults: data.workspaceVaults.nodes.map(legacyVault),
    pages: {
      lists: pageState(data.workspaceLists.pageInfo),
      notes: pageState(data.workspaceNotes.pageInfo),
      whiteboards: pageState(data.workspaceWhiteboards.pageInfo),
      wireframes: pageState(data.workspaceWireframes.pageInfo),
      vaults: pageState(data.workspaceVaults.pageInfo),
    },
  };
};
