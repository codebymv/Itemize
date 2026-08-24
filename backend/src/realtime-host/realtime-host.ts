/**
 * Faithful port of the retained Socket.IO room authorization and
 * broadcast contracts (backend/src/lib/websocket.js). Room names,
 * event names, capability validation, per-socket limits, viewer
 * tracking, and the broadcast adapter surface must stay identical: the
 * realtime contract freezes them, and the outbox delivery worker and
 * every connected page depend on these exact shapes.
 */
import { Pool } from 'pg';
import { Server, Socket } from 'socket.io';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHAT_SESSION_PATTERN = /^cs_[0-9a-f]{48}$/;
const MAX_PUBLIC_ROOMS_PER_SOCKET = 8;

type SharedRoomConfig = {
  event: string;
  joinedEvent: string;
  updateEvent: string;
  table: string;
  roomPrefix: string;
  titleField: string;
};

export const SHARED_ROOM_TYPES: Readonly<Record<string, SharedRoomConfig>> =
  Object.freeze({
    list: {
      event: 'joinSharedList', joinedEvent: 'joinedSharedList', updateEvent: 'listUpdated',
      table: 'lists', roomPrefix: 'shared-list-', titleField: 'listTitle',
    },
    note: {
      event: 'joinSharedNote', joinedEvent: 'joinedSharedNote', updateEvent: 'noteUpdated',
      table: 'notes', roomPrefix: 'shared-note-', titleField: 'noteTitle',
    },
    whiteboard: {
      event: 'joinSharedWhiteboard', joinedEvent: 'joinedSharedWhiteboard', updateEvent: 'whiteboardUpdated',
      table: 'whiteboards', roomPrefix: 'shared-whiteboard-', titleField: 'whiteboardTitle',
    },
    wireframe: {
      event: 'joinSharedWireframe', joinedEvent: 'joinedSharedWireframe', updateEvent: 'wireframeUpdated',
      table: 'wireframes', roomPrefix: 'shared-wireframe-', titleField: 'wireframeTitle',
    },
  });

export type SocketIdentityVerifier = (
  cookieHeader: string | undefined,
) => Promise<number | null>;

type SocketRealtimeState = {
  userId: number | null;
  publicRooms: Set<string>;
  chatSessions: Set<string>;
  organizationRooms: Set<string>;
};

export type RealtimeBroadcast = {
  listUpdate: (token: string, type: string, data: unknown, occurredAt?: string) => void;
  noteUpdate: (token: string, type: string, data: unknown, occurredAt?: string) => void;
  whiteboardUpdate: (token: string, type: string, data: unknown, occurredAt?: string) => void;
  wireframeUpdate: (token: string, type: string, data: unknown, occurredAt?: string) => void;
  userListUpdate: (userId: unknown, type: string, data: unknown, occurredAt?: string) => void;
  userWireframeUpdate: (userId: unknown, type: string, data: unknown, occurredAt?: string) => void;
  userListDeleted: (userId: unknown, data: unknown, occurredAt?: string) => void;
  revokeShared: (kind: string, shareToken: string, reason?: string) => Promise<boolean>;
  endChatSession: (sessionToken: string, reason?: string) => Promise<boolean>;
  chatMessage: (sessionToken: string, message: unknown, occurredAt?: string) => Promise<boolean>;
  notificationCreated: (userId: unknown, data: unknown, occurredAt?: string) => void;
};

