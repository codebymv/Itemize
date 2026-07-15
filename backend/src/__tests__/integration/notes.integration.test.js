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

describe('Notes Integration Tests', () => {
    let dbHelper, app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`note-a-${Date.now()}@test.itemize`, 'Note User A'),
            dbHelper.seedUser(`note-b-${Date.now()}@test.itemize`, 'Note User B'),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper.teardown(); }, 30000);

    // ── CRUD & user-scope isolation ───────────────────────────────────────────

    describe('CRUD & user-scope isolation', () => {
        let noteId;

        it('creates a note for User A', async () => {
            const res = await request(app)
                .post('/api/notes')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .send({
                    title: 'My First Note',
                    content: 'Some content here',
                    category: 'Work',
                    color_value: '#EF4444',
                    position_x: 100,
                    position_y: 200,
                });

            expect(res.status).toBe(201);
            const note = res.body;
            expect(note.title).toBe('My First Note');
            expect(note.content).toBe('Some content here');
            expect(note.category).toBe('Work');
            expect(note.color_value).toBe('#EF4444');
            expect(Number(note.position_x)).toBe(100);
            expect(Number(note.position_y)).toBe(200);
            expect(note.user_id).toBe(userA.user.id);
            noteId = note.id;
        });

        it('lists notes for User A — only their own', async () => {
            const res = await request(app)
                .get('/api/notes')
                .set('Cookie', [`itemize_auth=${userA.token}`]);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.notes)).toBe(true);
            expect(res.body.notes.some(n => n.id === noteId)).toBe(true);
            // Every returned note must belong to userA
            expect(res.body.notes.every(n => n.user_id === userA.user.id)).toBe(true);
        });

        it('User B list does not contain User A notes', async () => {
            const res = await request(app)
                .get('/api/notes')
                .set('Cookie', [`itemize_auth=${userB.token}`]);

            expect(res.status).toBe(200);
            expect(res.body.notes.every(n => n.user_id === userB.user.id)).toBe(true);
            expect(res.body.notes.some(n => n.id === noteId)).toBe(false);
        });

        it('updates a note', async () => {
            const res = await request(app)
                .put(`/api/notes/${noteId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .send({ title: 'Updated Note', content: 'New content', color_value: '#3B82F6' });

            expect(res.status).toBe(200);
            expect(res.body.title).toBe('Updated Note');
            expect(res.body.content).toBe('New content');
            expect(res.body.color_value).toBe('#3B82F6');
        });

        it('User B cannot update User A note', async () => {
            const res = await request(app)
                .put(`/api/notes/${noteId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .send({ title: 'Hijacked' });

            expect(res.status).toBe(404);
        });

        it('deletes a note', async () => {
            const res = await request(app)
                .delete(`/api/notes/${noteId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`]);

            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/deleted/i);
        });

        it('returns 404 when deleting already-deleted note', async () => {
            const res = await request(app)
                .delete(`/api/notes/${noteId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`]);

            expect(res.status).toBe(404);
        });

        it('User B cannot delete User A note', async () => {
            // Create a fresh note for this test
            const createRes = await request(app)
                .post('/api/notes')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .send({ title: 'Target Note', content: 'Delete me' });
            const freshId = createRes.body.id;

            const delRes = await request(app)
                .delete(`/api/notes/${freshId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`]);
            expect(delRes.status).toBe(404);

            // Cleanup
            await request(app)
                .delete(`/api/notes/${freshId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`]);
        });
    });

    // ── Partial update endpoints ──────────────────────────────────────────────

    describe('Partial update endpoints', () => {
        let noteId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/notes')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .send({ title: 'Partial Update Note', content: 'Original', category: 'Personal' });
            noteId = res.body.id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM notes WHERE id = $1', [noteId]);
        });

        it('PUT /notes/:id/content updates only the content', async () => {
            const res = await request(app)
                .put(`/api/notes/${noteId}/content`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .send({ content: 'Content only updated' });

            expect(res.status).toBe(200);
            expect(res.body.content).toBe('Content only updated');
            expect(res.body.title).toBe('Partial Update Note'); // unchanged
        });

        it('PUT /notes/:id/content requires content field', async () => {
            const res = await request(app)
                .put(`/api/notes/${noteId}/content`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .send({});

            expect(res.status).toBe(400);
        });

        it('PUT /notes/:id/title updates only the title', async () => {
            const res = await request(app)
                .put(`/api/notes/${noteId}/title`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .send({ title: 'Title Only Updated' });

            expect(res.status).toBe(200);
            expect(res.body.title).toBe('Title Only Updated');
        });

        it('PUT /notes/:id/title rejects blank title', async () => {
            const res = await request(app)
                .put(`/api/notes/${noteId}/title`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .send({ title: '   ' });

            expect(res.status).toBe(400);
        });

        it('PUT /notes/:id/category updates only the category', async () => {
            const res = await request(app)
                .put(`/api/notes/${noteId}/category`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .send({ category: 'Work' });

            expect(res.status).toBe(200);
            expect(res.body.category).toBe('Work');
        });

        it('PUT /notes/:id/category rejects blank category', async () => {
            const res = await request(app)
                .put(`/api/notes/${noteId}/category`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .send({ category: '' });

            expect(res.status).toBe(400);
        });

        it('partial endpoints return 404 for other user\'s note', async () => {
            const res = await request(app)
                .put(`/api/notes/${noteId}/content`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .send({ content: 'Hijack attempt' });

            expect(res.status).toBe(404);
        });
    });

    // ── Filtering & pagination ────────────────────────────────────────────────

    describe('Filtering and pagination', () => {
        let workNoteId, personalNoteId;

        beforeAll(async () => {
            const [r1, r2] = await Promise.all([
                request(app)
                    .post('/api/notes')
                    .set('Cookie', [`itemize_auth=${userA.token}`])
                    .send({ title: 'Sprint Planning', category: 'Work', content: 'velocity stuff' }),
                request(app)
                    .post('/api/notes')
                    .set('Cookie', [`itemize_auth=${userA.token}`])
                    .send({ title: 'Grocery List', category: 'Personal', content: 'milk eggs' }),
            ]);
            workNoteId = r1.body.id;
            personalNoteId = r2.body.id;
        });

        afterAll(async () => {
            await dbHelper.pool.query(
                'DELETE FROM notes WHERE id = ANY($1::int[])',
                [[workNoteId, personalNoteId].filter(Boolean)]
            );
        });

        it('filters by category', async () => {
            const res = await request(app)
                .get('/api/notes?category=Work')
                .set('Cookie', [`itemize_auth=${userA.token}`]);

            expect(res.status).toBe(200);
            expect(res.body.notes.every(n => n.category === 'Work')).toBe(true);
            expect(res.body.notes.some(n => n.id === workNoteId)).toBe(true);
        });

        it('filters by text search (title match)', async () => {
            const res = await request(app)
                .get('/api/notes?search=Grocery')
                .set('Cookie', [`itemize_auth=${userA.token}`]);

            expect(res.status).toBe(200);
            expect(res.body.notes.some(n => n.id === personalNoteId)).toBe(true);
        });

        it('filters by text search (content match)', async () => {
            const res = await request(app)
                .get('/api/notes?search=velocity')
                .set('Cookie', [`itemize_auth=${userA.token}`]);

            expect(res.status).toBe(200);
            expect(res.body.notes.some(n => n.id === workNoteId)).toBe(true);
        });

        it('returns pagination metadata', async () => {
            const res = await request(app)
                .get('/api/notes?page=1&limit=1')
                .set('Cookie', [`itemize_auth=${userA.token}`]);

            expect(res.status).toBe(200);
            expect(res.body.pagination).toBeTruthy();
            expect(res.body.pagination.page).toBe(1);
            expect(res.body.pagination.limit).toBe(1);
            expect(typeof res.body.pagination.total).toBe('number');
            expect(res.body.notes).toHaveLength(1);
        });
    });

    // ── Auth guard ────────────────────────────────────────────────────────────

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated list', async () => {
            const res = await request(app).get('/api/notes');
            expect(res.status).toBe(401);
        });

        it('returns 401 on unauthenticated create', async () => {
            const res = await request(app)
                .post('/api/notes')
                .send({ title: 'Ghost Note' });
            expect(res.status).toBe(401);
        });
    });
});
