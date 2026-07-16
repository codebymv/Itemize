const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');
const { runWorkflowSideEffectJobs } = require('../../jobs/workflow-side-effect-jobs');

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

        it('normalizes legacy trigger aliases and accepts producer-backed booking events', async () => {
            const aliasResponse = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Legacy Contact Trigger', trigger_type: 'contact_created' });

            expect(aliasResponse.status).toBe(201);
            expect(aliasResponse.body.data.trigger_type).toBe('contact_added');

            const bookingResponse = await request(app)
                .put(`/api/workflows/${aliasResponse.body.data.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ trigger_type: 'booking_created' });

            expect(bookingResponse.status).toBe(200);
            expect(bookingResponse.body.data.trigger_type).toBe('booking_created');

            await request(app)
                .delete(`/api/workflows/${aliasResponse.body.data.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
        });

        it('requires a tenant-owned contact and timestamp for a one-shot schedule', async () => {
            const missingConfig = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Missing schedule', trigger_type: 'scheduled' });
            expect(missingConfig.status).toBe(400);

            const foreignContact = await dbHelper.pool.query(`
                INSERT INTO contacts (organization_id, first_name, email, created_by)
                VALUES ($1, 'Foreign Schedule', $2, $3)
                RETURNING id
            `, [
                userB.org.id,
                `foreign-schedule-${Date.now()}@test.itemize`,
                userB.user.id,
            ]);
            const scheduledAt = new Date(Date.now() + 60_000).toISOString();
            const denied = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Foreign schedule',
                    trigger_type: 'scheduled',
                    trigger_config: {
                        contact_id: foreignContact.rows[0].id,
                        scheduled_at: scheduledAt,
                    },
                });
            expect(denied.status).toBe(400);

            const contact = await dbHelper.pool.query(`
                INSERT INTO contacts (organization_id, first_name, email, created_by)
                VALUES ($1, 'Local Schedule', $2, $3)
                RETURNING id
            `, [
                userA.org.id,
                `local-schedule-${Date.now()}@test.itemize`,
                userA.user.id,
            ]);
            const created = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Valid schedule',
                    trigger_type: 'scheduled',
                    trigger_config: {
                        contact_id: contact.rows[0].id,
                        scheduled_at: scheduledAt,
                    },
                    steps: [{ step_type: 'add_tag', step_config: { tag_name: 'scheduled' } }],
                });
            expect(created.status).toBe(201);
            expect(created.body.data).toMatchObject({
                trigger_type: 'scheduled',
                scheduled_contact_id: contact.rows[0].id,
            });
            expect(new Date(created.body.data.next_trigger_at).toISOString()).toBe(scheduledAt);

            const activated = await request(app)
                .post(`/api/workflows/${created.body.data.id}/activate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(activated.status).toBe(200);
            expect(activated.body.data.is_active).toBe(true);

            await dbHelper.pool.query(`
                UPDATE workflows
                SET next_trigger_at = NULL, last_triggered_at = $1
                WHERE id = $2
            `, [scheduledAt, created.body.data.id]);
            const ordinarySave = await request(app)
                .put(`/api/workflows/${created.body.data.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Valid schedule renamed',
                    trigger_type: 'scheduled',
                    trigger_config: {
                        contact_id: contact.rows[0].id,
                        scheduled_at: scheduledAt,
                    },
                });
            expect(ordinarySave.status).toBe(200);
            expect(ordinarySave.body.data.next_trigger_at).toBeNull();
            expect(ordinarySave.body.data.last_triggered_at).toBeTruthy();

            await dbHelper.pool.query('DELETE FROM workflows WHERE id = $1', [created.body.data.id]);
            await dbHelper.pool.query(
                'DELETE FROM contacts WHERE id IN ($1, $2)',
                [contact.rows[0].id, foreignContact.rows[0].id]
            );
        });

        it('rejects a workflow step with an unsupported type', async () => {
            const res = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    ...VALID_WORKFLOW,
                    steps: [{ step_type: 'run_arbitrary_code', step_config: {} }],
                });

            expect(res.status).toBe(400);
            expect(res.body.error.message).toMatch(/step_type/);
        });

        it('rejects condition branches that loop backward or outside the workflow', async () => {
            const res = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    ...VALID_WORKFLOW,
                    steps: [
                        {
                            step_type: 'condition',
                            step_config: {},
                            condition_config: { field: 'status', operator: 'equals', value: 'active' },
                            true_branch_step: 1,
                        },
                        { step_type: 'add_tag', step_config: { tag_name: 'safe' } },
                    ],
                });

            expect(res.status).toBe(400);
            expect(res.body.error.message).toMatch(/later step/);
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

        it('rejects an invalid trigger type during update', async () => {
            const res = await request(app)
                .put(`/api/workflows/${workflowId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ trigger_type: 'not_a_real_trigger' });

            expect(res.status).toBe(400);
            expect(res.body.error.message).toMatch(/trigger_type/);
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

            const outsiderRes = await request(app)
                .post(`/api/workflows/${noStepId}/activate`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(outsiderRes.status).toBe(404);

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
        const sideEffectIds = [];

        beforeAll(async () => {
            // Create workflow with steps
            const wfRes = await request(app)
                .post('/api/workflows')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ ...VALID_WORKFLOW, name: 'Enroll Test', steps: VALID_STEPS });
            wfId = wfRes.body.data.id;
            await request(app)
                .post(`/api/workflows/${wfId}/activate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

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
            if (sideEffectIds.length > 0) {
                await dbHelper.pool.query(
                    'DELETE FROM workflow_side_effect_outbox WHERE id = ANY($1::bigint[])',
                    [sideEffectIds]
                );
            }
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

        it('keeps manual pauses distinct from workflow deactivation', async () => {
            const paused = await request(app)
                .post(`/api/workflows/${wfId}/enrollments/${enrollmentId}/pause`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(paused.status).toBe(200);
            expect(paused.body.data).toMatchObject({
                status: 'paused',
                pause_reason: 'manual',
            });

            const activation = await request(app)
                .post(`/api/workflows/${wfId}/activate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(activation.status).toBe(200);
            expect(activation.body.data.resumed_enrollments).toBe(0);

            const resumed = await request(app)
                .post(`/api/workflows/${wfId}/enrollments/${enrollmentId}/resume`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(resumed.status).toBe(200);
            expect(resumed.body.data).toMatchObject({
                status: 'active',
                pause_reason: null,
            });
        });

        it('pauses active enrollments on deactivation and resumes only that reason', async () => {
            await dbHelper.pool.query(
                `UPDATE workflow_enrollments
                 SET execution_attempt_count = 3,
                     execution_claim_token = '00000000-0000-4000-8000-000000000002',
                     execution_lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
                 WHERE id = $1`,
                [enrollmentId]
            );
            const deactivated = await request(app)
                .post(`/api/workflows/${wfId}/deactivate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(deactivated.status).toBe(200);
            expect(deactivated.body.data.paused_enrollments).toBe(1);

            const paused = await dbHelper.pool.query(
                `SELECT status, pause_reason, execution_claim_token
                 FROM workflow_enrollments WHERE id = $1`,
                [enrollmentId]
            );
            expect(paused.rows[0]).toMatchObject({
                status: 'paused',
                pause_reason: 'workflow_deactivated',
                execution_claim_token: null,
            });

            const manualResume = await request(app)
                .post(`/api/workflows/${wfId}/enrollments/${enrollmentId}/resume`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(manualResume.status).toBe(400);

            const activated = await request(app)
                .post(`/api/workflows/${wfId}/activate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(activated.status).toBe(200);
            expect(activated.body.data.resumed_enrollments).toBe(1);
        });

        it('retries a failed current step only while the workflow is active', async () => {
            await dbHelper.pool.query(
                `UPDATE workflow_enrollments
                 SET status = 'failed',
                     error_message = 'step failed',
                     completed_at = CURRENT_TIMESTAMP,
                     current_step = 2
                 WHERE id = $1`,
                [enrollmentId]
            );
            const retried = await request(app)
                .post(`/api/workflows/${wfId}/enrollments/${enrollmentId}/retry`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(retried.status).toBe(200);
            expect(retried.body.data).toMatchObject({
                status: 'active',
                current_step: 2,
                error_message: null,
            });
        });

        it('requeues a dead letter with retained operator retry history', async () => {
            const steps = await dbHelper.pool.query(
                `SELECT id FROM workflow_steps
                 WHERE workflow_id = $1 ORDER BY step_order`,
                [wfId]
            );
            const enrollment = await dbHelper.pool.query(
                'SELECT enrolled_at FROM workflow_enrollments WHERE id = $1',
                [enrollmentId]
            );
            const inserted = await dbHelper.pool.query(`
                INSERT INTO workflow_side_effect_outbox (
                  idempotency_key, organization_id, enrollment_id, step_id,
                  enrollment_run_at, effect_type, payload, status, attempt_count,
                  lease_expires_at
                ) VALUES
                  ($1, $2, $3, $4, $5, 'email', $6::jsonb, 'dead_letter', 5, NULL),
                  ($7, $2, $3, $8, $5, 'webhook', $9::jsonb, 'processing', 1,
                   CURRENT_TIMESTAMP + INTERVAL '5 minutes')
                RETURNING id, status
            `, [
                `dead-letter-${enrollmentId}`,
                userA.org.id,
                enrollmentId,
                steps.rows[0].id,
                enrollment.rows[0].enrolled_at,
                JSON.stringify({ to: 'dead@example.test', subject: 'Dead' }),
                `processing-${enrollmentId}`,
                steps.rows[2].id,
                JSON.stringify({ url: 'https://example.com/hook' }),
            ]);
            sideEffectIds.push(...inserted.rows.map(row => row.id));
            const deadLetter = inserted.rows.find(row => row.status === 'dead_letter');

            const retried = await request(app)
                .post(`/api/workflows/${wfId}/side-effects/${deadLetter.id}/retry`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(retried.status).toBe(200);
            expect(retried.body.data).toMatchObject({
                status: 'retry',
                attempt_count: 0,
                operator_retry_count: 1,
            });
        });

        it('exposes tenant-scoped execution metrics and a payload-free side-effect queue', async () => {
            await dbHelper.pool.query(`
                UPDATE workflow_side_effect_outbox
                SET created_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes',
                    last_error = CASE
                      WHEN status = 'retry'
                        THEN 'person@example.test Bearer tenant-secret https://example.com/private'
                      ELSE last_error
                    END,
                    provider_id = CASE
                      WHEN status = 'processing' THEN 'provider-correlation-1'
                      ELSE provider_id
                    END
                WHERE id = ANY($1::bigint[])
            `, [sideEffectIds]);

            const summary = await request(app)
                .get(`/api/workflows/${wfId}/execution-summary`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(summary.status).toBe(200);
            expect(summary.body.data.workflow_id).toBe(wfId);
            expect(summary.body.data.side_effects).toMatchObject({
                total: 2,
                by_status: {
                    queued: 0,
                    processing: 1,
                    retry: 1,
                    sent: 0,
                    dead_letter: 0,
                    cancelled: 0,
                },
                by_type: {
                    email: 1,
                    sms: 0,
                    webhook: 1,
                },
                due_count: 1,
                expired_processing_count: 0,
                max_attempt_count: 1,
                total_attempt_count: 1,
                operator_retry_count: 1,
            });
            expect(summary.body.data.side_effects.oldest_pending_age_seconds).toBeGreaterThanOrEqual(590);
            expect(summary.body.data.enrollments).toMatchObject({
                total: 1,
                active: 1,
                paused: 0,
                failed: 0,
                cancelled: 0,
            });

            const queue = await request(app)
                .get(`/api/workflows/${wfId}/side-effects?status=retry&effect_type=email&page=1&limit=10`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(queue.status).toBe(200);
            expect(queue.body.data.pagination).toEqual({
                page: 1,
                limit: 10,
                total: 1,
                totalPages: 1,
            });
            expect(queue.body.data.side_effects).toHaveLength(1);
            expect(queue.body.data.side_effects[0]).toMatchObject({
                effect_type: 'email',
                status: 'retry',
                attempt_count: 0,
                operator_retry_count: 1,
                is_due: true,
                lease_expired: false,
                enrollment_status: 'active',
                contact_id: contactId,
                contact_name: 'Enroll Test',
            });
            expect(queue.body.data.side_effects[0].last_error).toBe(
                '[redacted-email] [redacted-authorization] [redacted-url]'
            );
            expect(queue.body.data.side_effects[0]).not.toHaveProperty('payload');
            expect(queue.body.data.side_effects[0]).not.toHaveProperty('idempotency_key');
            expect(JSON.stringify(queue.body)).not.toContain('tenant-secret');
            expect(JSON.stringify(queue.body)).not.toContain('example.com/private');
            expect(JSON.stringify(queue.body)).not.toContain('dead@example.test');
        });

        it('rejects invalid queue filters and hides execution state from another organization', async () => {
            const invalid = await request(app)
                .get(`/api/workflows/${wfId}/side-effects?status=unknown&limit=500`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(invalid.status).toBe(400);

            const [summary, queue] = await Promise.all([
                request(app)
                    .get(`/api/workflows/${wfId}/execution-summary`)
                    .set('Cookie', [`itemize_auth=${userB.token}`])
                    .set('x-organization-id', String(userB.org.id)),
                request(app)
                    .get(`/api/workflows/${wfId}/side-effects`)
                    .set('Cookie', [`itemize_auth=${userB.token}`])
                    .set('x-organization-id', String(userB.org.id)),
            ]);
            expect(summary.status).toBe(404);
            expect(queue.status).toBe(404);
        });

        it('prevents another organization from cancelling the enrollment', async () => {
            const res = await request(app)
                .delete(`/api/workflows/${wfId}/enrollments/${enrollmentId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);

            const enrollment = await dbHelper.pool.query(
                'SELECT status FROM workflow_enrollments WHERE id = $1',
                [enrollmentId]
            );
            expect(enrollment.rows[0].status).toBe('active');
        });

        it('cancels an enrollment', async () => {
            await dbHelper.pool.query(
                `UPDATE workflow_enrollments
                 SET execution_attempt_count = 2,
                     execution_claim_token = '00000000-0000-4000-8000-000000000001',
                     execution_lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
                 WHERE id = $1`,
                [enrollmentId]
            );
            let releaseDelivery;
            let deliveryStarted;
            const started = new Promise(resolve => { deliveryStarted = resolve; });
            const deliveryGate = new Promise(resolve => { releaseDelivery = resolve; });
            const deliver = jest.fn().mockImplementation(async () => {
                deliveryStarted();
                await deliveryGate;
                return { success: true, id: 'accepted-before-cancellation' };
            });
            const inFlightWorker = runWorkflowSideEffectJobs(dbHelper.pool, {
                batchSize: 1,
                deliver,
            });
            await started;

            const res = await request(app)
                .delete(`/api/workflows/${wfId}/enrollments/${enrollmentId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe('cancelled');
            expect(res.body.data.execution_claim_token).toBeNull();
            expect(res.body.data.execution_lease_expires_at).toBeNull();
            expect(res.body.data.affected_side_effects).toBe(2);

            const cancelled = await dbHelper.pool.query(
                `SELECT id, status, cancelled_at
                 FROM workflow_side_effect_outbox
                 WHERE id = ANY($1::bigint[])
                 ORDER BY id`,
                [sideEffectIds]
            );
            expect(cancelled.rows.every(row => row.status === 'processing')).toBe(true);
            expect(cancelled.rows.every(row => row.cancelled_at)).toBe(true);

            releaseDelivery();
            const inFlightResult = await inFlightWorker;
            expect(inFlightResult).toMatchObject({ claimed: 1, sent: 1 });
            expect(deliver).toHaveBeenCalledTimes(1);

            await dbHelper.pool.query(
                `UPDATE workflow_side_effect_outbox
                 SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
                 WHERE id = ANY($1::bigint[]) AND status = 'processing'`,
                [sideEffectIds]
            );
            const cleanup = await runWorkflowSideEffectJobs(dbHelper.pool, {
                batchSize: 2,
                deliver: jest.fn(),
            });
            expect(cleanup.claimed).toBe(0);
            const terminal = await dbHelper.pool.query(
                `SELECT status FROM workflow_side_effect_outbox
                 WHERE id = ANY($1::bigint[])`,
                [sideEffectIds]
            );
            expect(terminal.rows.map(row => row.status).sort()).toEqual(['cancelled', 'sent']);
        });

        it('serializes simultaneous re-enrollment attempts', async () => {
            const enroll = () => request(app)
                .post(`/api/workflows/${wfId}/enroll`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ contact_id: contactId });

            const responses = await Promise.all([enroll(), enroll()]);
            expect(responses.map(response => response.status).sort()).toEqual([200, 400]);

            const active = await dbHelper.pool.query(
                `SELECT COUNT(*)::int AS count,
                        MIN(execution_attempt_count)::int AS execution_attempt_count,
                        MIN(execution_claim_token::text) AS execution_claim_token
                 FROM workflow_enrollments
                 WHERE workflow_id = $1 AND contact_id = $2 AND status = 'active'`,
                [wfId, contactId]
            );
            expect(active.rows[0].count).toBe(1);
            expect(active.rows[0].execution_attempt_count).toBe(0);
            expect(active.rows[0].execution_claim_token).toBeNull();
        });
    });

    // ── Duplicate ────────────────────────────────────────────────────────────

    describe('SMS reconciliation', () => {
        let workflowId;
        let contactId;
        let enrollmentId;
        let acceptedId;
        let resendId;

        beforeAll(async () => {
            contactId = (await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, phone, created_by)
                 VALUES ($1, 'SMS Reconcile', '+16025550131', $2)
                 RETURNING id`,
                [userA.org.id, userA.user.id]
            )).rows[0].id;
            workflowId = (await dbHelper.pool.query(
                `INSERT INTO workflows (
                   organization_id, name, trigger_type, is_active, created_by
                 ) VALUES ($1, 'SMS Reconciliation Test', 'manual', true, $2)
                 RETURNING id`,
                [userA.org.id, userA.user.id]
            )).rows[0].id;
            const steps = await dbHelper.pool.query(
                `INSERT INTO workflow_steps (
                   workflow_id, step_order, step_type, step_config
                 ) VALUES
                   ($1, 1, 'send_sms', '{"message":"First"}'::jsonb),
                   ($1, 2, 'send_sms', '{"message":"Second"}'::jsonb)
                 RETURNING id, step_order`,
                [workflowId]
            );
            const enrollment = (await dbHelper.pool.query(
                `INSERT INTO workflow_enrollments (
                   workflow_id, contact_id, status, current_step, next_action_at
                 ) VALUES ($1, $2, 'active', 3, NULL)
                 RETURNING id, enrolled_at`,
                [workflowId, contactId]
            )).rows[0];
            enrollmentId = enrollment.id;
            const inserted = await dbHelper.pool.query(
                `INSERT INTO workflow_side_effect_outbox (
                   idempotency_key, organization_id, enrollment_id, step_id,
                   enrollment_run_at, effect_type, payload, status, attempt_count,
                   reconciliation_required_at, reconciliation_reason
                 ) VALUES
                   ($1, $2, $3, $4, $5, 'sms', $6::jsonb,
                    'reconciliation_required', 1, CURRENT_TIMESTAMP,
                    'provider_result_unknown'),
                   ($7, $2, $3, $8, $5, 'sms', $9::jsonb,
                    'reconciliation_required', 1, CURRENT_TIMESTAMP,
                    'provider_result_unknown')
                 RETURNING id`,
                [
                    `sms-accepted-${enrollmentId}`,
                    userA.org.id,
                    enrollmentId,
                    steps.rows.find(row => row.step_order === 1).id,
                    enrollment.enrolled_at,
                    JSON.stringify({
                        contactId,
                        from: '+16025550100',
                        message: 'First',
                        segments: 1,
                        to: '+16025550131',
                    }),
                    `sms-resend-${enrollmentId}`,
                    steps.rows.find(row => row.step_order === 2).id,
                    JSON.stringify({
                        contactId,
                        from: '+16025550100',
                        message: 'Second',
                        segments: 1,
                        to: '+16025550131',
                    }),
                ]
            );
            [acceptedId, resendId] = inserted.rows.map(row => row.id);
        });

        afterAll(async () => {
            await dbHelper.pool.query(
                'DELETE FROM workflow_side_effect_outbox WHERE enrollment_id = $1',
                [enrollmentId]
            );
            await dbHelper.pool.query(
                'DELETE FROM workflow_enrollments WHERE id = $1',
                [enrollmentId]
            );
            await dbHelper.pool.query(
                'DELETE FROM workflow_steps WHERE workflow_id = $1',
                [workflowId]
            );
            await dbHelper.pool.query('DELETE FROM workflows WHERE id = $1', [workflowId]);
            await dbHelper.pool.query('DELETE FROM contacts WHERE id = $1', [contactId]);
        });

        it('requires an explicit accepted SID or authorized resend without leaking payloads', async () => {
            const summary = await request(app)
                .get(`/api/workflows/${workflowId}/execution-summary`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(summary.status).toBe(200);
            expect(summary.body.data.side_effects.by_status.reconciliation_required).toBe(2);

            const queue = await request(app)
                .get(`/api/workflows/${workflowId}/side-effects?status=reconciliation_required`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(queue.status).toBe(200);
            expect(queue.body.data.side_effects).toHaveLength(2);
            expect(queue.body.data.side_effects[0]).not.toHaveProperty('payload');
            expect(queue.body.data.side_effects[0]).toMatchObject({
                effect_type: 'sms',
                status: 'reconciliation_required',
                reconciliation_reason: 'provider_result_unknown',
            });

            const invalid = await request(app)
                .post(`/api/workflows/${workflowId}/side-effects/${acceptedId}/reconcile`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ action: 'accepted', provider_id: 'not-a-twilio-sid' });
            expect(invalid.status).toBe(400);

            const outsider = await request(app)
                .post(`/api/workflows/${workflowId}/side-effects/${acceptedId}/reconcile`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({
                    action: 'accepted',
                    provider_id: 'SM00000000000000000000000000000000',
                });
            expect(outsider.status).toBe(404);

            const accepted = await request(app)
                .post(`/api/workflows/${workflowId}/side-effects/${acceptedId}/reconcile`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    action: 'accepted',
                    provider_id: 'SM00000000000000000000000000000000',
                });
            expect(accepted.status).toBe(200);
            expect(accepted.body.data).toMatchObject({
                status: 'sent',
                provider_id: 'SM00000000000000000000000000000000',
                last_reconciliation_action: 'accepted',
                last_reconciled_by: userA.user.id,
            });

            const resend = await request(app)
                .post(`/api/workflows/${workflowId}/side-effects/${resendId}/reconcile`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ action: 'resend' });
            expect(resend.status).toBe(200);
            expect(resend.body.data).toMatchObject({
                status: 'retry',
                attempt_count: 1,
                operator_retry_count: 1,
                last_reconciliation_action: 'resend',
                last_reconciled_by: userA.user.id,
            });

            const [outbox, logs] = await Promise.all([
                dbHelper.pool.query(
                    `SELECT id, status, provider_id, last_reconciliation_action
                     FROM workflow_side_effect_outbox
                     WHERE id = ANY($1::bigint[])
                     ORDER BY id`,
                    [[acceptedId, resendId]]
                ),
                dbHelper.pool.query(
                    `SELECT workflow_side_effect_id, external_id, metadata
                     FROM sms_logs WHERE workflow_side_effect_id = $1`,
                    [acceptedId]
                ),
            ]);
            expect(outbox.rows.map(row => row.status).sort()).toEqual(['retry', 'sent']);
            expect(logs.rows).toEqual([expect.objectContaining({
                workflow_side_effect_id: acceptedId,
                external_id: 'SM00000000000000000000000000000000',
                metadata: { reconciliation_action: 'accepted' },
            })]);
        });
    });

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