export const parseOrganizationId = (value: unknown): number | null => {
  const normalized = typeof value === 'number' ? String(value) : value;
  if (typeof normalized !== 'string' || !/^[1-9]\d*$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const isShareToken = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

export const isChatSessionToken = (value: unknown): value is string =>
  typeof value === 'string' && CHAT_SESSION_PATTERN.test(value);

const isTypingValue = (value: unknown): value is boolean =>
  typeof value === 'boolean';

const emitRealtimeError = (
  socket: Socket,
  code: string,
  message: string,
): void => {
  socket.emit('realtimeError', { code, message });
};

const getSocketState = (socket: Socket): SocketRealtimeState => {
  const data = socket.data as { realtime?: SocketRealtimeState };
  data.realtime ||= {
    userId: null,
    publicRooms: new Set(),
    chatSessions: new Set(),
    organizationRooms: new Set(),
  };
  return data.realtime;
};

export function createBroadcast(
  io: Server,
  onSharedRevoked: (kind: string, shareToken: string, socket: { id: string; data?: { realtime?: SocketRealtimeState } }) => void = () => undefined,
  onChatSessionEnded: (sessionToken: string, socket: { id: string; data?: { realtime?: SocketRealtimeState } }) => void = () => undefined,
): RealtimeBroadcast {
  const sharedBroadcast = (
    kind: string,
    shareToken: string,
    eventType: string,
    data: unknown,
    occurredAt?: string,
  ): void => {
    const config = SHARED_ROOM_TYPES[kind];
    if (!io || !isShareToken(shareToken) || !config || typeof eventType !== 'string') {
      return;
    }
    io.to(`${config.roomPrefix}${shareToken}`).emit(config.updateEvent, {
      type: eventType,
      data,
      timestamp: occurredAt || new Date().toISOString(),
    });
  };

  const userBroadcast = (
    userId: unknown,
    eventName: string,
    eventType: string,
    data: unknown,
    occurredAt?: string,
  ): void => {
    const parsedUserId = parseOrganizationId(userId);
    if (!io || !parsedUserId) return;
    io.to(`user-canvas-${parsedUserId}`).emit(eventName, {
      type: eventType,
      data,
      timestamp: occurredAt || new Date().toISOString(),
    });
  };

  const notificationCreated = (
    userId: unknown,
    data: unknown,
    occurredAt?: string,
  ): void => {
    const parsedUserId = parseOrganizationId(userId);
    if (!io || !parsedUserId) return;
    io.to(`user-notifications-${parsedUserId}`).emit('notificationCreated', {
      ...(data && typeof data === 'object' ? data : {}),
      timestamp: occurredAt || new Date().toISOString(),
    });
  };

  const revokeShared = async (
    kind: string,
    shareToken: string,
    reason = 'sharing_revoked',
  ): Promise<boolean> => {
    const config = SHARED_ROOM_TYPES[kind];
    if (!io || !isShareToken(shareToken) || !config || typeof io.in !== 'function') {
      return false;
    }
    const roomName = `${config.roomPrefix}${shareToken}`;
    const sockets = await io.in(roomName).fetchSockets();
    io.to(roomName).emit('sharedContentRevoked', {
      kind,
      reason,
      timestamp: new Date().toISOString(),
    });
    await Promise.all(
      sockets.map(async (socket) => {
        socket.leave(roomName);
        onSharedRevoked(kind, shareToken, socket);
      }),
    );
    return true;
  };

  const endChatSession = async (
    sessionToken: string,
    reason = 'session_ended',
  ): Promise<boolean> => {
    if (!io || !isChatSessionToken(sessionToken) || typeof io.in !== 'function') {
      return false;
    }
    const roomName = `chat-session-${sessionToken}`;
    const sockets = await io.in(roomName).fetchSockets();
    io.to(roomName).emit('chatSessionEnded', {
      reason,
      timestamp: new Date().toISOString(),
    });
    await Promise.all(
      sockets.map(async (socket) => {
        socket.leave(roomName);
        onChatSessionEnded(sessionToken, socket);
      }),
    );
    return true;
  };

  const chatMessage = async (
    sessionToken: string,
    message: unknown,
    occurredAt?: string,
  ): Promise<boolean> => {
    if (!io || !isChatSessionToken(sessionToken) || !message) return false;
    io.to(`chat-session-${sessionToken}`).emit('newChatMessage', {
      message,
      timestamp: occurredAt || new Date().toISOString(),
    });
    return true;
  };

  return {
    listUpdate: (token, type, data, occurredAt) => sharedBroadcast('list', token, type, data, occurredAt),
    noteUpdate: (token, type, data, occurredAt) => sharedBroadcast('note', token, type, data, occurredAt),
    whiteboardUpdate: (token, type, data, occurredAt) => sharedBroadcast('whiteboard', token, type, data, occurredAt),
    wireframeUpdate: (token, type, data, occurredAt) => sharedBroadcast('wireframe', token, type, data, occurredAt),
    userListUpdate: (userId, type, data, occurredAt) => userBroadcast(userId, 'userListUpdated', type, data, occurredAt),
    userWireframeUpdate: (userId, type, data, occurredAt) => userBroadcast(userId, 'userWireframeUpdated', type, data, occurredAt),
    userListDeleted: (userId, data, occurredAt) => userBroadcast(userId, 'userListDeleted', 'LIST_DELETED', data, occurredAt),
    revokeShared,
    endChatSession,
    chatMessage,
    notificationCreated,
  };
}

export type RealtimeHost = {
  broadcast: RealtimeBroadcast;
  viewers: {
    list: Map<string, Set<string>>;
    note: Map<string, Set<string>>;
    whiteboard: Map<string, Set<string>>;
    wireframe: Map<string, Set<string>>;
    userCanvas: Map<number, Set<string>>;
  };
};

export function initializeRealtimeHost(
  io: Server,
  pool: Pool,
  verifyIdentity: SocketIdentityVerifier,
): RealtimeHost {
  const viewerMaps: Record<string, Map<string, Set<string>>> =
    Object.fromEntries(
      Object.keys(SHARED_ROOM_TYPES).map((kind) => [kind, new Map()]),
    );
  const userCanvasConnections = new Map<number, Set<string>>();
  const chatSessionConnections = new Map<string, Set<string>>();
  const organizationConnections = new Map<string, Set<string>>();

  const emitViewerCount = (kind: string, token: string): void => {
    const config = SHARED_ROOM_TYPES[kind];
    const count = viewerMaps[kind].get(token)?.size || 0;
    io.to(`${config.roomPrefix}${token}`).emit('viewerCount', count);
  };

  const trackConnection = <K>(
    map: Map<K, Set<string>>,
    key: K,
    socketId: string,
  ): void => {
    if (!map.has(key)) map.set(key, new Set());
    (map.get(key) as Set<string>).add(socketId);
  };

  const removeConnection = <K>(
    map: Map<K, Set<string>>,
    key: K,
    socketId: string,
  ): boolean => {
    const connections = map.get(key);
    if (!connections?.delete(socketId)) return false;
    if (connections.size === 0) map.delete(key);
    return true;
  };

  const authenticateSocket = async (socket: Socket): Promise<number | null> => {
    const state = getSocketState(socket);
    if (state.userId) return state.userId;
    const userId = await verifyIdentity(socket.handshake?.headers?.cookie);
    if (!userId) return null;
    state.userId = userId;
    return userId;
  };

  const broadcast = createBroadcast(
    io,
    (kind, shareToken, socket) => {
      removeConnection(viewerMaps[kind], shareToken, socket.id);
      const publicRooms = socket.data?.realtime?.publicRooms;
      if (typeof publicRooms?.delete === 'function') {
        publicRooms.delete(`${kind}:${shareToken}`);
      }
    },
    (sessionToken, socket) => {
      removeConnection(chatSessionConnections, sessionToken, socket.id);
      const chatSessions = socket.data?.realtime?.chatSessions;
      if (typeof chatSessions?.delete === 'function') {
        chatSessions.delete(sessionToken);
      }
    },
  );

  const registerSharedJoin = (
    socket: Socket,
    kind: string,
    config: SharedRoomConfig,
  ): void => {
    socket.on(config.event, async (shareToken: unknown) => {
      if (!isShareToken(shareToken)) {
        emitRealtimeError(socket, 'INVALID_CAPABILITY', 'Invalid or inactive share link');
        return;
      }

      const state = getSocketState(socket);
      const trackingKey = `${kind}:${shareToken}`;
      if (
        !state.publicRooms.has(trackingKey) &&
        state.publicRooms.size >= MAX_PUBLIC_ROOMS_PER_SOCKET
      ) {
        emitRealtimeError(socket, 'ROOM_LIMIT', 'Too many realtime rooms');
        return;
      }

      try {
        const result = await pool.query<{ id: number; title: string }>(
          `SELECT id, title FROM ${config.table} WHERE share_token = $1 AND is_public = TRUE`,
          [shareToken],
        );
        if (result.rows.length === 0) {
          emitRealtimeError(socket, 'INVALID_CAPABILITY', 'Invalid or inactive share link');
          return;
        }

        const roomName = `${config.roomPrefix}${shareToken}`;
        await socket.join(roomName);
        state.publicRooms.add(trackingKey);
        trackConnection(viewerMaps[kind], shareToken, socket.id);
        socket.emit(config.joinedEvent, { [config.titleField]: result.rows[0].title });
        emitViewerCount(kind, shareToken);
      } catch {
        emitRealtimeError(socket, 'JOIN_FAILED', 'Failed to join realtime room');
      }
    });
  };

  const registerOrganizationJoin = (
    socket: Socket,
    eventName: string,
    channel: string,
  ): void => {
    socket.on(eventName, async (data: { organizationId?: unknown }) => {
      const organizationId = parseOrganizationId(data?.organizationId);
      const userId = await authenticateSocket(socket);
      if (!userId) {
        emitRealtimeError(socket, 'UNAUTHENTICATED', 'Authentication required');
        return;
      }
      if (!organizationId) {
        emitRealtimeError(socket, 'BAD_INPUT', 'Invalid organization');
        return;
      }

      try {
        const member = await pool.query(
          'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
          [organizationId, userId],
        );
        if (member.rows.length === 0) {
          emitRealtimeError(socket, 'FORBIDDEN', 'Not authorized for this organization');
          return;
        }

        const roomName = `org-${channel}-${organizationId}`;
        await socket.join(roomName);
        const trackingKey = `${channel}:${organizationId}`;
        getSocketState(socket).organizationRooms.add(trackingKey);
        trackConnection(organizationConnections, trackingKey, socket.id);
        socket.emit(`joinedOrg${channel[0].toUpperCase()}${channel.slice(1)}`, {
          organizationId,
        });
      } catch {
        emitRealtimeError(socket, 'JOIN_FAILED', 'Failed to join organization realtime room');
      }
    });
  };

  io.on('connection', (socket) => {
    getSocketState(socket);

    socket.on('joinUserCanvas', async () => {
      const userId = await authenticateSocket(socket);
      if (!userId) {
        emitRealtimeError(socket, 'UNAUTHENTICATED', 'Authentication required');
        return;
      }
      await socket.join(`user-canvas-${userId}`);
      trackConnection(userCanvasConnections, userId, socket.id);
      socket.emit('joinedUserCanvas', { userId });
    });

    socket.on('joinUserNotifications', async () => {
      const userId = await authenticateSocket(socket);
      if (!userId) {
        emitRealtimeError(socket, 'UNAUTHENTICATED', 'Authentication required');
        return;
      }
      await socket.join(`user-notifications-${userId}`);
      socket.emit('joinedUserNotifications', { userId });
    });

    for (const [kind, config] of Object.entries(SHARED_ROOM_TYPES)) {
      registerSharedJoin(socket, kind, config);
    }

    socket.on('joinChatSession', async (sessionToken: unknown) => {
      if (!isChatSessionToken(sessionToken)) {
        emitRealtimeError(socket, 'INVALID_CAPABILITY', 'Invalid or inactive session');
        return;
      }

      try {
        const result = await pool.query<{ id: number; organization_id: number }>(
          `SELECT id, organization_id FROM chat_sessions
           WHERE session_token = $1 AND status = 'active'`,
          [sessionToken],
        );
        if (result.rows.length === 0) {
          emitRealtimeError(socket, 'INVALID_CAPABILITY', 'Invalid or inactive session');
          return;
        }

        await socket.join(`chat-session-${sessionToken}`);
        getSocketState(socket).chatSessions.add(sessionToken);
        trackConnection(chatSessionConnections, sessionToken, socket.id);
        socket.emit('joinedChatSession', { sessionId: result.rows[0].id });
      } catch {
        emitRealtimeError(socket, 'JOIN_FAILED', 'Failed to join chat session');
      }
    });

    registerOrganizationJoin(socket, 'joinOrgChat', 'chat');
    registerOrganizationJoin(socket, 'joinOrgSocial', 'social');

    socket.on('agentTyping', async (data: { sessionToken?: unknown; isTyping?: unknown }) => {
      const sessionToken = data?.sessionToken;
      const userId = await authenticateSocket(socket);
      if (!userId) {
        emitRealtimeError(socket, 'UNAUTHENTICATED', 'Authentication required');
        return;
      }
      if (!isChatSessionToken(sessionToken) || !isTypingValue(data?.isTyping)) {
        emitRealtimeError(socket, 'BAD_INPUT', 'Invalid typing event');
        return;
      }

      try {
        const authorized = await pool.query(
          `SELECT cs.id
           FROM chat_sessions cs
           JOIN organization_members om
             ON om.organization_id = cs.organization_id AND om.user_id = $2
           WHERE cs.session_token = $1 AND cs.status = 'active'`,
          [sessionToken, userId],
        );
        if (authorized.rows.length === 0) {
          emitRealtimeError(socket, 'FORBIDDEN', 'Not authorized for this chat session');
          return;
        }

        io.to(`chat-session-${sessionToken}`).emit('agentTyping', {
          isTyping: data.isTyping,
          timestamp: new Date().toISOString(),
        });
      } catch {
        emitRealtimeError(socket, 'EVENT_FAILED', 'Failed to publish typing state');
      }
    });

    socket.on('visitorTyping', async (data: { sessionToken?: unknown; isTyping?: unknown }) => {
      const sessionToken = data?.sessionToken;
      if (!isChatSessionToken(sessionToken) || !isTypingValue(data?.isTyping)) {
        emitRealtimeError(socket, 'BAD_INPUT', 'Invalid typing event');
        return;
      }
      if (!getSocketState(socket).chatSessions.has(sessionToken)) {
        emitRealtimeError(socket, 'FORBIDDEN', 'Join the chat session before publishing typing state');
        return;
      }

      try {
        const result = await pool.query<{ id: number; organization_id: number }>(
          `SELECT id, organization_id FROM chat_sessions
           WHERE session_token = $1 AND status = 'active'`,
          [sessionToken],
        );
        if (result.rows.length === 0) {
          emitRealtimeError(socket, 'INVALID_CAPABILITY', 'Invalid or inactive session');
          return;
        }

        io.to(`org-chat-${result.rows[0].organization_id}`).emit('visitorTyping', {
          sessionId: result.rows[0].id,
          isTyping: data.isTyping,
          timestamp: new Date().toISOString(),
        });
      } catch {
        emitRealtimeError(socket, 'EVENT_FAILED', 'Failed to publish typing state');
      }
    });

    socket.on('disconnect', () => {
      const state = getSocketState(socket);
      for (const trackingKey of state.publicRooms) {
        const [kind, shareToken] = trackingKey.split(':');
        if (removeConnection(viewerMaps[kind], shareToken, socket.id)) {
          emitViewerCount(kind, shareToken);
        }
      }
      for (const sessionToken of state.chatSessions) {
        removeConnection(chatSessionConnections, sessionToken, socket.id);
      }
      for (const trackingKey of state.organizationRooms) {
        removeConnection(organizationConnections, trackingKey, socket.id);
      }
      if (state.userId) {
        removeConnection(userCanvasConnections, state.userId, socket.id);
      }
    });
  });

  return {
    broadcast,
    viewers: {
      list: viewerMaps.list,
      note: viewerMaps.note,
      whiteboard: viewerMaps.whiteboard,
      wireframe: viewerMaps.wireframe,
      userCanvas: userCanvasConnections,
    },
  };
}
