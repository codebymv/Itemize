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

    const { router: authRouter } = require('../../auth');
    app.use('/api/auth', authRouter);

    const noop = (_req, _res, next) => next();
    const mockBroadcast = {
        listUpdate: jest.fn(), noteUpdate: jest.fn(),
        whiteboardUpdate: jest.fn(), wireframeUpdate: jest.fn(),
        userListUpdate: jest.fn(), userWireframeUpdate: jest.fn(),
        userListDeleted: jest.fn(),
    };
    const mockIo = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

    registerApiRoutes({
        app, pool,
        authenticateJWT, requireAdmin,
        publicRateLimit: noop, positionLimiter: noop,
        broadcast: mockBroadcast, io: mockIo,
        port: 3001,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    return app;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Pipelines Integration Tests', () => {
    let dbHelper;
    let app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`pipe-a-${Date.now()}@test.itemize`, 'Pipeline User A'),
            dbHelper.seedUser(`pipe-b-${Date.now()}@test.itemize`, 'Pipeline User B'),
        ]);
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    // ── Pipeline CRUD ─────────────────────────────────────────────────────────

    describe('Pipeline CRUD', () => {
        let pipelineId;

        it('creates a pipeline for User A org', async () => {
            const res = await request(app)
                .post('/api/pipelines')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Sales Pipeline' });

            expect(res.status).toBe(201);
            expect(res.body.name).toBe('Sales Pipeline');
            expect(res.body.organization_id).toBe(userA.org.id);
            // Default stages should be created
            expect(Array.isArray(res.body.stages)).toBe(true);
            expect(res.body.stages.length).toBeGreaterThan(0);
            pipelineId = res.body.id;
        });

        it('requires a name when creating a pipeline', async () => {
            const res = await request(app)
                .post('/api/pipelines')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: '' });

            expect(res.status).toBe(400);
        });

        it('lists pipelines scoped to User A org', async () => {
            const res = await request(app)
                .get('/api/pipelines')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.some(p => p.id === pipelineId)).toBe(true);
        });

        it('User B org sees no pipelines from User A org', async () => {
            const res = await request(app)
                .get('/api/pipelines')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            expect(res.body.every(p => p.organization_id === userB.org.id)).toBe(true);
            expect(res.body.some(p => p.id === pipelineId)).toBe(false);
        });

        it('fetches a single pipeline with deals list', async () => {
            const res = await request(app)
                .get(`/api/pipelines/${pipelineId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(pipelineId);
            expect(Array.isArray(res.body.deals)).toBe(true);
        });

        it('returns 404 when User B tries to fetch User A pipeline by ID', async () => {
            const res = await request(app)
                .get(`/api/pipelines/${pipelineId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });

        it('updates a pipeline name', async () => {
            const res = await request(app)
                .put(`/api/pipelines/${pipelineId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Updated Pipeline' });

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('Updated Pipeline');
        });

        it('prevents User B from updating User A pipeline', async () => {
            const res = await request(app)
                .put(`/api/pipelines/${pipelineId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ name: 'Hacked' });

            expect(res.status).toBe(404);
        });

        it('deletes a pipeline (no deals)', async () => {
            const res = await request(app)
                .delete(`/api/pipelines/${pipelineId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/deleted/i);
        });
    });

    // ── Deal CRUD ─────────────────────────────────────────────────────────────

    describe('Deal CRUD & multi-tenant isolation', () => {
        let pipelineId;
        let dealId;

        beforeAll(async () => {
            // Create a fresh pipeline for deal tests
            const res = await request(app)
                .post('/api/pipelines')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Deal Test Pipeline' });
            pipelineId = res.body.id;
        });

        it('creates a deal in User A pipeline', async () => {
            const res = await request(app)
                .post('/api/pipelines/deals')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    pipeline_id: pipelineId,
                    title: 'Big Client Deal',
                    value: 5000,
                });

            expect(res.status).toBe(201);
            expect(res.body.title).toBe('Big Client Deal');
            expect(res.body.value).toBe('5000');
            expect(res.body.organization_id).toBe(userA.org.id);
            dealId = res.body.id;
        });

        it('requires pipeline_id when creating a deal', async () => {
            const res = await request(app)
                .post('/api/pipelines/deals')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ title: 'No Pipeline' });

            expect(res.status).toBe(400);
        });

        it('requires title when creating a deal', async () => {
            const res = await request(app)
                .post('/api/pipelines/deals')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ pipeline_id: pipelineId, title: '' });

            expect(res.status).toBe(400);
        });

        it('returns 404 when pipeline_id belongs to another org', async () => {
            // userB tries to create deal referencing userA's pipeline
            const res = await request(app)
                .post('/api/pipelines/deals')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ pipeline_id: pipelineId, title: 'Cross-org Attack' });

            expect(res.status).toBe(404);
        });

        it('fetches a single deal by ID', async () => {
            const res = await request(app)
                .get(`/api/pipelines/deals/${dealId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(dealId);
        });

        it('returns 404 when User B tries to fetch User A deal', async () => {
            const res = await request(app)
                .get(`/api/pipelines/deals/${dealId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });

        it('lists deals filtered by org', async () => {
            const res = await request(app)
                .get('/api/pipelines/deals/all')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.deals)).toBe(true);
            expect(res.body.deals.some(d => d.id === dealId)).toBe(true);
        });

        it('User B deals list does not contain User A deals', async () => {
            const res = await request(app)
                .get('/api/pipelines/deals/all')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            expect(res.body.deals.every(d => d.organization_id === userB.org.id)).toBe(true);
        });

        it('updates a deal', async () => {
            const res = await request(app)
                .put(`/api/pipelines/deals/${dealId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ title: 'Updated Deal', value: 9999 });

            expect(res.status).toBe(200);
            expect(res.body.title).toBe('Updated Deal');
        });

        it('prevents User B from updating User A deal', async () => {
            const res = await request(app)
                .put(`/api/pipelines/deals/${dealId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ title: 'Hijacked' });

            expect(res.status).toBe(404);
        });
    });

    // ── Deal lifecycle (won/lost/reopen) ──────────────────────────────────────

    describe('Deal lifecycle transitions', () => {
        let pipelineId;
        let dealId;

        beforeAll(async () => {
            const pRes = await request(app)
                .post('/api/pipelines')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Lifecycle Pipeline' });
            pipelineId = pRes.body.id;

            const dRes = await request(app)
                .post('/api/pipelines/deals')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ pipeline_id: pipelineId, title: 'Lifecycle Deal' });
            dealId = dRes.body.id;
        });

        it('marks a deal as won', async () => {
            const res = await request(app)
                .post(`/api/pipelines/deals/${dealId}/won`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.won_at).toBeTruthy();
            expect(res.body.lost_at).toBeFalsy();
        });

        it('reopens a won deal', async () => {
            const res = await request(app)
                .post(`/api/pipelines/deals/${dealId}/reopen`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.won_at).toBeFalsy();
            expect(res.body.lost_at).toBeFalsy();
        });

        it('marks a deal as lost with a reason', async () => {
            const res = await request(app)
                .post(`/api/pipelines/deals/${dealId}/lost`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ reason: 'Budget constraints' });

            expect(res.status).toBe(200);
            expect(res.body.lost_at).toBeTruthy();
            expect(res.body.won_at).toBeFalsy();
            expect(res.body.lost_reason).toBe('Budget constraints');
        });

        it('reopens a lost deal', async () => {
            const res = await request(app)
                .post(`/api/pipelines/deals/${dealId}/reopen`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.lost_at).toBeFalsy();
        });

        it('prevents User B from marking User A deal as won', async () => {
            const res = await request(app)
                .post(`/api/pipelines/deals/${dealId}/won`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });

        it('deletes a deal', async () => {
            const res = await request(app)
                .delete(`/api/pipelines/deals/${dealId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
        });
    });

    // ── Pipeline delete blocked by deals ─────────────────────────────────────

    describe('Pipeline delete protection', () => {
        it('blocks pipeline deletion when deals exist', async () => {
            // Create pipeline + deal
            const pRes = await request(app)
                .post('/api/pipelines')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Protected Pipeline' });
            const protectedPipelineId = pRes.body.id;

            await request(app)
                .post('/api/pipelines/deals')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ pipeline_id: protectedPipelineId, title: 'Blocking Deal' });

            const delRes = await request(app)
                .delete(`/api/pipelines/${protectedPipelineId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(delRes.status).toBe(400);
            expect(JSON.stringify(delRes.body)).toMatch(/deals/i);
        });
    });

    // ── Auth guard ────────────────────────────────────────────────────────────

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated pipeline list request', async () => {
            const res = await request(app)
                .get('/api/pipelines')
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(401);
        });
    });
});
