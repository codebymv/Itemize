const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');
const { runWorkflowJobCycle } = require('../../jobs/workflow-rollout-jobs');
const {
    CANARY_CONFIRMATION,
    runWorkflowCanary,
    workflowRolloutDatabaseIdentity,
} = require('../../services/workflowRolloutOperations');

/**
 * Build a minimal Express app wired to the provided pool.
 */
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

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Contacts Integration Tests', () => {
    let dbHelper;
    let app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`contact-a-${Date.now()}@test.itemize`, 'Contact User A'),
            dbHelper.seedUser(`contact-b-${Date.now()}@test.itemize`, 'Contact User B'),
        ]);
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    describe('CRUD & multi-tenant isolation', () => {
        let contactIdA;

        it('allows User A to create a contact in Org A', async () => {
            const res = await request(app)
                .post('/api/contacts')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ first_name: 'John', last_name: 'Doe', email: 'johndoe@example.com', company: 'Acme' });

            expect(res.status).toBe(201);
            expect(res.body.first_name).toBe('John');
            expect(res.body.organization_id).toBe(userA.org.id);
            contactIdA = res.body.id;
        });

        it('allows User A to list contacts in Org A', async () => {
            const res = await request(app)
                .get('/api/contacts')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.pagination).toEqual(expect.objectContaining({
                page: 1,
                limit: 50,
            }));
            const contact = res.body.contacts.find(c => c.first_name === 'John');
            expect(contact).toBeTruthy();
        });

        it('prevents User B from reading Org A contact by ID', async () => {
            const res = await request(app)
                .get(`/api/contacts/${contactIdA}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect([403, 404]).toContain(res.status);
        });

        it('prevents User B from updating Org A contact', async () => {
            const res = await request(app)
                .put(`/api/contacts/${contactIdA}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ first_name: 'Hacked' });

            expect([403, 404]).toContain(res.status);
        });

        it('prevents User B from deleting Org A contact', async () => {
            const res = await request(app)
                .delete(`/api/contacts/${contactIdA}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect([403, 404]).toContain(res.status);
        });

        it('queues contact_updated only for a committed field change', async () => {
            const changed = await request(app)
                .put(`/api/contacts/${contactIdA}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ company: 'Updated Acme' });
            expect(changed.status).toBe(200);

            const unchanged = await request(app)
                .put(`/api/contacts/${contactIdA}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ company: 'Updated Acme' });
            expect(unchanged.status).toBe(200);

            const events = await dbHelper.pool.query(`
                SELECT payload
                FROM workflow_triggers
                WHERE organization_id = $1
                  AND contact_id = $2
                  AND trigger_type = 'contact_updated'
            `, [userA.org.id, contactIdA]);
            expect(events.rows).toHaveLength(1);
            expect(events.rows[0].payload.changed_fields).toContain('company');
        });

        it('requires authentication for the aggregate contact profile', async () => {
            const res = await request(app)
                .get(`/api/contacts/${contactIdA}/profile`)
                .set('organization_id', String(userA.org.id));

            expect(res.status).toBe(401);
        });

        it('returns the aggregate profile only through the verified organization context', async () => {
            const own = await request(app)
                .get(`/api/contacts/${contactIdA}/profile`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(own.status).toBe(200);
            expect(own.body.contact).toEqual(expect.objectContaining({
                id: String(contactIdA),
                email: 'johndoe@example.com',
            }));

            const otherTenant = await request(app)
                .get(`/api/contacts/${contactIdA}/profile`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .set('organization_id', String(userA.org.id));

            expect(otherTenant.status).toBe(404);
        });

        it('rejects individual and bulk assignment to a user outside the organization', async () => {
            const individual = await request(app)
                .put(`/api/contacts/${contactIdA}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ assigned_to: userB.user.id });

            expect(individual.status).toBe(400);

            const bulk = await request(app)
                .post('/api/contacts/bulk-update')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    contact_ids: [contactIdA],
                    updates: { assigned_to: userB.user.id },
                });

            expect(bulk.status).toBe(400);

            const persisted = await dbHelper.pool.query(
                'SELECT assigned_to FROM contacts WHERE id = $1',
                [contactIdA]
            );
            expect(persisted.rows[0].assigned_to).toBeNull();
        });

        it('adds and removes bulk tags without duplicates', async () => {
            const updateTags = (tags_mode, tags) => request(app)
                .post('/api/contacts/bulk-update')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    contact_ids: [contactIdA],
                    updates: { tags, tags_mode },
                });

            expect((await updateTags('add', ['vip', 'vip'])).status).toBe(200);
            expect((await updateTags('add', ['vip'])).status).toBe(200);

            let persisted = await dbHelper.pool.query('SELECT tags FROM contacts WHERE id = $1', [contactIdA]);
            expect(persisted.rows[0].tags.filter(tag => tag === 'vip')).toHaveLength(1);

            expect((await updateTags('remove', ['vip'])).status).toBe(200);
            persisted = await dbHelper.pool.query('SELECT tags FROM contacts WHERE id = $1', [contactIdA]);
            expect(persisted.rows[0].tags).not.toContain('vip');

            const tagEvents = await dbHelper.pool.query(`
                SELECT trigger_type, payload
                FROM workflow_triggers
                WHERE organization_id = $1
                  AND contact_id = $2
                  AND trigger_type IN ('tag_added', 'tag_removed')
                ORDER BY id
            `, [userA.org.id, contactIdA]);
            expect(tagEvents.rows).toEqual([
                expect.objectContaining({
                    trigger_type: 'tag_added',
                    payload: expect.objectContaining({ tag: 'vip' }),
                }),
                expect.objectContaining({
                    trigger_type: 'tag_removed',
                    payload: expect.objectContaining({ tag: 'vip' }),
                }),
            ]);
        });

        it('allows User A to delete their own contact', async () => {
            const res = await request(app)
                .delete(`/api/contacts/${contactIdA}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('Workflow rollout cycle', () => {
        it('runs a committed contact event through all enabled workers exactly once', async () => {
            const rolloutUser = await dbHelper.seedUser(
                `workflow-rollout-${Date.now()}@test.itemize`,
                'Workflow Rollout User'
            );
            const source = 'api';
            const template = (await dbHelper.pool.query(`
                INSERT INTO email_templates (
                    organization_id, name, subject, body_html, created_by
                ) VALUES ($1, 'Rollout template', 'Welcome {{first_name}}', '<p>Ready</p>', $2)
                RETURNING id
            `, [rolloutUser.org.id, rolloutUser.user.id])).rows[0];
            const workflow = (await dbHelper.pool.query(`
                INSERT INTO workflows (
                    organization_id, name, trigger_type, trigger_config, is_active, created_by
                ) VALUES ($1, 'Rollout workflow', 'contact_added', $2::jsonb, true, $3)
                RETURNING id
            `, [
                rolloutUser.org.id,
                JSON.stringify({ source }),
                rolloutUser.user.id,
            ])).rows[0];
            await dbHelper.pool.query(`
                INSERT INTO workflow_steps (workflow_id, step_order, step_type, step_config)
                VALUES ($1, 1, 'send_email', $2::jsonb)
            `, [workflow.id, JSON.stringify({ template_id: template.id })]);

            const created = await request(app)
                .post('/api/contacts')
                .set('Cookie', [`itemize_auth=${rolloutUser.token}`])
                .set('x-organization-id', String(rolloutUser.org.id))
                .send({
                    first_name: 'Rollout',
                    email: `rollout-contact-${Date.now()}@example.test`,
                    source,
                });
            expect(created.status).toBe(201);

            const sendEmail = jest.fn(async () => ({
                success: true,
                id: `rollout-provider-${Date.now()}`,
            }));
            const options = {
                environment: {
                    WORKFLOW_ENROLLMENT_JOBS_ENABLED: 'true',
                    WORKFLOW_SIDE_EFFECT_JOBS_ENABLED: 'true',
                    WORKFLOW_TRIGGER_JOBS_ENABLED: 'true',
                },
                enrollmentOptions: { batchSize: 10 },
                sideEffectOptions: {
                    batchSize: 10,
                    emailService: { sendEmail },
                },
                triggerOptions: { batchSize: 10 },
            };
            const firstCycle = await runWorkflowJobCycle(dbHelper.pool, options);

            expect(firstCycle.flags).toEqual({
                enrollment: true,
                sideEffect: true,
                trigger: true,
            });
            expect(firstCycle.trigger).toEqual(expect.objectContaining({ enrolled: 1 }));
            expect(firstCycle.trigger.completed).toBeGreaterThanOrEqual(1);
            expect(firstCycle.enrollment).toMatchObject({ claimed: 1, completed: 1 });
            expect(firstCycle.sideEffect).toMatchObject({ claimed: 1, sent: 1 });
            expect(sendEmail).toHaveBeenCalledTimes(1);

            const persisted = await dbHelper.pool.query(`
                SELECT
                    workflow_trigger.status AS trigger_status,
                    enrollment.status AS enrollment_status,
                    outbox.status AS outbox_status,
                    outbox.attempt_count,
                    email_log.external_id
                FROM workflow_triggers workflow_trigger
                JOIN workflow_enrollments enrollment
                  ON enrollment.workflow_id = $1
                 AND enrollment.contact_id = workflow_trigger.contact_id
                JOIN workflow_side_effect_outbox outbox
                  ON outbox.enrollment_id = enrollment.id
                JOIN email_logs email_log
                  ON email_log.workflow_side_effect_id = outbox.id
                WHERE workflow_trigger.organization_id = $2
                  AND workflow_trigger.contact_id = $3
                  AND workflow_trigger.trigger_type = 'contact_added'
            `, [workflow.id, rolloutUser.org.id, created.body.id]);
            expect(persisted.rows).toEqual([
                expect.objectContaining({
                    trigger_status: 'completed',
                    enrollment_status: 'completed',
                    outbox_status: 'sent',
                    attempt_count: 1,
                    external_id: expect.stringMatching(/^rollout-provider-/),
                }),
            ]);

            const secondCycle = await runWorkflowJobCycle(dbHelper.pool, options);
            expect(secondCycle.trigger).toMatchObject({ claimed: 0, enrolled: 0 });
            expect(secondCycle.enrollment).toMatchObject({ claimed: 0, completed: 0 });
            expect(secondCycle.sideEffect).toMatchObject({ claimed: 0, sent: 0 });
            expect(sendEmail).toHaveBeenCalledTimes(1);
        });

        it('runs the staging canary against only its own workflow rows', async () => {
            const canaryUser = await dbHelper.seedUser(
                `workflow-canary-${Date.now()}@test.itemize`,
                'Workflow Canary User'
            );
            const sendEmail = jest.fn(async () => ({
                success: true,
                id: `canary-provider-${Date.now()}`,
            }));
            const databaseUrl = process.env.TEST_DATABASE_URL;
            const databaseFingerprint = workflowRolloutDatabaseIdentity({
                DATABASE_URL: databaseUrl,
            }).fingerprint;
            const result = await runWorkflowCanary(dbHelper.pool, {
                emailService: { sendEmail },
                environment: {
                    EMAIL_FROM: 'canary@example.test',
                    DATABASE_URL: databaseUrl,
                    RESEND_API_KEY: 're_test_canary',
                    WORKFLOW_CANARY_CONFIRM: CANARY_CONFIRMATION,
                    WORKFLOW_CANARY_CREATED_BY_USER_ID: String(canaryUser.user.id),
                    WORKFLOW_CANARY_EMAIL: 'canary-recipient@example.test',
                    WORKFLOW_CANARY_ORGANIZATION_ID: String(canaryUser.org.id),
                    WORKFLOW_CANARY_PROVIDER_MODE: 'sandbox',
                    WORKFLOW_ENROLLMENT_JOBS_ENABLED: 'true',
                    WORKFLOW_ROLLOUT_ENVIRONMENT: 'staging',
                    WORKFLOW_ROLLOUT_DATABASE_FINGERPRINT: databaseFingerprint,
                    WORKFLOW_ROLLOUT_MAX_DEAD_LETTERS: '100000',
                    WORKFLOW_ROLLOUT_MAX_PENDING_AGE_SECONDS: '86400',
                    WORKFLOW_ROLLOUT_MAX_RECONCILIATION_REQUIRED: '100000',
                    WORKFLOW_SIDE_EFFECT_JOBS_ENABLED: 'true',
                    WORKFLOW_TRIGGER_JOBS_ENABLED: 'true',
                },
            });

            expect(result).toMatchObject({
                success: true,
                state: {
                    trigger_status: 'completed',
                    enrollment_status: 'completed',
                    outbox_status: 'sent',
                    attempt_count: 1,
                },
                summaries: {
                    trigger: { claimed: 1, completed: 1, enrolled: 1 },
                    enrollment: { claimed: 1, completed: 1 },
                    sideEffect: { claimed: 1, sent: 1 },
                },
            });
            expect(sendEmail).toHaveBeenCalledTimes(1);

            const retired = await dbHelper.pool.query(`
                SELECT workflow.is_active, contact.status
                FROM workflows workflow
                JOIN contacts contact ON contact.id = $2
                WHERE workflow.id = $1
            `, [result.ids.workflowId, result.ids.contactId]);
            expect(retired.rows[0]).toEqual({
                is_active: false,
                status: 'inactive',
            });
        });
    });

    describe('Contact transfer boundaries', () => {
        it('exports only the active organization and neutralizes spreadsheet formulas', async () => {
            await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, email, created_by)
                 VALUES ($1, '=1+1', 'formula@test.itemize', $2),
                        ($3, '@foreign', 'foreign@test.itemize', $4)`,
                [userA.org.id, userA.user.id, userB.org.id, userB.user.id]
            );

            const response = await request(app)
                .get('/api/contacts/export/csv')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(response.status).toBe(200);
            expect(response.headers).toMatchObject({
                'cache-control': 'private, no-store',
                'content-type': 'text/csv; charset=utf-8',
                'x-content-type-options': 'nosniff',
            });
            expect(response.text).toContain("'=1+1");
            expect(response.text).not.toContain('foreign@test.itemize');
        });

        it('rejects oversized parsed imports before opening a transaction', async () => {
            const response = await request(app)
                .post('/api/contacts/import/csv')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ contacts: Array(10001).fill({}), skipDuplicates: true });

            expect(response.status).toBe(400);
            expect(response.body).toMatchObject({ code: 'INVALID_IMPORT' });
        });
    });

    describe('Subscription plan gating', () => {
        it('enforces contact limit per org plan', async () => {
            const limitUser = await dbHelper.seedUser(
                `contact-limit-${Date.now()}@test.itemize`, 'Limit User'
            );

            // Cap the org at 1 contact
            await dbHelper.pool.query(
                'UPDATE organizations SET contacts_limit = 1 WHERE id = $1',
                [limitUser.org.id]
            );

            const r1 = await request(app)
                .post('/api/contacts')
                .set('Cookie', [`itemize_auth=${limitUser.token}`])
                .set('x-organization-id', String(limitUser.org.id))
                .send({ first_name: 'First', email: `first-${Date.now()}@example.com` });
            expect(r1.status).toBe(201);

            const r2 = await request(app)
                .post('/api/contacts')
                .set('Cookie', [`itemize_auth=${limitUser.token}`])
                .set('x-organization-id', String(limitUser.org.id))
                .send({ first_name: 'Second', email: `second-${Date.now()}@example.com` });
            expect(r2.status).toBe(403);
            expect(JSON.stringify(r2.body)).toMatch(/limit/i);
        });

        it('serializes concurrent creates at the contact limit', async () => {
            const limitUser = await dbHelper.seedUser(
                `contact-race-${Date.now()}@test.itemize`, 'Contact Race User'
            );

            await dbHelper.pool.query(
                'UPDATE organizations SET contacts_limit = 1 WHERE id = $1',
                [limitUser.org.id]
            );

            const create = suffix => request(app)
                .post('/api/contacts')
                .set('Cookie', [`itemize_auth=${limitUser.token}`])
                .set('x-organization-id', String(limitUser.org.id))
                .send({ first_name: suffix, email: `${suffix}-${Date.now()}@example.com` });

            const responses = await Promise.all([create('race-a'), create('race-b')]);
            expect(responses.map(response => response.status).sort()).toEqual([201, 403]);

            const count = await dbHelper.pool.query(
                'SELECT COUNT(*)::int AS count FROM contacts WHERE organization_id = $1',
                [limitUser.org.id]
            );
            expect(count.rows[0].count).toBe(1);
        });
    });
});
