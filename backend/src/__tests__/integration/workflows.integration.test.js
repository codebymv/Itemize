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

const VALID_WORKFLOW = {
    name: 'Welcome Sequence',
    trigger_type: 'contact_added',
    description: 'Sends a welcome email when a contact is added',
};

const VALID_STEPS = [
    { step_type: 'send_email', step_config: { template_id: null, delay_hours: 0 } },
    { step_type: 'wait', step_config: { delay_hours: 24 } },
    { step_type: 'send_email', step_config: { template_id: null, delay_hours: 0 } },
];

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Workflows Integration Tests', () => {
    let dbHelper, app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`wf-a-${Date.now()}@test.itemize`, 'Workflow User A'),
            dbHelper.seedUser(`wf-b-${Date.now()}@test.itemize`, 'Workflow User B'),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper.teardown(); }, 30000);

    // ── CRUD ─────────────────────────────────────────────────────────────────

    describe('Workflow CRUD', () => {
        let workflowId;

        it('creates a workflow with steps', async () => {
            const res = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ ...VALID_WORKFLOW, steps: VALID_STEPS });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            const wf = res.body.data;
            expect(wf.name).toBe('Welcome Sequence');
            expect(wf.trigger_type).toBe('contact_added');
            expect(wf.is_active).toBe(false);
            expect(Array.isArray(wf.steps)).toBe(true);
            expect(wf.steps).toHaveLength(3);
            expect(wf.organization_id).toBe(userA.org.id);
            workflowId = wf.id;
        });

        it('rejects creation without name', async () => {
            const res = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ trigger_type: 'contact_added' });

            expect(res.status).toBe(400);
        });

        it('rejects creation without trigger_type', async () => {
            const res = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Missing Trigger' });

            expect(res.status).toBe(400);
        });

        it('rejects an invalid trigger_type', async () => {
            const res = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Bad Trigger', trigger_type: 'not_a_real_trigger' });

            expect(res.status).toBe(400);
        });

        it('lists workflows scoped to org', async () => {
            const res = await request(app)
                .get('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data.workflows)).toBe(true);
            expect(res.body.data.workflows.some(w => w.id === workflowId)).toBe(true);
        });

        it('User B cannot see User A workflows', async () => {
            const res = await request(app)
                .get('/api/workflows')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.workflows.every(w => w.organization_id === userB.org.id)).toBe(true);
            expect(res.body.data.workflows.some(w => w.id === workflowId)).toBe(false);
        });

        it('fetches a single workflow with steps and enrollment stats', async () => {
            const res = await request(app)
                .get(`/api/workflows/${workflowId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            const wf = res.body.data;
            expect(wf.id).toBe(workflowId);
            expect(Array.isArray(wf.steps)).toBe(true);
            expect(wf.enrollment_stats).toBeTruthy();
        });

        it('User B cannot fetch User A workflow', async () => {
            const res = await request(app)
                .get(`/api/workflows/${workflowId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });

        it('updates a workflow name and replaces steps', async () => {
            const res = await request(app)
                .put(`/api/workflows/${workflowId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Updated Sequence',
                    steps: [{ step_type: 'wait', step_config: { delay_hours: 48 } }],
                });

            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe('Updated Sequence');
            expect(res.body.data.steps).toHaveLength(1);
        });

        it('User B cannot update User A workflow', async () => {
            const res = await request(app)
                .put(`/api/workflows/${workflowId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ name: 'Hijacked' });

            expect(res.status).toBe(404);
        });

        it('deletes a workflow', async () => {
            const res = await request(app)
                .delete(`/api/workflows/${workflowId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.deleted_id).toBe(workflowId);
        });

        it('returns 404 on second delete attempt', async () => {
            const res = await request(app)
                .delete(`/api/workflows/${workflowId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(404);
        });

        it('User B cannot delete User A workflow', async () => {
            const createRes = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(VALID_WORKFLOW);
            const freshId = createRes.body.data.id;

            const delRes = await request(app)
                .delete(`/api/workflows/${freshId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(delRes.status).toBe(404);

            // Cleanup
            await request(app)
                .delete(`/api/workflows/${freshId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
        });
    });

    // ── Activate / Deactivate ────────────────────────────────────────────────

    describe('Activate and deactivate', () => {
        let wfId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ ...VALID_WORKFLOW, steps: VALID_STEPS });
            wfId = res.body.data.id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM workflow_steps WHERE workflow_id = $1', [wfId]);
            await dbHelper.pool.query('DELETE FROM workflows WHERE id = $1', [wfId]);
        });

        it('blocks activation when workflow has no steps', async () => {
            // Create a stepless workflow
            const noStepRes = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'No Steps', trigger_type: 'manual' });
            const noStepId = noStepRes.body.data.id;

            const res = await request(app)
                .post(`/api/workflows/${noStepId}/activate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(400);

            await dbHelper.pool.query('DELETE FROM workflows WHERE id = $1', [noStepId]);
        });

        it('activates a workflow that has steps', async () => {
            const res = await request(app)
                .post(`/api/workflows/${wfId}/activate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.is_active).toBe(true);
        });

        it('deactivates an active workflow', async () => {
            const res = await request(app)
                .post(`/api/workflows/${wfId}/deactivate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.is_active).toBe(false);
        });

        it('User B cannot activate User A workflow', async () => {
            const res = await request(app)
                .post(`/api/workflows/${wfId}/activate`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });
    });

    // ── Enroll / Enrollments ─────────────────────────────────────────────────

    describe('Contact enrollment', () => {
        let wfId;
        let contactId;
        let enrollmentId;

        beforeAll(async () => {
            // Create workflow with steps
            const wfRes = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ ...VALID_WORKFLOW, name: 'Enroll Test', steps: VALID_STEPS });
            wfId = wfRes.body.data.id;

            // Create a contact in org A
            const cRes = await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, email, created_by)
                 VALUES ($1, 'Enroll Test', 'enroll-${Date.now()}@test.itemize', $2)
                 RETURNING id`,
                [userA.org.id, userA.user.id]
            );
            contactId = cRes.rows[0].id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM workflow_enrollments WHERE workflow_id = $1', [wfId]);
            await dbHelper.pool.query('DELETE FROM workflow_steps WHERE workflow_id = $1', [wfId]);
            await dbHelper.pool.query('DELETE FROM workflows WHERE id = $1', [wfId]);
            await dbHelper.pool.query('DELETE FROM contacts WHERE id = $1', [contactId]);
        });

        it('rejects enrollment without contact_id', async () => {
            const res = await request(app)
                .post(`/api/workflows/${wfId}/enroll`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({});

            expect(res.status).toBe(400);
        });

        it('enrolls a contact in a workflow', async () => {
            const res = await request(app)
                .post(`/api/workflows/${wfId}/enroll`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ contact_id: contactId });

            // Route returns 201 for a new enrollment, 200 for re-enrollment
            expect([200, 201]).toContain(res.status);
            expect(res.body.data.contact_id).toBe(contactId);
            expect(res.body.data.status).toBe('active');
            enrollmentId = res.body.data.id;
        });

        it('rejects duplicate enrollment for an already-active contact', async () => {
            const res = await request(app)
                .post(`/api/workflows/${wfId}/enroll`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ contact_id: contactId });

            expect(res.status).toBe(400);
        });

        it('returns 404 when enrolling a contact from a different org', async () => {
            // contactId belongs to userA.org, but userB is requesting
            const res = await request(app)
                .post(`/api/workflows/${wfId}/enroll`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ contact_id: contactId });

            // Workflow belongs to userA.org, so userB gets 404 on the workflow itself
            expect(res.status).toBe(404);
        });

        it('lists enrollments for the workflow', async () => {
            const res = await request(app)
                .get(`/api/workflows/${wfId}/enrollments`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data.enrollments)).toBe(true);
            expect(res.body.data.enrollments.some(e => e.id === enrollmentId)).toBe(true);
        });

        it('cancels an enrollment', async () => {
            const res = await request(app)
                .delete(`/api/workflows/${wfId}/enrollments/${enrollmentId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe('cancelled');
        });
    });

    // ── Duplicate ────────────────────────────────────────────────────────────

    describe('Workflow duplicate', () => {
        let sourceId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ ...VALID_WORKFLOW, name: 'Source Workflow', steps: VALID_STEPS });
            sourceId = res.body.data.id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM workflow_steps WHERE workflow_id IN (SELECT id FROM workflows WHERE name LIKE $1 AND organization_id = $2)', ['%Source Workflow%', userA.org.id]);
            await dbHelper.pool.query('DELETE FROM workflows WHERE name LIKE $1 AND organization_id = $2', ['%Source Workflow%', userA.org.id]);
        });

        it('duplicates a workflow with its steps', async () => {
            const res = await request(app)
                .post(`/api/workflows/${sourceId}/duplicate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(201);
            const copy = res.body.data;
            expect(copy.name).toBe('Source Workflow (Copy)');
            expect(copy.is_active).toBe(false);
            expect(copy.steps).toHaveLength(VALID_STEPS.length);
            expect(copy.id).not.toBe(sourceId);
        });

        it('User B cannot duplicate User A workflow', async () => {
            const res = await request(app)
                .post(`/api/workflows/${sourceId}/duplicate`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });
    });

    // ── Plan limit ───────────────────────────────────────────────────────────

    describe('Workflow plan limit enforcement', () => {
        it('blocks creation when org is at the workflow limit', async () => {
            const limitUser = await dbHelper.seedUser(
                `wf-limit-${Date.now()}@test.itemize`, 'WF Limit User'
            );

            await dbHelper.pool.query(
                'UPDATE organizations SET workflows_limit = 1 WHERE id = $1',
                [limitUser.org.id]
            );

            const r1 = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${limitUser.token}`])
                .set('x-organization-id', String(limitUser.org.id))
                .send({ name: 'First', trigger_type: 'manual' });
            expect(r1.status).toBe(201);

            const r2 = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${limitUser.token}`])
                .set('x-organization-id', String(limitUser.org.id))
                .send({ name: 'Second (over limit)', trigger_type: 'manual' });
            expect(r2.status).toBe(403);
            expect(JSON.stringify(r2.body)).toMatch(/limit/i);
        });
    });

    // ── Auth guard ───────────────────────────────────────────────────────────

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated list request', async () => {
            const res = await request(app).get('/api/workflows');
            expect(res.status).toBe(401);
        });
    });
});
