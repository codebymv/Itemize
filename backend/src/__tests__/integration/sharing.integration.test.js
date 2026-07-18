const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');

function createApp(pool) {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use((req, _res, next) => { req.dbPool = pool; next(); });
    app.use('/api/auth', require('../../auth').router);

    const noop = (_req, _res, next) => next();
    const broadcast = {
        listUpdate: jest.fn(), noteUpdate: jest.fn(),
        whiteboardUpdate: jest.fn(), wireframeUpdate: jest.fn(),
        userListUpdate: jest.fn(), userWireframeUpdate: jest.fn(),
        userListDeleted: jest.fn(),
        revokeShared: jest.fn().mockResolvedValue(true),
    };

    registerApiRoutes({
        app, pool, authenticateJWT, requireAdmin,
        publicRateLimit: noop, positionLimiter: noop,
        broadcast,
        io: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
        port: 3001,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    return { app, broadcast };
}

const auth = (user) => [`itemize_auth=${user.token}`];

describe('Public sharing PostgreSQL capability contract', () => {
    let dbHelper;
    let app;
    let broadcast;
    let owner;
    let outsider;
    let listId;
    let noteId;
    let whiteboardId;
    let wireframeId;
    let vaultId;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        ({ app, broadcast } = createApp(dbHelper.pool));
        [owner, outsider] = await Promise.all([
            dbHelper.seedUser(`sharing-owner-${Date.now()}@test.itemize`, 'Sharing Owner'),
            dbHelper.seedUser(`sharing-outsider-${Date.now()}@test.itemize`, 'Sharing Outsider'),
        ]);

        const [list, note, whiteboard, wireframe, vault] = await Promise.all([
            dbHelper.pool.query(
                `INSERT INTO lists (user_id, title, category, items)
                 VALUES ($1, $2, 'General', $3::jsonb) RETURNING id`,
                [owner.user.id, '<b>Shared list</b>', JSON.stringify([
                    { id: 'safe', text: '<img src=x onerror="alert(1)">Task<script>alert(2)</script>', completed: false },
                ])]
            ),
            dbHelper.pool.query(
                `INSERT INTO notes (user_id, title, content)
                 VALUES ($1, 'Shared note', '<p>Hello</p><script>alert(1)</script>') RETURNING id`,
                [owner.user.id]
            ),
            dbHelper.pool.query(
                `INSERT INTO whiteboards (user_id, title, canvas_data)
                 VALUES ($1, 'Shared board', $2::jsonb) RETURNING id`,
                [owner.user.id, JSON.stringify({
                    nodes: [{ text: '<svg onload="alert(1)">Board</svg>', metadata: { label: '<script>x</script>Safe' } }],
                })]
            ),
            dbHelper.pool.query(
                `INSERT INTO wireframes (user_id, title)
                 VALUES ($1, 'Shared wireframe') RETURNING id`,
                [owner.user.id]
            ),
            dbHelper.pool.query(
                `INSERT INTO vaults (user_id, title, is_locked)
                 VALUES ($1, 'Shared vault', FALSE) RETURNING id`,
                [owner.user.id]
            ),
        ]);
        listId = list.rows[0].id;
        noteId = note.rows[0].id;
        whiteboardId = whiteboard.rows[0].id;
        wireframeId = wireframe.rows[0].id;
        vaultId = vault.rows[0].id;
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    it('atomically returns one stable token when share requests race', async () => {
        const [first, second] = await Promise.all([
            request(app).post(`/api/lists/${listId}/share`).set('Cookie', auth(owner)),
            request(app).post(`/api/lists/${listId}/share`).set('Cookie', auth(owner)),
        ]);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(first.body.shareToken).toBe(second.body.shareToken);
        expect(first.body.shareUrl).toContain(`/shared/list/${first.body.shareToken}`);

        const stored = await dbHelper.pool.query(
            'SELECT share_token, is_public, shared_at FROM lists WHERE id = $1',
            [listId]
        );
        expect(stored.rows[0].share_token).toBe(first.body.shareToken);
        expect(stored.rows[0].is_public).toBe(true);
        expect(stored.rows[0].shared_at).not.toBeNull();
    });

    it('revokes the old capability and rotates it when sharing is enabled again', async () => {
        const initial = await request(app)
            .post(`/api/lists/${listId}/share`)
            .set('Cookie', auth(owner));
        const oldToken = initial.body.shareToken;

        const revoked = await request(app)
            .delete(`/api/lists/${listId}/share`)
            .set('Cookie', auth(owner));
        expect(revoked.status).toBe(200);
        expect(broadcast.revokeShared).toHaveBeenCalledWith('list', oldToken);

        const stored = await dbHelper.pool.query(
            'SELECT share_token, is_public, shared_at FROM lists WHERE id = $1',
            [listId]
        );
        expect(stored.rows[0]).toMatchObject({ share_token: null, is_public: false, shared_at: null });
        expect((await request(app).get(`/api/shared/list/${oldToken}`)).status).toBe(404);

        const reshared = await request(app)
            .post(`/api/lists/${listId}/share`)
            .set('Cookie', auth(owner));
        expect(reshared.status).toBe(200);
        expect(reshared.body.shareToken).not.toBe(oldToken);
        expect((await request(app).get(`/api/shared/list/${oldToken}`)).status).toBe(404);
        expect((await request(app).get(`/api/shared/list/${reshared.body.shareToken}`)).status).toBe(200);
    });

    it.each([
        ['lists', () => [
            request(app).post(`/api/lists/${listId}/share`).set('Cookie', auth(outsider)),
            request(app).delete(`/api/lists/${listId}/share`).set('Cookie', auth(outsider)),
        ]],
        ['notes', () => [
            request(app).post(`/api/notes/${noteId}/share`).set('Cookie', auth(outsider)),
            request(app).delete(`/api/notes/${noteId}/share`).set('Cookie', auth(outsider)),
        ]],
        ['whiteboards', () => [
            request(app).post(`/api/whiteboards/${whiteboardId}/share`).set('Cookie', auth(outsider)),
            request(app).delete(`/api/whiteboards/${whiteboardId}/share`).set('Cookie', auth(outsider)),
        ]],
        ['wireframes', () => [
            request(app).post(`/api/wireframes/${wireframeId}/share`).set('Cookie', auth(outsider)),
            request(app).delete(`/api/wireframes/${wireframeId}/share`).set('Cookie', auth(outsider)),
        ]],
        ['vaults', () => [
            request(app).post(`/api/vaults/${vaultId}/share`).set('Cookie', auth(outsider)),
            request(app).delete(`/api/vaults/${vaultId}/share`).set('Cookie', auth(outsider)),
        ]],
    ])('does not let another user alter %s sharing', async (_type, buildRequests) => {
        broadcast.revokeShared.mockClear();
        const responses = await Promise.all(buildRequests());
        expect(responses.map(response => response.status)).toEqual([404, 404]);
        expect(broadcast.revokeShared).not.toHaveBeenCalled();
    });

    it.each([
        ['note', () => noteId, response => response.body.shareToken],
        ['whiteboard', () => whiteboardId, response => response.body.shareToken],
    ])('evicts active %s viewers only after owner revocation succeeds', async (
        kind,
        getId,
        getToken
    ) => {
        const id = getId();
        const shared = await request(app)
            .post(`/api/${kind}s/${id}/share`)
            .set('Cookie', auth(owner));
        const shareToken = getToken(shared);
        broadcast.revokeShared.mockClear();

        const revoked = await request(app)
            .delete(`/api/${kind}s/${id}/share`)
            .set('Cookie', auth(owner));

        expect(revoked.status).toBe(200);
        expect(broadcast.revokeShared).toHaveBeenCalledWith(kind, shareToken);
    });

    it('serializes vault sharing, unwraps the frontend contract, and rotates revoked links', async () => {
        const [first, second] = await Promise.all([
            request(app).post(`/api/vaults/${vaultId}/share`).set('Cookie', auth(owner)),
            request(app).post(`/api/vaults/${vaultId}/share`).set('Cookie', auth(owner)),
        ]);
        expect(first.status).toBe(200);
        expect(first.body.data.shareToken).toBe(second.body.data.shareToken);
        const oldToken = first.body.data.shareToken;

        const publicVault = await request(app).get(`/api/shared/vault/${oldToken}`);
        expect(publicVault.status).toBe(200);
        expect(publicVault.headers['cache-control']).toBe('private, no-store');
        expect(publicVault.body.data).toMatchObject({ title: 'Shared vault', items: [], is_shared: true });

        expect((await request(app)
            .delete(`/api/vaults/${vaultId}/share`)
            .set('Cookie', auth(owner))).status).toBe(200);
        expect((await request(app).get(`/api/shared/vault/${oldToken}`)).status).toBe(404);

        const reshared = await request(app)
            .post(`/api/vaults/${vaultId}/share`)
            .set('Cookie', auth(owner));
        expect(reshared.body.data.shareToken).not.toBe(oldToken);
    });

    it('serializes wireframe sharing and clears the capability on revoke', async () => {
        const [first, second] = await Promise.all([
            request(app).post(`/api/wireframes/${wireframeId}/share`).set('Cookie', auth(owner)),
            request(app).post(`/api/wireframes/${wireframeId}/share`).set('Cookie', auth(owner)),
        ]);
        expect(first.status).toBe(200);
        expect(first.body.data.shareToken).toBe(second.body.data.shareToken);
        expect(first.body.data.shareUrl).toBe(
            `http://localhost:5173/shared/wireframe/${first.body.data.shareToken}`
        );

        expect((await request(app)
            .delete(`/api/wireframes/${wireframeId}/share`)
            .set('Cookie', auth(owner))).status).toBe(200);
        expect(broadcast.revokeShared).toHaveBeenCalledWith(
            'wireframe',
            first.body.data.shareToken
        );
        const stored = await dbHelper.pool.query(
            'SELECT share_token, is_public, shared_at FROM wireframes WHERE id = $1',
            [wireframeId]
        );
        expect(stored.rows[0]).toMatchObject({ share_token: null, is_public: false, shared_at: null });
    });

    it('serves notes publicly while removing executable markup', async () => {
        const shared = await request(app)
            .post(`/api/notes/${noteId}/share`)
            .set('Cookie', auth(owner));
        expect(shared.status).toBe(200);

        const publicNote = await request(app).get(`/api/shared/note/${shared.body.shareToken}`);
        expect(publicNote.status).toBe(200);
        expect(publicNote.headers).toMatchObject({
            'cache-control': 'private, no-store',
            'referrer-policy': 'no-referrer',
            'x-robots-tag': 'noindex, nofollow',
        });
        expect(publicNote.body).toMatchObject({ title: 'Shared note', type: 'note', creator_name: 'Sharing Owner' });
        expect(publicNote.body.content).toContain('<p>Hello</p>');
        expect(publicNote.body.content).not.toContain('<script');
    });

    it('recursively sanitizes nested whiteboard content without changing arrays into objects', async () => {
        const shared = await request(app)
            .post(`/api/whiteboards/${whiteboardId}/share`)
            .set('Cookie', auth(owner));
        expect(shared.status).toBe(200);

        const publicBoard = await request(app).get(`/api/shared/whiteboard/${shared.body.shareToken}`);
        expect(publicBoard.status).toBe(200);
        expect(Array.isArray(publicBoard.body.canvas_data.nodes)).toBe(true);
        expect(JSON.stringify(publicBoard.body.canvas_data)).not.toMatch(/onload|<script/i);
        expect(publicBoard.body.canvas_data.nodes[0].metadata.label).toContain('Safe');
    });

    it('rejects malformed public tokens as not found across all shared content types', async () => {
        const responses = await Promise.all([
            request(app).get('/api/shared/list/not-a-token'),
            request(app).get('/api/shared/note/not-a-token'),
            request(app).get('/api/shared/whiteboard/not-a-token'),
            request(app).get('/api/shared/vault/not-a-token'),
        ]);
        expect(responses.map(response => response.status)).toEqual([404, 404, 404, 404]);
    });
});
