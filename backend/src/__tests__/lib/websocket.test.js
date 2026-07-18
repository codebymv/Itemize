const jwt = require('jsonwebtoken');
const initializeWebSocket = require('../../lib/websocket');

const SHARE_TOKEN = '123e4567-e89b-42d3-a456-426614174000';
const CHAT_TOKEN = `cs_${'a'.repeat(48)}`;

class FakeSocket {
    constructor(cookie = '') {
        this.id = `socket-${Math.random()}`;
        this.data = {};
        this.handshake = { headers: { cookie } };
        this.handlers = new Map();
        this.emitted = [];
        this.rooms = new Set();
    }

    on(event, handler) {
        this.handlers.set(event, handler);
    }

    emit(event, payload) {
        this.emitted.push({ event, payload });
    }

    async join(room) {
        this.rooms.add(room);
    }

    async leave(room) {
        this.rooms.delete(room);
    }

    async trigger(event, payload) {
        return this.handlers.get(event)(payload);
    }
}

function createHarness(query = jest.fn()) {
    let connect;
    const roomEvents = [];
    const sockets = [];
    const io = {
        on: jest.fn((event, handler) => {
            if (event === 'connection') {
                connect = socket => {
                    sockets.push(socket);
                    handler(socket);
                };
            }
        }),
        to: jest.fn(room => ({
            emit: (event, payload) => {
                roomEvents.push({ room, event, payload });
                for (const socket of sockets.filter(candidate => candidate.rooms.has(room))) {
                    socket.emit(event, payload);
                }
            },
        })),
        in: jest.fn(room => ({
            fetchSockets: async () => sockets.filter(socket => socket.rooms.has(room)),
        })),
    };
    const result = initializeWebSocket(io, { query });
    return { connect, io, query, result, roomEvents };
}

function authCookie(userId) {
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
    return `other=value; itemize_auth=${encodeURIComponent(token)}`;
}

function emitted(socket, event) {
    return socket.emitted.filter(item => item.event === event);
}

