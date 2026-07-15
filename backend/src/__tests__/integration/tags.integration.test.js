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
    const mockBroadcast = {
        listUpdate: jest.fn(), noteUpdate: jest.fn(),
        whiteboardUpdate: jest.fn(), wireframeUpdate: jest.fn(),
        userListUpdate: jest.fn(), userWireframeUpdate: jest.fn(),
        userListDeleted: jest.fn(),
    };
    const mockIo = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

    registerApiRoutes({
        app, pool, authenticateJWT, requireAdmin,
        publicRateLimit: noop, positionLimiter: noop,
        broadcast: mockBroadcast, io: mockIo,
        port: 3001,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    return app;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Tags Integration Tests', () => {
    let dbHelper, app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`tag-a-${Date.now()}@test.itemize`, 'Tag User A'),
            dbHelper.seedUser(`tag-b-${Date.now()}@test.itemize`, 'Tag User B'),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper.teardown(); }, 30000);

    // ── CRUD & multi-tenant isolation ─────────────────────────────────────────

    describe('Tag CRUD', () => {
        let tagId;

        it('creates a tag in User A org', async () => {
            const res = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'VIP', color: '#F59E0B' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            const tag = res.body.data;
            expect(tag.name).toBe('VIP');
            expect(tag.color).toBe('#F59E0B');
            expect(tag.organization_id).toBe(userA.org.id);
            tagId = tag.id;
        });

        it('rejects creating a tag without a name', async () => {
            const res = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ color: '#F59E0B' });

            expect(res.status).toBe(400);
        });

        it('rejects a duplicate tag name (case-insensitive)', async () => {
            const res = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'vip' }); // same as 'VIP', different case

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toMatch(/already exists/i);
        });

        it('lists tags for User A org', async () => {
            const res = await request(app)
                .get('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data.some(t => t.id === tagId)).toBe(true);
        });

        it('User B org cannot see User A tags', async () => {
            const res = await request(app)
                .get('/api/tags')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.every(t => t.organization_id === userB.org.id)).toBe(true);
            expect(res.body.data.some(t => t.id === tagId)).toBe(false);
        });

        it('tags list includes contact_count', async () => {
            const res = await request(app)
                .get('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            const vip = res.body.data.find(t => t.id === tagId);
            expect(vip).toBeTruthy();
            expect(typeof vip.contact_count).toBe('number');
        });

        it('updates a tag name and color', async () => {
            const res = await request(app)
                .put(`/api/tags/${tagId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Premium', color: '#10B981' });

            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe('Premium');
            expect(res.body.data.color).toBe('#10B981');
        });

        it('User B cannot update User A tag', async () => {
            const res = await request(app)
                .put(`/api/tags/${tagId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ name: 'Hacked' });

            expect(res.status).toBe(404);
        });

        it('deletes a tag', async () => {
            const res = await request(app)
                .delete(`/api/tags/${tagId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
        });

        it('returns 404 on second delete attempt', async () => {
            const res = await request(app)
                .delete(`/api/tags/${tagId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(404);
        });

        it('User B cannot delete User A tag', async () => {
            const createRes = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: `DeleteTarget-${Date.now()}` });
            const freshId = createRes.body.data.id;

            const delRes = await request(app)
                .delete(`/api/tags/${freshId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));
            expect(delRes.status).toBe(404);

            // Cleanup
            await request(app)
                .delete(`/api/tags/${freshId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
        });
    });

    // ── Tag rename propagates to contacts ─────────────────────────────────────

    describe('Tag rename propagates to contacts', () => {
        let tagId;
        let contactId;

        beforeAll(async () => {
            // Create the tag
            const tagRes = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: `OldTagName-${Date.now()}`, color: '#6366F1' });
            tagId = tagRes.body.data.id;
            const tagName = tagRes.body.data.name;

            // Create a contact with that tag in the text tags array
            const cRes = await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, email, tags, created_by)
                 VALUES ($1, 'Tagged Contact', 'tagged-${Date.now()}@test.itemize', $2, $3)
                 RETURNING id`,
                [userA.org.id, [tagName], userA.user.id]
            );
            contactId = cRes.rows[0].id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM contacts WHERE id = $1', [contactId]);
            await dbHelper.pool.query('DELETE FROM tags WHERE id = $1', [tagId]);
        });

        it('renaming a tag updates all contact tags arrays', async () => {
            // Get old name
            const tagRow = await dbHelper.pool.query('SELECT name FROM tags WHERE id = $1', [tagId]);
            const oldName = tagRow.rows[0].name;
            const newName = `NewTagName-${Date.now()}`;

            await request(app)
                .put(`/api/tags/${tagId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: newName });

            // Verify the contact's tags array now contains the new name
            const contactRow = await dbHelper.pool.query(
                'SELECT tags FROM contacts WHERE id = $1',
                [contactId]
            );
            expect(contactRow.rows[0].tags).toContain(newName);
            expect(contactRow.rows[0].tags).not.toContain(oldName);
        });
    });

    // ── Delete with removeFromContacts ────────────────────────────────────────

    describe('Delete with removeFromContacts option', () => {
        let tagId;
        let contactId;
        let tagName;

        beforeAll(async () => {
            tagName = `RemoveTag-${Date.now()}`;
            const tagRes = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: tagName, color: '#EF4444' });
            tagId = tagRes.body.data.id;

            const cRes = await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, email, tags, created_by)
                 VALUES ($1, 'Tagged2', 'tagged2-${Date.now()}@test.itemize', $2, $3)
                 RETURNING id`,
                [userA.org.id, [tagName], userA.user.id]
            );
            contactId = cRes.rows[0].id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM contacts WHERE id = $1', [contactId]);
        });

        it('deletes tag and removes it from all contacts when removeFromContacts=true', async () => {
            const res = await request(app)
                .delete(`/api/tags/${tagId}?removeFromContacts=true`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);

            // Verify tag removed from contact
            const contactRow = await dbHelper.pool.query(
                'SELECT tags FROM contacts WHERE id = $1',
                [contactId]
            );
            expect(contactRow.rows[0].tags).not.toContain(tagName);
        });
    });

    // ── Tag suggestions ───────────────────────────────────────────────────────

    describe('GET /tags/suggestions', () => {
        beforeAll(async () => {
            // Seed a contact with tags so suggestions has something to return
            await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, email, tags, created_by)
                 VALUES ($1, 'Suggested', 'sug-${Date.now()}@test.itemize', $2, $3)`,
                [userA.org.id, ['newsletter', 'premium'], userA.user.id]
            );
        });

        it('returns unique tag strings from contacts', async () => {
            const res = await request(app)
                .get('/api/tags/suggestions')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data).toContain('newsletter');
            expect(res.body.data).toContain('premium');
        });

        it('User B suggestions are isolated to their org', async () => {
            const res = await request(app)
                .get('/api/tags/suggestions')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            // userB has no contacts with tags, so no 'newsletter' or 'premium'
            expect(res.body.data).not.toContain('newsletter');
        });
    });

    // ── Auth guard ────────────────────────────────────────────────────────────

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated list', async () => {
            const res = await request(app).get('/api/tags');
            expect(res.status).toBe(401);
        });
    });
});
