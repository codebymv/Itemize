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

    const noop = (_req, _res, next) => next();
    registerApiRoutes({
        app,
        pool,
        authenticateJWT,
        requireAdmin,
        publicRateLimit: noop,
        positionLimiter: noop,
        broadcast: {},
        io: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
        port: 3001,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    return app;
}

describe('Public sharing PostgreSQL capability contract', () => {
    let dbHelper;
    let app;
    let ids;

    const tokens = {
        list: '00000000-0000-4000-8000-000000000011',
        note: '00000000-0000-4000-8000-000000000012',
        whiteboard: '00000000-0000-4000-8000-000000000013',
        wireframe: '00000000-0000-4000-8000-000000000014',
        vault: '00000000-0000-4000-8000-000000000015',
    };

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);
        const owner = await dbHelper.seedUser(
            `sharing-owner-${Date.now()}@test.itemize`,
            'Sharing Owner<script>alert(1)</script>'
        );

        const [list, note, whiteboard, wireframe, vault] = await Promise.all([
            dbHelper.pool.query(
                `INSERT INTO lists (user_id, title, category, items, share_token, is_public, shared_at)
                 VALUES ($1, '<b>Shared list</b>', 'General', $2::jsonb, $3, TRUE, CURRENT_TIMESTAMP)
                 RETURNING id`,
                [owner.user.id, JSON.stringify([
                    { id: 'safe', text: '<img src=x onerror="alert(1)">Task<script>alert(2)</script>', completed: false },
                ]), tokens.list]
            ),
            dbHelper.pool.query(
                `INSERT INTO notes (user_id, title, content, share_token, is_public, shared_at)
                 VALUES ($1, 'Shared note', '<p>Hello</p><script>alert(1)</script>', $2, TRUE, CURRENT_TIMESTAMP)
                 RETURNING id`,
                [owner.user.id, tokens.note]
            ),
            dbHelper.pool.query(
                `INSERT INTO whiteboards (user_id, title, canvas_data, share_token, is_public, shared_at)
                 VALUES ($1, 'Shared board', $2::jsonb, $3, TRUE, CURRENT_TIMESTAMP)
                 RETURNING id`,
                [owner.user.id, JSON.stringify({
                    nodes: [{ text: '<svg onload="alert(1)">Board</svg>', metadata: { label: '<script>x</script>Safe' } }],
                }), tokens.whiteboard]
            ),
            dbHelper.pool.query(
                `INSERT INTO wireframes (user_id, title, share_token, is_public, shared_at)
                 VALUES ($1, '<b>Shared wireframe</b>', $2, TRUE, CURRENT_TIMESTAMP)
                 RETURNING id`,
                [owner.user.id, tokens.wireframe]
            ),
            dbHelper.pool.query(
                `INSERT INTO vaults (user_id, title, is_locked, share_token, is_public, shared_at)
                 VALUES ($1, 'Shared vault', FALSE, $2, TRUE, CURRENT_TIMESTAMP)
                 RETURNING id`,
                [owner.user.id, tokens.vault]
            ),
        ]);

        ids = {
            list: list.rows[0].id,
            note: note.rows[0].id,
            whiteboard: whiteboard.rows[0].id,
            wireframe: wireframe.rows[0].id,
            vault: vault.rows[0].id,
        };
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    it.each([
        ['list', response => response.body.title],
        ['note', response => response.body.title],
        ['whiteboard', response => response.body.title],
        ['wireframe', response => response.body.title],
        ['vault', response => response.body.data.title],
    ])('serves an active public %s capability with private response headers', async (kind, titleOf) => {
        const response = await request(app).get(`/api/shared/${kind}/${tokens[kind]}`);
        expect(response.status).toBe(200);
        expect(response.headers).toMatchObject({
            'cache-control': 'private, no-store',
            'referrer-policy': 'no-referrer',
            'x-robots-tag': 'noindex, nofollow',
        });
        expect(titleOf(response)).toContain('Shared');
        expect(JSON.stringify(response.body)).not.toMatch(/<script|onerror|onload/i);
    });

    it('preserves nested whiteboard arrays while sanitizing their content', async () => {
        const response = await request(app).get(`/api/shared/whiteboard/${tokens.whiteboard}`);
        expect(Array.isArray(response.body.canvas_data.nodes)).toBe(true);
        expect(response.body.canvas_data.nodes[0].metadata.label).toContain('Safe');
    });

    it('fails the complete public vault response closed when one item cannot decrypt', async () => {
        await dbHelper.pool.query(
            `INSERT INTO vault_items (
               vault_id, item_type, label, encrypted_value, iv, order_index
             ) VALUES ($1, 'key_value', 'Broken secret', 'invalid', 'invalid', 0)`,
            [ids.vault]
        );

        const response = await request(app).get(`/api/shared/vault/${tokens.vault}`);
        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body)).not.toContain('DECRYPTION_ERROR');
        expect(JSON.stringify(response.body)).not.toContain('Broken secret');
    });

    it.each(['list', 'note', 'whiteboard', 'wireframe', 'vault'])(
        'rejects malformed public %s capability tokens as not found',
        async (kind) => {
            const response = await request(app).get(`/api/shared/${kind}/not-a-token`);
            expect(response.status).toBe(404);
        }
    );
});
