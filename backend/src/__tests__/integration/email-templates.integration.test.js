const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');
const emailService = require('../../services/emailService');

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

/** Minimal valid template payload */
function templatePayload(overrides = {}) {
    return {
        name: 'Welcome Email',
        subject: 'Welcome, {{first_name}}!',
        body_html: '<p>Hi {{first_name}}, thanks for joining.</p>',
        body_text: 'Hi {{first_name}}, thanks for joining.',
        category: 'onboarding',
        ...overrides,
    };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Email Templates Integration Tests', () => {
    let dbHelper, app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`et-a-${Date.now()}@test.itemize`, 'Email Template User A'),
            dbHelper.seedUser(`et-b-${Date.now()}@test.itemize`, 'Email Template User B'),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper.teardown(); }, 30000);

    // ── CRUD ─────────────────────────────────────────────────────────────────

    describe('Template CRUD', () => {
        let templateId;

        it('creates an email template', async () => {
            const res = await request(app)
                .post('/api/email-templates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(templatePayload());

            expect(res.status).toBe(201);
            const t = res.body;
            expect(t.name).toBe('Welcome Email');
            expect(t.subject).toBe('Welcome, {{first_name}}!');
            expect(t.category).toBe('onboarding');
            expect(t.organization_id).toBe(userA.org.id);
            // Variables should be auto-extracted from subject + body
            expect(Array.isArray(t.variables)).toBe(true);
            expect(t.variables).toContain('first_name');
            templateId = t.id;
        });

        it('rejects creation without name', async () => {
            const res = await request(app)
                .post('/api/email-templates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(templatePayload({ name: undefined }));

            expect(res.status).toBe(400);
        });

        it('rejects creation without subject', async () => {
            const res = await request(app)
                .post('/api/email-templates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(templatePayload({ subject: undefined }));

            expect(res.status).toBe(400);
        });

        it('rejects creation without body_html', async () => {
            const res = await request(app)
                .post('/api/email-templates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(templatePayload({ body_html: undefined }));

            expect(res.status).toBe(400);
        });

        it('lists templates scoped to User A org', async () => {
            const res = await request(app)
                .get('/api/email-templates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.templates)).toBe(true);
            expect(res.body.templates.some(t => t.id === templateId)).toBe(true);
        });

        it('User B org cannot see User A templates', async () => {
            const res = await request(app)
                .get('/api/email-templates')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            expect(res.body.templates.every(t => t.organization_id === userB.org.id)).toBe(true);
            expect(res.body.templates.some(t => t.id === templateId)).toBe(false);
        });

        it('fetches a single template by ID', async () => {
            const res = await request(app)
                .get(`/api/email-templates/${templateId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(templateId);
            expect(res.body.name).toBe('Welcome Email');
        });

        it('User B cannot fetch User A template', async () => {
            const res = await request(app)
                .get(`/api/email-templates/${templateId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });

        it('updates a template and re-extracts variables', async () => {
            const res = await request(app)
                .put(`/api/email-templates/${templateId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Updated Welcome',
                    subject: 'Hello {{first_name}} {{last_name}}',
                    body_html: '<p>Dear {{first_name}}, your company is {{company}}.</p>',
                });

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('Updated Welcome');
            // Variables should be re-extracted: first_name, last_name, company
            expect(res.body.variables).toContain('first_name');
            expect(res.body.variables).toContain('last_name');
            expect(res.body.variables).toContain('company');
        });

        it('User B cannot update User A template', async () => {
            const res = await request(app)
                .put(`/api/email-templates/${templateId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ name: 'Hacked' });

            expect(res.status).toBe(404);
        });

        it('deletes a template', async () => {
            const res = await request(app)
                .delete(`/api/email-templates/${templateId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.deleted_id).toBe(templateId);
        });

        it('returns 404 on second delete attempt', async () => {
            const res = await request(app)
                .delete(`/api/email-templates/${templateId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(404);
        });
    });

    // ── Filtering ─────────────────────────────────────────────────────────────

    describe('List filtering', () => {
        let t1Id, t2Id;

        beforeAll(async () => {
            const [r1, r2] = await Promise.all([
                request(app)
                    .post('/api/email-templates')
                    .set('Cookie', [`itemize_auth=${userA.token}`])
                    .set('x-organization-id', String(userA.org.id))
                    .send(templatePayload({ name: 'Filter A', category: 'onboarding', is_active: true })),
                request(app)
                    .post('/api/email-templates')
                    .set('Cookie', [`itemize_auth=${userA.token}`])
                    .set('x-organization-id', String(userA.org.id))
                    .send(templatePayload({ name: 'Filter B', category: 'marketing', is_active: false })),
            ]);
            t1Id = r1.body.id;
            t2Id = r2.body.id;
        });

        afterAll(async () => {
            await dbHelper.pool.query(
                'DELETE FROM email_templates WHERE id = ANY($1::int[])',
                [[t1Id, t2Id].filter(Boolean)]
            );
        });

        it('filters by category', async () => {
            const res = await request(app)
                .get('/api/email-templates?category=marketing')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.templates.every(t => t.category === 'marketing')).toBe(true);
            expect(res.body.templates.some(t => t.id === t2Id)).toBe(true);
        });

        it('filters by is_active=true', async () => {
            const res = await request(app)
                .get('/api/email-templates?is_active=true')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.templates.every(t => t.is_active === true)).toBe(true);
        });

        it('filters by is_active=false', async () => {
            const res = await request(app)
                .get('/api/email-templates?is_active=false')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.templates.every(t => t.is_active === false)).toBe(true);
        });

        it('filters by name search', async () => {
            const res = await request(app)
                .get('/api/email-templates?search=Filter+A')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.templates.some(t => t.id === t1Id)).toBe(true);
            expect(res.body.templates.every(t => t.id !== t2Id)).toBe(true);
        });
    });

    // ── Categories list ───────────────────────────────────────────────────────

    describe('GET /categories/list', () => {
        it('returns distinct categories with counts', async () => {
            // Seed two templates with different categories
            await Promise.all([
                dbHelper.pool.query(
                    `INSERT INTO email_templates (organization_id, name, subject, body_html, category, created_by)
                     VALUES ($1, 'Cat Test 1', 'Subj', '<p>hi</p>', 'newsletters', $2)`,
                    [userA.org.id, userA.user.id]
                ),
                dbHelper.pool.query(
                    `INSERT INTO email_templates (organization_id, name, subject, body_html, category, created_by)
                     VALUES ($1, 'Cat Test 2', 'Subj', '<p>hi</p>', 'newsletters', $2)`,
                    [userA.org.id, userA.user.id]
                ),
            ]);

            const res = await request(app)
                .get('/api/email-templates/categories/list')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.categories)).toBe(true);
            const newsletters = res.body.categories.find(c => c.category === 'newsletters');
            expect(newsletters).toBeTruthy();
            expect(parseInt(newsletters.count)).toBeGreaterThanOrEqual(2);

            // Cleanup
            await dbHelper.pool.query(
                "DELETE FROM email_templates WHERE organization_id = $1 AND name LIKE 'Cat Test%'",
                [userA.org.id]
            );
        });
    });

    // ── Duplicate ────────────────────────────────────────────────────────────

    describe('Duplicate template', () => {
        let sourceId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/email-templates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(templatePayload({ name: 'Dup Source', is_active: true }));
            sourceId = res.body.id;
        });

        afterAll(async () => {
            await dbHelper.pool.query(
                "DELETE FROM email_templates WHERE organization_id = $1 AND name LIKE '%Dup Source%'",
                [userA.org.id]
            );
        });

        it('creates a copy of a template as inactive', async () => {
            const res = await request(app)
                .post(`/api/email-templates/${sourceId}/duplicate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(201);
            const copy = res.body;
            expect(copy.name).toBe('Dup Source (Copy)');
            // Duplicates should always start inactive
            expect(copy.is_active).toBe(false);
            expect(copy.id).not.toBe(sourceId);
        });

        it('User B cannot duplicate User A template', async () => {
            const res = await request(app)
                .post(`/api/email-templates/${sourceId}/duplicate`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });
    });

    // ── Variable extraction ───────────────────────────────────────────────────

    describe('Variable auto-extraction', () => {
        it('extracts unique variables from subject and body', async () => {
            const res = await request(app)
                .post('/api/email-templates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Var Extract Test',
                    subject: 'Hello {{first_name}}',
                    body_html: '<p>{{first_name}} from {{company}}. Check {{link}}.</p>',
                    body_text: 'Hi {{first_name}}',
                });

            expect(res.status).toBe(201);
            const vars = res.body.variables;
            // first_name appears in all three — should be deduplicated
            expect(vars.filter(v => v === 'first_name')).toHaveLength(1);
            expect(vars).toContain('company');
            expect(vars).toContain('link');

            // Cleanup
            await request(app)
                .delete(`/api/email-templates/${res.body.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
        });
    });

    // ── Auth guard ───────────────────────────────────────────────────────────

    describe('Contact delivery', () => {
        afterEach(() => jest.restoreAllMocks());

        it('writes a provider log and activity after a successful send', async () => {
            const contact = (await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, email, created_by)
                 VALUES ($1, 'Katherine', 'katherine@example.test', $2) RETURNING id`,
                [userA.org.id, userA.user.id]
            )).rows[0];
            jest.spyOn(emailService, 'sendEmail').mockResolvedValue({
                success: true,
                id: `email-${Date.now()}`,
            });

            const res = await request(app)
                .post('/api/email-templates/send-to-contact')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    contact_id: contact.id,
                    subject: 'Hello {{first_name}}',
                    body_html: '<p>Welcome {{first_name}}</p>',
                });

            expect(res.status).toBe(200);
            const [logs, activities] = await Promise.all([
                dbHelper.pool.query('SELECT * FROM email_logs WHERE contact_id = $1', [contact.id]),
                dbHelper.pool.query('SELECT * FROM contact_activities WHERE contact_id = $1 AND type = $2', [contact.id, 'email']),
            ]);
            expect(logs.rows).toHaveLength(1);
            expect(logs.rows[0].sent_by).toBe(userA.user.id);
            expect(activities.rows).toHaveLength(1);
        });

        it('does not report an unavailable provider as a successful send', async () => {
            const contact = (await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, email, created_by)
                 VALUES ($1, 'Dorothy', 'dorothy@example.test', $2) RETURNING id`,
                [userA.org.id, userA.user.id]
            )).rows[0];
            jest.spyOn(emailService, 'sendEmail').mockResolvedValue({
                success: false,
                simulated: true,
                error: 'Email service not configured',
            });

            const res = await request(app)
                .post('/api/email-templates/send-to-contact')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ contact_id: contact.id, subject: 'Hello', body_html: '<p>Hello</p>' });

            expect(res.status).toBe(503);
            expect(res.body).toMatchObject({
                success: false,
                code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
            });
        });
    });

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated list request', async () => {
            const res = await request(app).get('/api/email-templates');
            expect(res.status).toBe(401);
        });
    });
});
