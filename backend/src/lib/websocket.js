/**
 * Socket.IO room authorization and broadcast contracts.
 * Authenticated rooms use only the httpOnly access cookie from the handshake.
 * Public rooms use validated, database-backed bearer capabilities.
 */
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../auth/config');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHAT_SESSION_PATTERN = /^cs_[0-9a-f]{48}$/;
const MAX_PUBLIC_ROOMS_PER_SOCKET = 8;

const SHARED_ROOM_TYPES = Object.freeze({
    list: Object.freeze({
        event: 'joinSharedList', joinedEvent: 'joinedSharedList', updateEvent: 'listUpdated',
        table: 'lists', roomPrefix: 'shared-list-', titleField: 'listTitle',
    }),
    note: Object.freeze({
        event: 'joinSharedNote', joinedEvent: 'joinedSharedNote', updateEvent: 'noteUpdated',
        table: 'notes', roomPrefix: 'shared-note-', titleField: 'noteTitle',
    }),
    whiteboard: Object.freeze({
        event: 'joinSharedWhiteboard', joinedEvent: 'joinedSharedWhiteboard', updateEvent: 'whiteboardUpdated',
        table: 'whiteboards', roomPrefix: 'shared-whiteboard-', titleField: 'whiteboardTitle',
    }),
    wireframe: Object.freeze({
        event: 'joinSharedWireframe', joinedEvent: 'joinedSharedWireframe', updateEvent: 'wireframeUpdated',
        table: 'wireframes', roomPrefix: 'shared-wireframe-', titleField: 'wireframeTitle',
    }),
});

function parseCookies(header) {
    if (typeof header !== 'string') return {};

    return header.split(';').reduce((cookies, pair) => {
        const separator = pair.indexOf('=');
        if (separator < 1) return cookies;
        const key = pair.slice(0, separator).trim();
        const rawValue = pair.slice(separator + 1).trim();
        try {
            cookies[key] = decodeURIComponent(rawValue);
        } catch {
            cookies[key] = rawValue;
        }
        return cookies;
    }, {});
}

