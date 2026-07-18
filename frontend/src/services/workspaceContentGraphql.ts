import { graphqlRequest } from './graphqlClient';
import { rememberWorkspaceWhiteboardRevision } from './workspaceWhiteboardRevision';

type GraphqlPageInfo = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

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

export type GraphqlWorkspaceWhiteboard = {
  id: number;
  userId: number;
  title: string;
  category: string;
  categoryId: number | null;
  canvasData: string;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  positionX: number;
  positionY: number;
  zIndex: number;
  colorValue: string | null;
  shareToken: string | null;
  isPublic: boolean;
  sharedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LegacyWorkspaceList = {
  id: number;
  user_id: number;
  title: string;
  category: string;
  type: string;
  category_id: number | null;
  items: Array<{ id: string; text: string; completed: boolean }>;
  color_value: string | null;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  z_index: number;
  share_token: string | null;
  is_public: boolean;
  shared_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LegacyWorkspaceNote = {
  id: number;
  user_id: number;
  title: string;
  content: string;
  category: string;
  category_id: number | null;
  color_value: string | null;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  z_index: number;
  share_token: string | null;
  is_public: boolean;
  shared_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LegacyWorkspaceWhiteboard = {
  id: number;
  user_id: number;
  title: string;
  category: string;
  category_id: number | null;
  canvas_data: unknown;
  canvas_width: number;
  canvas_height: number;
  background_color: string;
  position_x: number;
  position_y: number;
  z_index: number;
  color_value: string | null;
  share_token: string | null;
  is_public: boolean;
  shared_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LegacyPageInfo = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

const listFields = `
  id userId title category categoryId
  items { id text completed }
  colorValue positionX positionY width height zIndex
  shareToken isPublic sharedAt createdAt updatedAt
`;

const noteFields = `
  id userId title content category categoryId
  colorValue positionX positionY width height zIndex
  shareToken isPublic sharedAt createdAt updatedAt
`;

export const whiteboardFields = `
  id userId title category categoryId canvasData
  canvasWidth canvasHeight backgroundColor
  positionX positionY zIndex colorValue
  shareToken isPublic sharedAt createdAt updatedAt
`;

const listsQuery = `
  query WorkspaceLists($page: PageInput) {
    workspaceLists(page: $page) {
      nodes { ${listFields} }
      pageInfo {
        page pageSize total totalPages hasNextPage hasPreviousPage
      }
    }
  }
`;

const notesQuery = `
  query WorkspaceNotes($page: PageInput) {
    workspaceNotes(page: $page) {
      nodes { ${noteFields} }
      pageInfo {
        page pageSize total totalPages hasNextPage hasPreviousPage
      }
    }
  }
`;

const whiteboardsQuery = `
  query WorkspaceWhiteboards($page: PageInput) {
    workspaceWhiteboards(page: $page) {
      nodes { ${whiteboardFields} }
      pageInfo {
        page pageSize total totalPages hasNextPage hasPreviousPage
      }
    }
  }
`;

const mapPage = (page: GraphqlPageInfo): LegacyPageInfo => ({
  page: page.page,
  limit: page.pageSize,
  total: page.total,
  totalPages: page.totalPages,
  hasNext: page.hasNextPage,
  hasPrev: page.hasPreviousPage,
});

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

export const mapWhiteboard = (
  whiteboard: GraphqlWorkspaceWhiteboard,
): LegacyWorkspaceWhiteboard => {
  let canvasData: unknown = [];
  try {
    canvasData = JSON.parse(whiteboard.canvasData);
  } catch {
    canvasData = [];
  }
  rememberWorkspaceWhiteboardRevision(
    whiteboard.id,
    whiteboard.updatedAt,
  );
  return {
    id: whiteboard.id,
    user_id: whiteboard.userId,
    title: whiteboard.title,
    category: whiteboard.category,
    category_id: whiteboard.categoryId,
    canvas_data: canvasData,
    canvas_width: whiteboard.canvasWidth,
    canvas_height: whiteboard.canvasHeight,
    background_color: whiteboard.backgroundColor,
    position_x: whiteboard.positionX,
    position_y: whiteboard.positionY,
    z_index: whiteboard.zIndex,
    color_value: whiteboard.colorValue,
    share_token: whiteboard.shareToken,
    is_public: whiteboard.isPublic,
    shared_at: whiteboard.sharedAt,
    created_at: whiteboard.createdAt,
    updated_at: whiteboard.updatedAt,
  };
};

const listPage = async (page: number, pageSize: number) => {
  const variables = { page: { page, pageSize } };
  const data = await graphqlRequest<{
    workspaceLists: {
      nodes: GraphqlWorkspaceList[];
      pageInfo: GraphqlPageInfo;
    };
  }, typeof variables>(listsQuery, variables);
  return data.workspaceLists;
};

export const getWorkspaceListsViaGraphql = async (
  page = 1,
  limit = 50,
): Promise<{ lists: LegacyWorkspaceList[]; pagination: LegacyPageInfo }> => {
  const result = await listPage(page, limit);
  return {
    lists: result.nodes.map(mapList),
    pagination: mapPage(result.pageInfo),
  };
};

export const getCanvasListsViaGraphql =
  async (): Promise<LegacyWorkspaceList[]> => {
    const first = await listPage(1, 100);
    const lists = first.nodes.map(mapList);
    for (let page = 2; page <= first.pageInfo.totalPages; page += 1) {
      const result = await listPage(page, 100);
      lists.push(...result.nodes.map(mapList));
    }
    return lists;
  };

export const getWorkspaceNotesViaGraphql = async (
  page = 1,
  limit = 50,
): Promise<{ notes: LegacyWorkspaceNote[]; pagination: LegacyPageInfo }> => {
  const variables = { page: { page, pageSize: limit } };
  const data = await graphqlRequest<{
    workspaceNotes: {
      nodes: GraphqlWorkspaceNote[];
      pageInfo: GraphqlPageInfo;
    };
  }, typeof variables>(notesQuery, variables);
  return {
    notes: data.workspaceNotes.nodes.map(mapNote),
    pagination: mapPage(data.workspaceNotes.pageInfo),
  };
};

export const getWorkspaceWhiteboardsViaGraphql = async (
  page = 1,
  limit = 50,
): Promise<{
  whiteboards: LegacyWorkspaceWhiteboard[];
  pagination: LegacyPageInfo;
}> => {
  const variables = { page: { page, pageSize: limit } };
  const data = await graphqlRequest<{
    workspaceWhiteboards: {
      nodes: GraphqlWorkspaceWhiteboard[];
      pageInfo: GraphqlPageInfo;
    };
  }, typeof variables>(whiteboardsQuery, variables);
  return {
    whiteboards: data.workspaceWhiteboards.nodes.map(mapWhiteboard),
    pagination: mapPage(data.workspaceWhiteboards.pageInfo),
  };
};