describe('Socket.IO authorization boundary', () => {
    test('strictly validates identifiers and bearer capabilities', () => {
        const helpers = initializeWebSocket._private;
        expect(helpers.parseOrganizationId('42')).toBe(42);
        expect(helpers.parseOrganizationId('0')).toBeNull();
        expect(helpers.parseOrganizationId('1 OR 1=1')).toBeNull();
        expect(helpers.isShareToken(SHARE_TOKEN)).toBe(true);
        expect(helpers.isShareToken('../secret')).toBe(false);
        expect(helpers.isChatSessionToken(CHAT_TOKEN)).toBe(true);
        expect(helpers.isChatSessionToken('cs_short')).toBe(false);
        expect(helpers.isTypingValue(false)).toBe(true);
        expect(helpers.isTypingValue('false')).toBe(false);
    });

    test('joins only the canvas room derived from the handshake cookie', async () => {
        const { connect } = createHarness();
        const socket = new FakeSocket(authCookie(7));
        connect(socket);

        await socket.trigger('joinUserCanvas', { token: jwt.sign({ id: 99 }, process.env.JWT_SECRET) });

        expect(socket.rooms).toEqual(new Set(['user-canvas-7']));
        expect(emitted(socket, 'joinedUserCanvas')[0].payload).toEqual({ userId: 7 });
    });

    test('rejects unauthenticated canvas admission', async () => {
        const { connect } = createHarness();
        const socket = new FakeSocket();
        connect(socket);

        await socket.trigger('joinUserCanvas');

        expect(socket.rooms.size).toBe(0);
        expect(emitted(socket, 'realtimeError')[0].payload.code).toBe('UNAUTHENTICATED');
    });

    test('rejects malformed public capabilities without querying PostgreSQL', async () => {
        const query = jest.fn();
        const { connect } = createHarness(query);
        const socket = new FakeSocket();
        connect(socket);

        await socket.trigger('joinSharedNote', 'not-a-share-token');

        expect(query).not.toHaveBeenCalled();
        expect(emitted(socket, 'realtimeError')[0].payload.code).toBe('INVALID_CAPABILITY');
    });

    test('admits an active public capability and tracks repeated joins once', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [{ id: 3, title: 'Shared note' }] });
        const { connect, result, roomEvents } = createHarness(query);
        const socket = new FakeSocket();
        connect(socket);

        await socket.trigger('joinSharedNote', SHARE_TOKEN);
        await socket.trigger('joinSharedNote', SHARE_TOKEN);

        expect(query).toHaveBeenCalledTimes(2);
        expect(socket.rooms).toContain(`shared-note-${SHARE_TOKEN}`);
        expect(result.viewers.note.get(SHARE_TOKEN)).toEqual(new Set([socket.id]));
        expect(roomEvents.at(-1)).toMatchObject({
            room: `shared-note-${SHARE_TOKEN}`,
            event: 'viewerCount',
            payload: 1,
        });
    });

    test('fails closed when shared-room authorization queries fail', async () => {
        const query = jest.fn().mockRejectedValue(new Error('database unavailable'));
        const { connect } = createHarness(query);
        const socket = new FakeSocket();
        connect(socket);

        await socket.trigger('joinSharedList', SHARE_TOKEN);

        expect(socket.rooms.size).toBe(0);
        expect(emitted(socket, 'realtimeError')[0].payload.code).toBe('JOIN_FAILED');
    });

    test('uses cookie identity and membership to authorize organization rooms', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [{ role: 'member' }] });
        const { connect } = createHarness(query);
        const socket = new FakeSocket(authCookie(8));
        connect(socket);

        await socket.trigger('joinOrgChat', {
            organizationId: '12',
            token: jwt.sign({ id: 999 }, process.env.JWT_SECRET),
        });

        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('organization_members'),
            [12, 8]
        );
        expect(socket.rooms).toContain('org-chat-12');
        expect(emitted(socket, 'joinedOrgChat')[0].payload).toEqual({ organizationId: 12 });
    });

    test('rejects organization admission for non-members', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [] });
        const { connect } = createHarness(query);
        const socket = new FakeSocket(authCookie(8));
        connect(socket);

        await socket.trigger('joinOrgSocial', { organizationId: 12 });

        expect(socket.rooms.size).toBe(0);
        expect(emitted(socket, 'realtimeError')[0].payload.code).toBe('FORBIDDEN');
    });

    test('blocks unauthenticated agent typing spoof attempts before querying', async () => {
        const query = jest.fn();
        const { connect, roomEvents } = createHarness(query);
        const socket = new FakeSocket();
        connect(socket);

        await socket.trigger('agentTyping', { sessionToken: CHAT_TOKEN, isTyping: true });

        expect(query).not.toHaveBeenCalled();
        expect(roomEvents).toEqual([]);
        expect(emitted(socket, 'realtimeError')[0].payload.code).toBe('UNAUTHENTICATED');
    });

    test('publishes agent typing only after active-session membership authorization', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [{ id: 21 }] });
        const { connect, roomEvents } = createHarness(query);
        const socket = new FakeSocket(authCookie(9));
        connect(socket);

        await socket.trigger('agentTyping', { sessionToken: CHAT_TOKEN, isTyping: false });

        expect(query).toHaveBeenCalledWith(expect.stringContaining('organization_members'), [CHAT_TOKEN, 9]);
        expect(roomEvents[0]).toMatchObject({
            room: `chat-session-${CHAT_TOKEN}`,
            event: 'agentTyping',
            payload: { isTyping: false },
        });
    });

    test('requires a verified chat-session join before visitor typing', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [{ id: 31, organization_id: 14 }] });
        const { connect, roomEvents } = createHarness(query);
        const socket = new FakeSocket();
        connect(socket);

        await socket.trigger('visitorTyping', { sessionToken: CHAT_TOKEN, isTyping: true });
        expect(query).not.toHaveBeenCalled();
        expect(emitted(socket, 'realtimeError')[0].payload.code).toBe('FORBIDDEN');

        await socket.trigger('joinChatSession', CHAT_TOKEN);
        await socket.trigger('visitorTyping', { sessionToken: CHAT_TOKEN, isTyping: true });

        expect(socket.rooms).toContain(`chat-session-${CHAT_TOKEN}`);
        expect(roomEvents.at(-1)).toMatchObject({
            room: 'org-chat-14',
            event: 'visitorTyping',
            payload: { sessionId: 31, isTyping: true },
        });
    });

    test('cleans tracked viewers on disconnect and broadcasts the new count', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [{ id: 3, title: 'Shared note' }] });
        const { connect, result, roomEvents } = createHarness(query);
        const socket = new FakeSocket();
        connect(socket);
        await socket.trigger('joinSharedNote', SHARE_TOKEN);

        await socket.trigger('disconnect');

        expect(result.viewers.note.has(SHARE_TOKEN)).toBe(false);
        expect(roomEvents.at(-1)).toMatchObject({ event: 'viewerCount', payload: 0 });
    });

    test('evicts every socket in a revoked public room without exposing its capability', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [{ id: 3, title: 'Shared note' }] });
        const { connect, result } = createHarness(query);
        const first = new FakeSocket();
        const second = new FakeSocket();
        connect(first);
        connect(second);
        await first.trigger('joinSharedNote', SHARE_TOKEN);
        await second.trigger('joinSharedNote', SHARE_TOKEN);

        await expect(result.broadcast.revokeShared('note', SHARE_TOKEN)).resolves.toBe(true);

        expect(first.rooms).not.toContain(`shared-note-${SHARE_TOKEN}`);
        expect(second.rooms).not.toContain(`shared-note-${SHARE_TOKEN}`);
        expect(result.viewers.note.has(SHARE_TOKEN)).toBe(false);
        for (const socket of [first, second]) {
            const event = emitted(socket, 'sharedContentRevoked').at(-1);
            expect(event.payload).toMatchObject({
                kind: 'note',
                reason: 'sharing_revoked',
            });
            expect(JSON.stringify(event.payload)).not.toContain(SHARE_TOKEN);
        }
    });

    test('broadcast helpers reject malformed room keys', () => {
        const { result, roomEvents } = createHarness();

        result.broadcast.noteUpdate('../secret', 'CONTENT_CHANGED', { content: 'nope' });
        result.broadcast.userListUpdate('not-an-id', 'LIST_CHANGED', {});

        expect(roomEvents).toEqual([]);
    });

    test('revocation helpers reject malformed room keys without adapter access', async () => {
        const { result, io } = createHarness();

        await expect(result.broadcast.revokeShared('note', '../secret')).resolves.toBe(false);
        await expect(result.broadcast.revokeShared('unknown', SHARE_TOKEN)).resolves.toBe(false);

        expect(io.in).not.toHaveBeenCalled();
    });
});
