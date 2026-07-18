const { createServer } = require('http');
const express = require('express');
const request = require('supertest');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');

const TestDbHelper = require('./test-db-helper');
const initializeWebSocket = require('../../lib/websocket');
const publicChatRoutes = require('../../routes/chat-widget/public.routes');
const agentChatRoutes = require('../../routes/chat-widget/sessions.routes');

const SHARE_TOKEN = '123e4567-e89b-42d3-a456-426614174111';
const CHAT_TOKEN = `cs_${'b'.repeat(48)}`;

function once(socket, event, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeout);
        socket.once(event, payload => {
            clearTimeout(timer);
            resolve(payload);
        });
    });
}

describe('Socket.IO PostgreSQL authorization contract', () => {
    let dbHelper;
    let owner;
    let outsider;
    let app;
    let server;
    let io;
    let realtime;
    let url;
    const clients = new Set();

    const connect = async token => {
        const client = createClient(url, {
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
            extraHeaders: token ? { Cookie: `itemize_auth=${token}` } : undefined,
        });
        clients.add(client);
        await once(client, 'connect');
        return client;
    };

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        [owner, outsider] = await Promise.all([
            dbHelper.seedUser(`realtime-owner-${Date.now()}@test.itemize`, 'Realtime Owner'),
            dbHelper.seedUser(`realtime-outsider-${Date.now()}@test.itemize`, 'Realtime Outsider'),
        ]);
        await dbHelper.pool.query(
            `INSERT INTO notes (user_id, title, content, share_token, is_public)
             VALUES ($1, 'Realtime note', 'Content', $2, TRUE)`,
            [owner.user.id, SHARE_TOKEN]
        );
        const widget = await dbHelper.pool.query(
            `INSERT INTO chat_widgets (organization_id, widget_key, name)
             VALUES ($1, $2, 'Realtime widget') RETURNING id`,
            [owner.org.id, `widget_${Date.now()}`]
        );
        await dbHelper.pool.query(
            `INSERT INTO chat_sessions (organization_id, widget_id, session_token, status)
             VALUES ($1, $2, $3, 'active')`,
            [owner.org.id, widget.rows[0].id, CHAT_TOKEN]
        );

        app = express();
        app.use(express.json());
        server = createServer(app);
        io = new Server(server, { cors: { origin: true, credentials: true } });
        realtime = initializeWebSocket(io, dbHelper.pool);
        const noopRateLimit = (_req, _res, next) => next();
        app.use(
            '/api/chat-widget',
            publicChatRoutes(dbHelper.pool, noopRateLimit, io, realtime.broadcast)
        );
        const authenticateOwner = (req, _res, next) => {
            req.user = owner.user;
            next();
        };
        const selectOwnerOrganization = (req, _res, next) => {
            req.organizationId = owner.org.id;
            next();
        };
        app.use(
            '/api/chat-widget',
            agentChatRoutes(
                dbHelper.pool,
                authenticateOwner,
                selectOwnerOrganization,
                io
            )
        );
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        url = `http://127.0.0.1:${server.address().port}`;
    }, 30000);

    afterEach(() => {
        for (const client of clients) client.close();
        clients.clear();
    });

    afterAll(async () => {
        for (const client of clients) client.close();
        if (io) await new Promise(resolve => io.close(resolve));
        if (server?.listening) await new Promise(resolve => server.close(resolve));
        await dbHelper.teardown();
    }, 30000);

    it('derives a private canvas room from the signed cookie, not event input', async () => {
        const client = await connect(owner.token);
        const joined = once(client, 'joinedUserCanvas');

        client.emit('joinUserCanvas', { token: outsider.token });

        await expect(joined).resolves.toEqual({ userId: owner.user.id });
    });

    it('admits only active database-backed public share capabilities', async () => {
        const client = await connect();
        const joined = once(client, 'joinedSharedNote');
        client.emit('joinSharedNote', SHARE_TOKEN);
        await expect(joined).resolves.toEqual({ noteTitle: 'Realtime note' });

        const rejected = once(client, 'realtimeError');
        client.emit('joinSharedNote', '123e4567-e89b-42d3-a456-426614174222');
        await expect(rejected).resolves.toMatchObject({ code: 'INVALID_CAPABILITY' });
    });

    it('enforces organization membership on authenticated room admission', async () => {
        const member = await connect(owner.token);
        const memberJoined = once(member, 'joinedOrgChat');
        member.emit('joinOrgChat', { organizationId: owner.org.id });
        await expect(memberJoined).resolves.toEqual({ organizationId: owner.org.id });

        const nonMember = await connect(outsider.token);
        const rejected = once(nonMember, 'realtimeError');
        nonMember.emit('joinOrgChat', { organizationId: owner.org.id });
        await expect(rejected).resolves.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects anonymous agent typing spoof attempts', async () => {
        const attacker = await connect();
        const rejected = once(attacker, 'realtimeError');

        attacker.emit('agentTyping', { sessionToken: CHAT_TOKEN, isTyping: true });

        await expect(rejected).resolves.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('delivers typing only across authorized capability and organization rooms', async () => {
        const visitor = await connect();
        const visitorJoined = once(visitor, 'joinedChatSession');
        visitor.emit('joinChatSession', CHAT_TOKEN);
        await visitorJoined;

        const agent = await connect(owner.token);
        const orgJoined = once(agent, 'joinedOrgChat');
        agent.emit('joinOrgChat', { organizationId: owner.org.id });
        await orgJoined;

        const agentTyping = once(visitor, 'agentTyping');
        agent.emit('agentTyping', { sessionToken: CHAT_TOKEN, isTyping: true });
        await expect(agentTyping).resolves.toMatchObject({ isTyping: true });

        const visitorTyping = once(agent, 'visitorTyping');
        visitor.emit('visitorTyping', { sessionToken: CHAT_TOKEN, isTyping: false });
        await expect(visitorTyping).resolves.toMatchObject({ isTyping: false });
    });

    it('evicts active public viewers immediately when a capability is revoked', async () => {
        const first = await connect();
        const second = await connect();
        const firstJoined = once(first, 'joinedSharedNote');
        const secondJoined = once(second, 'joinedSharedNote');
        first.emit('joinSharedNote', SHARE_TOKEN);
        second.emit('joinSharedNote', SHARE_TOKEN);
        await Promise.all([firstJoined, secondJoined]);

        const firstRevoked = once(first, 'sharedContentRevoked');
        const secondRevoked = once(second, 'sharedContentRevoked');
        await realtime.broadcast.revokeShared('note', SHARE_TOKEN);

        await expect(firstRevoked).resolves.toMatchObject({
            kind: 'note',
            reason: 'sharing_revoked',
        });
        await expect(secondRevoked).resolves.toMatchObject({
            kind: 'note',
            reason: 'sharing_revoked',
        });
        const remaining = await io.in(`shared-note-${SHARE_TOKEN}`).fetchSockets();
        expect(remaining).toHaveLength(0);
    });

    it('ends a chat capability, evicts active visitors, and denies post-end activity', async () => {
        const visitor = await connect();
        const visitorJoined = once(visitor, 'joinedChatSession');
        visitor.emit('joinChatSession', CHAT_TOKEN);
        await visitorJoined;

        const agent = await connect(owner.token);
        const orgJoined = once(agent, 'joinedOrgChat');
        agent.emit('joinOrgChat', { organizationId: owner.org.id });
        await orgJoined;

        const visitorEnded = once(visitor, 'chatSessionEnded');
        const agentEnded = once(agent, 'chatSessionEnded');
        const response = await request(app)
            .post('/api/chat-widget/public/end-session')
            .send({ session_token: CHAT_TOKEN });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });
        await expect(visitorEnded).resolves.toMatchObject({ reason: 'session_ended' });
        await expect(agentEnded).resolves.toMatchObject({ session_id: expect.any(Number) });

        const remaining = await io.in(`chat-session-${CHAT_TOKEN}`).fetchSockets();
        expect(remaining).toHaveLength(0);
        const stored = await dbHelper.pool.query(
            'SELECT id, status, is_online, ended_at FROM chat_sessions WHERE session_token = $1',
            [CHAT_TOKEN]
        );
        expect(stored.rows[0]).toMatchObject({ status: 'ended', is_online: false });
        expect(stored.rows[0].ended_at).toBeTruthy();

        const rejected = once(visitor, 'realtimeError');
        visitor.emit('joinChatSession', CHAT_TOKEN);
        await expect(rejected).resolves.toMatchObject({ code: 'INVALID_CAPABILITY' });

        const typing = await request(app)
            .post('/api/chat-widget/public/typing')
            .send({ session_token: CHAT_TOKEN, is_typing: true });
        expect(typing.status).toBe(404);

        const agentMessage = await request(app)
            .post(`/api/chat-widget/sessions/${stored.rows[0].id}/messages`)
            .send({ content: 'This session has ended.' });
        expect(agentMessage.status).toBe(404);

        const history = await request(app)
            .get(`/api/chat-widget/public/messages/${CHAT_TOKEN}`);
        expect(history.status).toBe(200);
        const afterHistory = await dbHelper.pool.query(
            'SELECT status, is_online FROM chat_sessions WHERE session_token = $1',
            [CHAT_TOKEN]
        );
        expect(afterHistory.rows[0]).toMatchObject({ status: 'ended', is_online: false });
    });
});
