const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');
const {
    runCanonicalPipelineStageModelMigration,
} = require('../../db_pipeline_stage_canonical_migrations');

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
            // Postgres NUMERIC returns as string; value may include decimal places
            expect(Number(res.body.value)).toBe(5000);
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

        it('rejects cross-tenant contacts, assignees, and unknown stages', async () => {
            const foreignContact = await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, created_by)
                 VALUES ($1, 'Foreign Contact', $2)
                 RETURNING id`,
                [userB.org.id, userB.user.id]
            );

            const baseRequest = body => request(app)
                .post('/api/pipelines/deals')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ pipeline_id: pipelineId, title: 'Invalid Reference', ...body });

            const [contactResult, assigneeResult, stageResult] = await Promise.all([
                baseRequest({ contact_id: foreignContact.rows[0].id }),
                baseRequest({ assigned_to: userB.user.id }),
                baseRequest({ stage_id: 'not-a-real-stage' }),
            ]);

            expect(contactResult.status).toBe(400);
            expect(assigneeResult.status).toBe(400);
            expect(stageResult.status).toBe(400);
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

        it('rejects cross-tenant references and invalid stages when updating or moving a deal', async () => {
            const foreignContact = await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, created_by)
                 VALUES ($1, 'Update Foreign Contact', $2)
                 RETURNING id`,
                [userB.org.id, userB.user.id]
            );

            const update = await request(app)
                .put(`/api/pipelines/deals/${dealId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ contact_id: foreignContact.rows[0].id });
            expect(update.status).toBe(400);

            const move = await request(app)
                .patch(`/api/pipelines/deals/${dealId}/stage`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ stage_id: 'not-a-real-stage' });
            expect(move.status).toBe(400);
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

            const outsiderDelete = await request(app)
                .delete(`/api/pipelines/${protectedPipelineId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));
            expect(outsiderDelete.status).toBe(404);

            const pipeline = await dbHelper.pool.query(
                'SELECT stages FROM pipelines WHERE id = $1',
                [protectedPipelineId]
            );
            const stagesWithoutCurrent = pipeline.rows[0].stages.slice(1);
            const removeUsedStage = await request(app)
                .put(`/api/pipelines/${protectedPipelineId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ stages: stagesWithoutCurrent });
            expect(removeUsedStage.status).toBe(409);
        });
    });

    describe('Canonical pipeline-stage persistence', () => {
        let canonicalPipelineId;
        const firstStageId = 'canonical-qualified';
        const secondStageId = 'canonical-proposal';

        beforeAll(async () => {
            const response = await request(app)
                .post('/api/pipelines')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Canonical Stage Pipeline',
                    stages: [
                        {
                            id: ` ${firstStageId} `,
                            name: ' Qualified ',
                            order: 99,
                            color: ' #123456 ',
                        },
                        {
                            id: secondStageId,
                            name: 'Proposal',
                            order: 0,
                            color: '#654321',
                        },
                    ],
                });

            expect(response.status).toBe(201);
            canonicalPipelineId = response.body.id;
        });

        it('normalizes JSON writes into ordered canonical stage rows', async () => {
            const stages = await dbHelper.pool.query(
                `SELECT stage_key, name, color, stage_order
                 FROM pipeline_stages
                 WHERE pipeline_id = $1
                 ORDER BY stage_order, id`,
                [canonicalPipelineId]
            );

            expect(stages.rows).toEqual([
                {
                    stage_key: firstStageId,
                    name: 'Qualified',
                    color: '#123456',
                    stage_order: 0,
                },
                {
                    stage_key: secondStageId,
                    name: 'Proposal',
                    color: '#654321',
                    stage_order: 1,
                },
            ]);

            const pipeline = await dbHelper.pool.query(
                'SELECT stages FROM pipelines WHERE id = $1',
                [canonicalPipelineId]
            );
            expect(pipeline.rows[0].stages).toEqual([
                { id: firstStageId, name: 'Qualified', order: 0, color: '#123456' },
                { id: secondStageId, name: 'Proposal', order: 1, color: '#654321' },
            ]);
        });

        it('rejects duplicate normalized stage keys at the HTTP boundary', async () => {
            const response = await request(app)
                .post('/api/pipelines')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Duplicate Stage Pipeline',
                    stages: [
                        { id: 'duplicate', name: 'First' },
                        { id: ' duplicate ', name: 'Second' },
                    ],
                });

            expect(response.status).toBe(400);
        });

        it('projects direct canonical edits and prevents deletion of an in-use stage', async () => {
            await dbHelper.pool.query(
                `UPDATE pipeline_stages
                 SET name = 'Qualified Direct', color = '#ABCDEF'
                 WHERE pipeline_id = $1 AND stage_key = $2`,
                [canonicalPipelineId, firstStageId]
            );
            await dbHelper.pool.query(
                `INSERT INTO pipeline_stages (
                    pipeline_id, stage_key, name, color, stage_order
                 ) VALUES ($1, 'canonical-review', 'Review', '#111111', 2)`,
                [canonicalPipelineId]
            );

            let pipeline = await dbHelper.pool.query(
                'SELECT stages FROM pipelines WHERE id = $1',
                [canonicalPipelineId]
            );
            expect(pipeline.rows[0].stages).toEqual([
                { id: firstStageId, name: 'Qualified Direct', order: 0, color: '#ABCDEF' },
                { id: secondStageId, name: 'Proposal', order: 1, color: '#654321' },
                { id: 'canonical-review', name: 'Review', order: 2, color: '#111111' },
            ]);

            await dbHelper.pool.query(
                `DELETE FROM pipeline_stages
                 WHERE pipeline_id = $1 AND stage_key = 'canonical-review'`,
                [canonicalPipelineId]
            );

            const deal = await request(app)
                .post('/api/pipelines/deals')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    pipeline_id: canonicalPipelineId,
                    stage_id: firstStageId,
                    title: 'Canonical Stage Deal',
                });
            expect(deal.status).toBe(201);

            const normalizedUpdate = await request(app)
                .put(`/api/pipelines/${canonicalPipelineId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    stages: [
                        {
                            id: ` ${firstStageId} `,
                            name: 'Qualified Direct',
                            color: '#ABCDEF',
                        },
                        {
                            id: secondStageId,
                            name: 'Proposal',
                            color: '#654321',
                        },
                    ],
                });
            expect(normalizedUpdate.status).toBe(200);

            await expect(dbHelper.pool.query(
                `DELETE FROM pipeline_stages
                 WHERE pipeline_id = $1 AND stage_key = $2`,
                [canonicalPipelineId, firstStageId]
            )).rejects.toMatchObject({ code: '23503' });

            pipeline = await dbHelper.pool.query(
                'SELECT stages FROM pipelines WHERE id = $1',
                [canonicalPipelineId]
            );
            expect(pipeline.rows[0].stages.map(stage => stage.id)).toEqual([
                firstStageId,
                secondStageId,
            ]);
        });

        it('enforces tenant ownership and stage membership for direct deal writes', async () => {
            const foreignPipeline = await request(app)
                .post('/api/pipelines')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ name: 'Foreign Canonical Pipeline' });
            expect(foreignPipeline.status).toBe(201);

            await expect(dbHelper.pool.query(
                `INSERT INTO deals (
                    organization_id, pipeline_id, stage_id, title, created_by
                 ) VALUES ($1, $2, $3, 'Cross Tenant Direct Deal', $4)`,
                [
                    userA.org.id,
                    foreignPipeline.body.id,
                    foreignPipeline.body.stages[0].id,
                    userA.user.id,
                ]
            )).rejects.toMatchObject({ code: '23503' });

            await expect(dbHelper.pool.query(
                `INSERT INTO deals (
                    organization_id, pipeline_id, stage_id, title, created_by
                 ) VALUES ($1, $2, 'missing-canonical-stage', 'Missing Stage Deal', $3)`,
                [userA.org.id, canonicalPipelineId, userA.user.id]
            )).rejects.toMatchObject({ code: '23503' });
        });

        it('repairs stale shadow rows while preserving deal-referenced missing stages', async () => {
            const response = await request(app)
                .post('/api/pipelines')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Pipeline Drift Repair',
                    stages: [
                        { id: 'json-live', name: 'Live Before Drift', color: '#010101' },
                        { id: 'deal-shadow', name: 'Deal Before Drift', color: '#020202' },
                    ],
                });
            expect(response.status).toBe(201);
            const repairPipelineId = response.body.id;

            const deal = await request(app)
                .post('/api/pipelines/deals')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    pipeline_id: repairPipelineId,
                    stage_id: 'deal-shadow',
                    title: 'Drift Repair Deal',
                });
            expect(deal.status).toBe(201);

            await dbHelper.pool.query('DROP TRIGGER pipelines_prepare_canonical_stages ON pipelines');
            await dbHelper.pool.query('DROP TRIGGER pipelines_sync_canonical_stages ON pipelines');
            await dbHelper.pool.query('DROP TRIGGER pipeline_stages_prepare_row ON pipeline_stages');
            await dbHelper.pool.query('DROP TRIGGER pipeline_stages_project_json ON pipeline_stages');
            await dbHelper.pool.query('ALTER TABLE deals DROP CONSTRAINT deals_pipeline_stage_fk');
            await dbHelper.pool.query(
                `UPDATE pipelines
                 SET stages = $2::jsonb
                 WHERE id = $1`,
                [
                    repairPipelineId,
                    JSON.stringify([
                        { id: 'json-live', name: 'JSON Wins', color: '#AAAAAA' },
                    ]),
                ]
            );
            await dbHelper.pool.query(
                `UPDATE pipeline_stages
                 SET name = 'Shadow Deal Stage', color = '#BBBBBB'
                 WHERE pipeline_id = $1 AND stage_key = 'deal-shadow'`,
                [repairPipelineId]
            );
            await dbHelper.pool.query(
                `INSERT INTO pipeline_stages (
                    pipeline_id, stage_key, name, color, stage_order
                 ) VALUES ($1, 'unused-shadow', 'Unused Shadow', '#CCCCCC', 2)`,
                [repairPipelineId]
            );

            await runCanonicalPipelineStageModelMigration(dbHelper.pool);

            const stages = await dbHelper.pool.query(
                `SELECT stage_key, name, color, stage_order
                 FROM pipeline_stages
                 WHERE pipeline_id = $1
                 ORDER BY stage_order, id`,
                [repairPipelineId]
            );
            expect(stages.rows).toEqual([
                {
                    stage_key: 'json-live',
                    name: 'JSON Wins',
                    color: '#AAAAAA',
                    stage_order: 0,
                },
                {
                    stage_key: 'deal-shadow',
                    name: 'Shadow Deal Stage',
                    color: '#BBBBBB',
                    stage_order: 1,
                },
            ]);

            const pipeline = await dbHelper.pool.query(
                'SELECT stages FROM pipelines WHERE id = $1',
                [repairPipelineId]
            );
            expect(pipeline.rows[0].stages.map(stage => stage.id)).toEqual([
                'json-live',
                'deal-shadow',
            ]);

            const constraints = await dbHelper.pool.query(
                `SELECT conname
                 FROM pg_constraint
                 WHERE conrelid = 'deals'::regclass
                   AND conname IN (
                     'deals_pipeline_organization_fk',
                     'deals_pipeline_stage_fk'
                   )
                 ORDER BY conname`
            );
            expect(constraints.rows.map(row => row.conname)).toEqual([
                'deals_pipeline_organization_fk',
                'deals_pipeline_stage_fk',
            ]);
        });
    });

    describe('Default pipeline concurrency', () => {
        it('leaves exactly one default when concurrent creates request default status', async () => {
            const create = name => request(app)
                .post('/api/pipelines')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name, is_default: true });

            const responses = await Promise.all([
                create(`Default A ${Date.now()}`),
                create(`Default B ${Date.now()}`),
            ]);
            expect(responses.every(response => response.status === 201)).toBe(true);

            await expect(dbHelper.pool.query(
                `UPDATE pipelines
                 SET is_default = true
                 WHERE id = ANY($1::int[])`,
                [responses.map(response => response.body.id)]
            )).rejects.toMatchObject({ code: '23505' });

            const defaults = await dbHelper.pool.query(
                'SELECT COUNT(*)::int AS count FROM pipelines WHERE organization_id = $1 AND is_default = TRUE',
                [userA.org.id]
            );
            expect(defaults.rows[0].count).toBe(1);
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
