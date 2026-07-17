const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');
const { runPublicFormContractMigration } = require('../../db_public_form_contract_migrations');
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

const SAMPLE_FIELDS = [
    { field_type: 'text', label: 'Full Name', is_required: true, map_to_contact_field: 'first_name' },
    { field_type: 'email', label: 'Email Address', is_required: true, map_to_contact_field: 'email' },
    { field_type: 'phone', label: 'Phone', is_required: false },
];

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Forms Integration Tests', () => {
    let dbHelper, app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`form-a-${Date.now()}@test.itemize`, 'Form User A'),
            dbHelper.seedUser(`form-b-${Date.now()}@test.itemize`, 'Form User B'),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper.teardown(); }, 30000);

    // ── CRUD ─────────────────────────────────────────────────────────────────

    describe('Form CRUD', () => {
        let formId;

        it('creates a form with custom fields', async () => {
            const res = await request(app)
                .post('/api/forms')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Contact Form',
                    description: 'Lead capture form',
                    fields: SAMPLE_FIELDS,
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            const form = res.body.data;
            expect(form.name).toBe('Contact Form');
            expect(form.organization_id).toBe(userA.org.id);
            expect(typeof form.slug).toBe('string');
            expect(form.slug.length).toBeGreaterThan(0);
            expect(form.public_id).toMatch(/^frm_[a-f0-9]{32}$/);
            // Fields should be included in the response
            expect(Array.isArray(form.fields)).toBe(true);
            expect(form.fields).toHaveLength(3);
            formId = form.id;
        });

        it('creates a form with default fields when none provided', async () => {
            const res = await request(app)
                .post('/api/forms')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Default Fields Form' });

            expect(res.status).toBe(201);
            const form = res.body.data;
            // Should get default Name + Email fields
            expect(form.fields.length).toBeGreaterThanOrEqual(2);

            // Cleanup
            await request(app)
                .delete(`/api/forms/${form.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
        });

        it('rejects form creation without a name', async () => {
            const res = await request(app)
                .post('/api/forms')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ description: 'No name here' });

            expect(res.status).toBe(400);
        });

        it('lists forms for User A org', async () => {
            const res = await request(app)
                .get('/api/forms')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data.forms)).toBe(true);
            expect(res.body.data.forms.some(f => f.id === formId)).toBe(true);
        });

        it('User B org cannot see User A forms', async () => {
            const res = await request(app)
                .get('/api/forms')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.forms.every(f => f.organization_id === userB.org.id)).toBe(true);
            expect(res.body.data.forms.some(f => f.id === formId)).toBe(false);
        });

        it('fetches a single form with its fields', async () => {
            const res = await request(app)
                .get(`/api/forms/${formId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            const form = res.body.data;
            expect(form.id).toBe(formId);
            expect(Array.isArray(form.fields)).toBe(true);
            expect(form.fields).toHaveLength(3);
            // Fields should be in order
            expect(form.fields[0].label).toBe('Full Name');
            expect(form.fields[1].label).toBe('Email Address');
        });

        it('User B cannot fetch User A form', async () => {
            const res = await request(app)
                .get(`/api/forms/${formId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });

        it('updates form metadata', async () => {
            const res = await request(app)
                .put(`/api/forms/${formId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Updated Contact Form',
                    submit_button_text: 'Send It',
                    status: 'published',  // valid: draft | published | archived
                });

            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe('Updated Contact Form');
            expect(res.body.data.submit_button_text).toBe('Send It');
            expect(res.body.data.status).toBe('published');
        });

        it('User B cannot update User A form', async () => {
            const res = await request(app)
                .put(`/api/forms/${formId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ name: 'Hacked' });

            expect(res.status).toBe(404);
        });

        it('deletes a form', async () => {
            const res = await request(app)
                .delete(`/api/forms/${formId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
        });

        it('returns 404 on second delete attempt', async () => {
            const res = await request(app)
                .delete(`/api/forms/${formId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(404);
        });
    });

    // ── Field management ─────────────────────────────────────────────────────

    describe('Form field management', () => {
        let formId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/forms')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Fields Test Form', fields: SAMPLE_FIELDS });
            formId = res.body.data.id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM form_fields WHERE form_id = $1', [formId]);
            await dbHelper.pool.query('DELETE FROM forms WHERE id = $1', [formId]);
        });

        it('replaces all form fields via PUT /fields', async () => {
            const newFields = [
                { field_type: 'text', label: 'Company', is_required: false },
                { field_type: 'textarea', label: 'Message', is_required: true },
            ];

            const res = await request(app)
                .put(`/api/forms/${formId}/fields`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ fields: newFields });

            expect(res.status).toBe(200);
            expect(res.body.data.fields).toHaveLength(2);
            expect(res.body.data.fields[0].label).toBe('Company');
            expect(res.body.data.fields[1].label).toBe('Message');
        });

        it('remaps condition field IDs when fields are replaced or duplicated', async () => {
            const current = await request(app)
                .get(`/api/forms/${formId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            const [company, message] = current.body.data.fields;

            const replaced = await request(app)
                .put(`/api/forms/${formId}/fields`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    fields: [
                        { ...company, conditions: [] },
                        {
                            ...message,
                            conditions: [{
                                field_id: company.id,
                                operator: 'is_not_empty',
                                action: 'show',
                            }],
                        },
                    ],
                });
            expect(replaced.status).toBe(200);
            const [newCompany, newMessage] = replaced.body.data.fields;
            expect(newCompany.id).not.toBe(company.id);
            expect(newMessage.conditions[0].field_id).toBe(newCompany.id);

            const duplicated = await request(app)
                .post(`/api/forms/${formId}/duplicate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(duplicated.status).toBe(201);
            const [copyCompany, copyMessage] = duplicated.body.data.fields;
            expect(copyCompany.id).not.toBe(newCompany.id);
            expect(copyMessage.conditions[0].field_id).toBe(copyCompany.id);

            await dbHelper.pool.query('DELETE FROM forms WHERE id = $1', [duplicated.body.data.id]);
        });

        it('rejects fields update when fields is not an array', async () => {
            const res = await request(app)
                .put(`/api/forms/${formId}/fields`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ fields: 'not-an-array' });

            expect(res.status).toBe(400);
        });

        it('User B cannot update fields of User A form', async () => {
            const res = await request(app)
                .put(`/api/forms/${formId}/fields`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ fields: [] });

            expect(res.status).toBe(404);
        });
    });

    // ── Duplicate ────────────────────────────────────────────────────────────

    describe('Form duplicate', () => {
        let sourceId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/forms')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Source Form', fields: SAMPLE_FIELDS });
            sourceId = res.body.data.id;
        });

        afterAll(async () => {
            // Clean up source + any copies
            const forms = await dbHelper.pool.query(
                "SELECT id FROM forms WHERE organization_id = $1 AND name LIKE '%Source Form%'",
                [userA.org.id]
            );
            for (const { id } of forms.rows) {
                await dbHelper.pool.query('DELETE FROM form_fields WHERE form_id = $1', [id]);
                await dbHelper.pool.query('DELETE FROM forms WHERE id = $1', [id]);
            }
        });

        it('duplicates a form with all its fields', async () => {
            const res = await request(app)
                .post(`/api/forms/${sourceId}/duplicate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(201);
            const copy = res.body.data;
            expect(copy.name).toBe('Source Form (Copy)');
            expect(copy.status).toBe('draft');
            expect(copy.id).not.toBe(sourceId);
            expect(copy.fields).toHaveLength(SAMPLE_FIELDS.length);
            expect(copy.field_count).toBe(SAMPLE_FIELDS.length);
            expect(copy.submission_count).toBe(0);
        });

        it('User B cannot duplicate User A form', async () => {
            const res = await request(app)
                .post(`/api/forms/${sourceId}/duplicate`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });
    });

    // ── Submissions ──────────────────────────────────────────────────────────

    describe('Form submissions', () => {
        let formId;
        let submissionId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/forms')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Submissions Test Form' });
            formId = res.body.data.id;

            // Manually insert a submission so we have something to read/delete
            const subRes = await dbHelper.pool.query(
                `INSERT INTO form_submissions (form_id, organization_id, data)
                 VALUES ($1, $2, $3) RETURNING id`,
                [formId, userA.org.id, JSON.stringify({ name: 'Test User', email: 'test@example.com' })]
            );
            submissionId = subRes.rows[0].id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM form_submissions WHERE form_id = $1', [formId]);
            await dbHelper.pool.query('DELETE FROM form_fields WHERE form_id = $1', [formId]);
            await dbHelper.pool.query('DELETE FROM forms WHERE id = $1', [formId]);
        });

        it('lists form submissions', async () => {
            const res = await request(app)
                .get(`/api/forms/${formId}/submissions`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data.submissions)).toBe(true);
            expect(res.body.data.submissions.some(s => s.id === submissionId)).toBe(true);
        });

        it('User B cannot list User A form submissions', async () => {
            const res = await request(app)
                .get(`/api/forms/${formId}/submissions`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });

        it('deletes a submission', async () => {
            const res = await request(app)
                .delete(`/api/forms/${formId}/submissions/${submissionId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
        });

        it('returns 404 on second submission delete', async () => {
            const res = await request(app)
                .delete(`/api/forms/${formId}/submissions/${submissionId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(404);
        });
    });

    describe('Public form submission transaction', () => {
        let form;
        const email = `public-race-${Date.now()}@example.com`;

        beforeAll(async () => {
            const create = await request(app)
                .post('/api/forms')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Public Concurrent Form' });
            form = create.body.data;

            await request(app)
                .put(`/api/forms/${form.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ status: 'published' });
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM contacts WHERE organization_id = $1 AND LOWER(email) = LOWER($2)', [userA.org.id, email]);
            await dbHelper.pool.query('DELETE FROM forms WHERE id = $1', [form.id]);
        });

        it('serializes same-email contact creation while preserving both submissions', async () => {
            const nameField = form.fields.find(field => field.map_to_contact_field === 'first_name');
            const emailField = form.fields.find(field => field.map_to_contact_field === 'email');
            const submit = submittedEmail => request(app)
                .post(`/api/forms/public/form/${form.slug}`)
                .send({
                    data: {
                        [nameField.id]: 'Public Lead',
                        [emailField.id]: submittedEmail,
                    },
                });

            const responses = await Promise.all([
                submit(`  ${email.toUpperCase()}  `),
                submit(email),
            ]);
            expect(responses.every(response => response.status === 201)).toBe(true);

            const contacts = await dbHelper.pool.query(
                'SELECT COUNT(*)::int AS count FROM contacts WHERE organization_id = $1 AND LOWER(email) = LOWER($2)',
                [userA.org.id, email]
            );
            expect(contacts.rows[0].count).toBe(1);

            const submissions = await dbHelper.pool.query(
                'SELECT COUNT(*)::int AS count FROM form_submissions WHERE form_id = $1',
                [form.id]
            );
            expect(submissions.rows[0].count).toBe(2);
        });
    });

    // ── Plan limit ───────────────────────────────────────────────────────────

    describe('Public form contract', () => {
        let form;
        let otherForm;

        beforeAll(async () => {
            const create = await request(app)
                .post('/api/forms')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Public Contract Form',
                    redirect_url: 'https://example.com/thanks',
                    notify_on_submit: true,
                    notification_emails: [
                        ' Ops@Example.com ',
                        'ops@example.com',
                        'owner@example.com',
                    ],
                    fields: [
                        {
                            field_type: 'email',
                            label: 'Email',
                            is_required: true,
                            map_to_contact_field: 'email',
                        },
                        {
                            field_type: 'select',
                            label: 'Plan',
                            is_required: true,
                            options: [
                                { label: 'Starter', value: 'starter' },
                                { label: 'Pro', value: 'pro' },
                            ],
                        },
                        {
                            field_type: 'number',
                            label: 'Seats',
                            validation: { min: 1, max: 20 },
                        },
                    ],
                });
            expect(create.status).toBe(201);
            form = create.body.data;

            const publish = await request(app)
                .put(`/api/forms/${form.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    status: 'published',
                    redirect_url: 'https://example.com/thanks',
                });
            expect(publish.status).toBe(200);

            const createOther = await request(app)
                .post('/api/forms')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ name: 'Other Public Contract Form' });
            expect(createOther.status).toBe(201);
            otherForm = createOther.body.data;
            const publishOther = await request(app)
                .put(`/api/forms/${otherForm.id}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ status: 'published' });
            expect(publishOther.status).toBe(200);
        });

        afterAll(async () => {
            await dbHelper.pool.query(
                'DELETE FROM forms WHERE id = ANY($1::int[])',
                [[form.id, otherForm.id]]
            );
        });

        it('uses a global public ID and rejects ambiguous legacy slugs', async () => {
            const publicRead = await request(app)
                .get(`/api/forms/public/form/${form.public_id}`);
            expect(publicRead.status).toBe(200);
            expect(publicRead.body.data).toMatchObject({
                id: form.id,
                public_id: form.public_id,
                redirect_url: 'https://example.com/thanks',
            });
            expect(publicRead.headers['cache-control']).toBe('no-store');

            await dbHelper.pool.query(
                'UPDATE forms SET slug = $1 WHERE id = $2',
                [form.slug, otherForm.id]
            );
            const ambiguous = await request(app)
                .get(`/api/forms/public/form/${form.slug}`);
            expect(ambiguous.status).toBe(404);

            const stillExact = await request(app)
                .get(`/api/forms/public/form/${otherForm.public_id}`);
            expect(stillExact.status).toBe(200);
            expect(stillExact.body.data.id).toBe(otherForm.id);
        });

        it('rejects unsafe redirects at the authenticated write boundary', async () => {
            const response = await request(app)
                .put(`/api/forms/${form.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ redirect_url: 'javascript:alert(1)' });
            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_REDIRECT_URL');
        });

        it('validates, normalizes, stores, and durably fans out a submission', async () => {
            const emailField = form.fields.find(field => field.label === 'Email');
            const planField = form.fields.find(field => field.label === 'Plan');
            const seatsField = form.fields.find(field => field.label === 'Seats');
            const response = await request(app)
                .post(`/api/forms/public/form/${form.public_id}`)
                .set('Referer', 'https://source.example/path')
                .send({
                    data: {
                        [emailField.id]: '  Lead@Example.com ',
                        [planField.id]: 'pro',
                        [seatsField.id]: '4',
                    },
                });
            expect(response.status).toBe(201);
            expect(response.body.data.redirect_url).toBe('https://example.com/thanks');
            expect(response.headers['cache-control']).toBe('no-store');

            const submission = await dbHelper.pool.query(
                `SELECT id, data, contact_id
                 FROM form_submissions
                 WHERE form_id = $1
                 ORDER BY id DESC
                 LIMIT 1`,
                [form.id]
            );
            expect(submission.rows[0].data).toEqual({
                [String(emailField.id)]: 'lead@example.com',
                [String(planField.id)]: 'pro',
                [String(seatsField.id)]: 4,
            });

            const triggers = await dbHelper.pool.query(
                `SELECT COUNT(*)::int AS count
                 FROM workflow_triggers
                 WHERE entity_type = 'form_submission'
                   AND entity_id = $1
                   AND trigger_type = 'form_submitted'`,
                [submission.rows[0].id]
            );
            expect(triggers.rows[0].count).toBe(1);

            const notifications = await dbHelper.pool.query(
                `SELECT id, idempotency_key, payload, status
                 FROM workflow_side_effect_outbox
                 WHERE payload->>'formSubmissionId' = $1
                 ORDER BY payload->>'to'`,
                [String(submission.rows[0].id)]
            );
            expect(notifications.rows).toHaveLength(2);
            expect(notifications.rows.map(row => row.payload.to)).toEqual([
                'ops@example.com',
                'owner@example.com',
            ]);
            expect(notifications.rows.every(row => row.status === 'queued')).toBe(true);
            expect(JSON.stringify(notifications.rows)).not.toContain('lead@example.com');

            const emailService = {
                sendEmail: jest.fn().mockResolvedValue({ success: true, id: 'email-form-notice' }),
            };
            const delivery = await runWorkflowSideEffectJobs(dbHelper.pool, {
                batchSize: 1,
                emailService,
                outboxId: notifications.rows[0].id,
            });
            expect(delivery).toMatchObject({ claimed: 1, sent: 1 });
            expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
                to: 'ops@example.com',
                idempotencyKey: notifications.rows[0].idempotency_key,
            }));
        });

        it('rejects unknown, invalid, and oversized data without writing', async () => {
            const emailField = form.fields.find(field => field.label === 'Email');
            const planField = form.fields.find(field => field.label === 'Plan');
            const before = await dbHelper.pool.query(
                'SELECT COUNT(*)::int AS count FROM form_submissions WHERE form_id = $1',
                [form.id]
            );

            const invalidOption = await request(app)
                .post(`/api/forms/public/form/${form.public_id}`)
                .send({
                    data: {
                        [emailField.id]: 'lead2@example.com',
                        [planField.id]: 'enterprise',
                    },
                });
            expect(invalidOption.status).toBe(400);

            const unknown = await request(app)
                .post(`/api/forms/public/form/${form.public_id}`)
                .send({
                    data: {
                        [emailField.id]: 'lead2@example.com',
                        [planField.id]: 'starter',
                        999999: 'smuggled',
                    },
                });
            expect(unknown.status).toBe(400);

            const oversized = await request(app)
                .post(`/api/forms/public/form/${form.public_id}`)
                .send({
                    data: {
                        [emailField.id]: 'lead2@example.com',
                        [planField.id]: 'starter',
                        999999: 'x'.repeat(70 * 1024),
                    },
                });
            expect(oversized.status).toBe(400);
            expect(oversized.body.error.code).toBe('FORM_DATA_TOO_LARGE');

            const after = await dbHelper.pool.query(
                'SELECT COUNT(*)::int AS count FROM form_submissions WHERE form_id = $1',
                [form.id]
            );
            expect(after.rows[0].count).toBe(before.rows[0].count);
        });

        it('enforces tenant and JSON-object integrity for direct submission writers', async () => {
            await expect(dbHelper.pool.query(
                `INSERT INTO form_submissions (form_id, organization_id, data)
                 VALUES ($1, $2, '{}'::jsonb)`,
                [form.id, userB.org.id]
            )).rejects.toMatchObject({ code: '23503' });

            await expect(dbHelper.pool.query(
                `INSERT INTO form_submissions (form_id, organization_id, data)
                 VALUES ($1, $2, '[]'::jsonb)`,
                [form.id, userA.org.id]
            )).rejects.toMatchObject({ code: '23514' });

            await expect(dbHelper.pool.query(
                "UPDATE forms SET redirect_url = 'javascript:alert(1)' WHERE id = $1",
                [form.id]
            )).rejects.toMatchObject({ code: '23514' });

            await expect(dbHelper.pool.query(
                "UPDATE forms SET redirect_url = 'https://user:pass@example.com/thanks' WHERE id = $1",
                [form.id]
            )).rejects.toMatchObject({ code: '23514' });
        });

        it('repairs historical public IDs, redirects, and legacy telephone fields idempotently', async () => {
            const historicalField = await dbHelper.pool.query(
                `INSERT INTO form_fields (
                    form_id, field_type, label, is_required, field_order
                 )
                 VALUES ($1, 'tel', 'Historical telephone', false, 99)
                 RETURNING id`,
                [form.id]
            );
            await dbHelper.pool.query(`
                ALTER TABLE forms
                DROP CONSTRAINT forms_public_id_format,
                DROP CONSTRAINT forms_redirect_url_safe,
                ALTER COLUMN public_id DROP NOT NULL
            `);
            await dbHelper.pool.query(
                `UPDATE forms
                 SET public_id = NULL,
                     redirect_url = 'https://user:pass@example.com/thanks',
                     notification_emails = ARRAY[
                        ' Owner@Example.com ',
                        'owner@example.com',
                        'invalid'
                     ]
                 WHERE id = $1`,
                [form.id]
            );
            await dbHelper.pool.query(
                "UPDATE form_fields SET field_type = 'tel' WHERE id = $1",
                [historicalField.rows[0].id]
            );

            await runPublicFormContractMigration(dbHelper.pool);
            await runPublicFormContractMigration(dbHelper.pool);

            const repaired = await dbHelper.pool.query(
                `SELECT form.public_id, form.redirect_url, form.notification_emails,
                        field.field_type
                 FROM forms form
                 JOIN form_fields field ON field.form_id = form.id
                 WHERE form.id = $1
                   AND field.id = $2`,
                [form.id, historicalField.rows[0].id]
            );
            expect(repaired.rows[0]).toMatchObject({
                redirect_url: null,
                notification_emails: ['owner@example.com'],
                field_type: 'phone',
            });
            expect(repaired.rows[0].public_id).toMatch(/^frm_[a-f0-9]{32}$/);
        });
    });

    describe('Form plan limit enforcement', () => {
        it('blocks form creation when org is at the forms limit', async () => {
            const limitUser = await dbHelper.seedUser(
                `form-limit-${Date.now()}@test.itemize`, 'Form Limit User'
            );

            await dbHelper.pool.query(
                'UPDATE organizations SET forms_limit = 1 WHERE id = $1',
                [limitUser.org.id]
            );

            const r1 = await request(app)
                .post('/api/forms')
                .set('Cookie', [`itemize_auth=${limitUser.token}`])
                .set('x-organization-id', String(limitUser.org.id))
                .send({ name: 'First Form' });
            expect(r1.status).toBe(201);

            const r2 = await request(app)
                .post('/api/forms')
                .set('Cookie', [`itemize_auth=${limitUser.token}`])
                .set('x-organization-id', String(limitUser.org.id))
                .send({ name: 'Second Form (over limit)' });
            expect(r2.status).toBe(403);
            expect(JSON.stringify(r2.body)).toMatch(/limit/i);
        });

        it('serializes concurrent form creation at the plan limit', async () => {
            const limitUser = await dbHelper.seedUser(
                `form-race-${Date.now()}@test.itemize`, 'Form Race User'
            );

            await dbHelper.pool.query(
                'UPDATE organizations SET forms_limit = 1 WHERE id = $1',
                [limitUser.org.id]
            );

            const create = name => request(app)
                .post('/api/forms')
                .set('Cookie', [`itemize_auth=${limitUser.token}`])
                .set('x-organization-id', String(limitUser.org.id))
                .send({ name });

            const responses = await Promise.all([
                create(`Race Form A ${Date.now()}`),
                create(`Race Form B ${Date.now()}`),
            ]);
            expect(responses.map(response => response.status).sort()).toEqual([201, 403]);

            const count = await dbHelper.pool.query(
                'SELECT COUNT(*)::int AS count FROM forms WHERE organization_id = $1',
                [limitUser.org.id]
            );
            expect(count.rows[0].count).toBe(1);
        });
    });

    // ── Auth guard ───────────────────────────────────────────────────────────

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated list request', async () => {
            const res = await request(app).get('/api/forms');
            expect(res.status).toBe(401);
        });
    });
});