function parseOrganizationId(value) {
    const normalized = typeof value === 'number' ? String(value) : value;
    if (typeof normalized !== 'string' || !/^[1-9]\d*$/.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function isShareToken(value) {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isChatSessionToken(value) {
    return typeof value === 'string' && CHAT_SESSION_PATTERN.test(value);
}

function isTypingValue(value) {
    return typeof value === 'boolean';
}

function emitRealtimeError(socket, code, message) {
    socket.emit('realtimeError', { code, message });
}

function getSocketState(socket) {
    socket.data ||= {};
    socket.data.realtime ||= {
        userId: null,
        publicRooms: new Set(),
        chatSessions: new Set(),
        organizationRooms: new Set(),
    };
    return socket.data.realtime;
}

function authenticateSocket(socket) {
    const state = getSocketState(socket);
    if (state.userId) return state.userId;

    const token = parseCookies(socket.handshake?.headers?.cookie).itemize_auth;
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = parseOrganizationId(decoded.id);
        if (!userId) return null;
        state.userId = userId;
        return userId;
    } catch {
        return null;
    }
}

function createBroadcast(io) {
    const sharedBroadcast = (kind, shareToken, eventType, data) => {
        const config = SHARED_ROOM_TYPES[kind];
        if (!io || !isShareToken(shareToken) || !config || typeof eventType !== 'string') return;
        io.to(`${config.roomPrefix}${shareToken}`).emit(config.updateEvent, {
            type: eventType,
            data,
            timestamp: new Date().toISOString(),
        });
    };

    const userBroadcast = (userId, eventName, eventType, data) => {
        const parsedUserId = parseOrganizationId(userId);
        if (!io || !parsedUserId) return;
        io.to(`user-canvas-${parsedUserId}`).emit(eventName, {
            type: eventType,
            data,
            timestamp: new Date().toISOString(),
        });
    };

    return {
        listUpdate: (token, type, data) => sharedBroadcast('list', token, type, data),
        noteUpdate: (token, type, data) => sharedBroadcast('note', token, type, data),
        whiteboardUpdate: (token, type, data) => sharedBroadcast('whiteboard', token, type, data),
        wireframeUpdate: (token, type, data) => sharedBroadcast('wireframe', token, type, data),
        userListUpdate: (userId, type, data) => userBroadcast(userId, 'userListUpdated', type, data),
        userWireframeUpdate: (userId, type, data) => userBroadcast(userId, 'userWireframeUpdated', type, data),
        userListDeleted: (userId, data) => userBroadcast(userId, 'userListDeleted', 'LIST_DELETED', data),
    };
}

module.exports = (io, pool) => {
    const viewerMaps = Object.fromEntries(Object.keys(SHARED_ROOM_TYPES).map(kind => [kind, new Map()]));
    const userCanvasConnections = new Map();
    const chatSessionConnections = new Map();
    const organizationConnections = new Map();
    const broadcast = createBroadcast(io);

    const emitViewerCount = (kind, token) => {
        const config = SHARED_ROOM_TYPES[kind];
        const count = viewerMaps[kind].get(token)?.size || 0;
        io.to(`${config.roomPrefix}${token}`).emit('viewerCount', count);
    };

    const trackConnection = (map, key, socketId) => {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(socketId);
    };

    const removeConnection = (map, key, socketId) => {
        const connections = map.get(key);
        if (!connections?.delete(socketId)) return false;
        if (connections.size === 0) map.delete(key);
        return true;
    };

    const registerSharedJoin = (socket, kind, config) => {
        socket.on(config.event, async shareToken => {
            if (!isShareToken(shareToken)) {
                emitRealtimeError(socket, 'INVALID_CAPABILITY', 'Invalid or inactive share link');
                return;
            }

            const state = getSocketState(socket);
            const trackingKey = `${kind}:${shareToken}`;
            if (!state.publicRooms.has(trackingKey)
                && state.publicRooms.size >= MAX_PUBLIC_ROOMS_PER_SOCKET) {
                emitRealtimeError(socket, 'ROOM_LIMIT', 'Too many realtime rooms');
                return;
            }

            try {
                const result = await pool.query(
                    `SELECT id, title FROM ${config.table} WHERE share_token = $1 AND is_public = TRUE`,
                    [shareToken]
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
            } catch (error) {
                console.error(`Realtime ${kind} join failed:`, error.message);
                emitRealtimeError(socket, 'JOIN_FAILED', 'Failed to join realtime room');
            }
        });
    };

    const registerOrganizationJoin = (socket, eventName, channel) => {
        socket.on(eventName, async data => {
            const organizationId = parseOrganizationId(data?.organizationId);
            const userId = authenticateSocket(socket);
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
                    [organizationId, userId]
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
                socket.emit(`joinedOrg${channel[0].toUpperCase()}${channel.slice(1)}`, { organizationId });
            } catch (error) {
                console.error(`Realtime organization ${channel} join failed:`, error.message);
                emitRealtimeError(socket, 'JOIN_FAILED', 'Failed to join organization realtime room');
            }
        });
    };

    io.on('connection', socket => {
        getSocketState(socket);

        socket.on('joinUserCanvas', async () => {
            const userId = authenticateSocket(socket);
            if (!userId) {
                emitRealtimeError(socket, 'UNAUTHENTICATED', 'Authentication required');
                return;
            }

            await socket.join(`user-canvas-${userId}`);
            trackConnection(userCanvasConnections, userId, socket.id);
            socket.emit('joinedUserCanvas', { userId });
        });

        for (const [kind, config] of Object.entries(SHARED_ROOM_TYPES)) {
            registerSharedJoin(socket, kind, config);
        }

        socket.on('joinChatSession', async sessionToken => {
            if (!isChatSessionToken(sessionToken)) {
                emitRealtimeError(socket, 'INVALID_CAPABILITY', 'Invalid or inactive session');
                return;
            }

            try {
                const result = await pool.query(
                    `SELECT id, organization_id FROM chat_sessions
                     WHERE session_token = $1 AND status = 'active'`,
                    [sessionToken]
                );
                if (result.rows.length === 0) {
                    emitRealtimeError(socket, 'INVALID_CAPABILITY', 'Invalid or inactive session');
                    return;
                }

                await socket.join(`chat-session-${sessionToken}`);
                getSocketState(socket).chatSessions.add(sessionToken);
                trackConnection(chatSessionConnections, sessionToken, socket.id);
                socket.emit('joinedChatSession', { sessionId: result.rows[0].id });
            } catch (error) {
                console.error('Realtime chat-session join failed:', error.message);
                emitRealtimeError(socket, 'JOIN_FAILED', 'Failed to join chat session');
            }
        });

        registerOrganizationJoin(socket, 'joinOrgChat', 'chat');
        registerOrganizationJoin(socket, 'joinOrgSocial', 'social');

        socket.on('agentTyping', async data => {
            const sessionToken = data?.sessionToken;
            const userId = authenticateSocket(socket);
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
                    [sessionToken, userId]
                );
                if (authorized.rows.length === 0) {
                    emitRealtimeError(socket, 'FORBIDDEN', 'Not authorized for this chat session');
                    return;
                }

                io.to(`chat-session-${sessionToken}`).emit('agentTyping', {
                    isTyping: data.isTyping,
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                console.error('Realtime agent typing authorization failed:', error.message);
                emitRealtimeError(socket, 'EVENT_FAILED', 'Failed to publish typing state');
            }
        });

        socket.on('visitorTyping', async data => {
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
                const result = await pool.query(
                    `SELECT id, organization_id FROM chat_sessions
                     WHERE session_token = $1 AND status = 'active'`,
                    [sessionToken]
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
            } catch (error) {
                console.error('Realtime visitor typing authorization failed:', error.message);
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
            if (state.userId) removeConnection(userCanvasConnections, state.userId, socket.id);
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
};

module.exports._private = {
    authenticateSocket,
    createBroadcast,
    isChatSessionToken,
    isShareToken,
    isTypingValue,
    parseCookies,
    parseOrganizationId,
};
