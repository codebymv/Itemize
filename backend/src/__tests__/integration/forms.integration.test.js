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
    app.use((req, _res, next) => {
        req.dbPool = pool;
        next();
    });
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
        logger: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        },
    });
    return app;
}

describe('Retained public forms HTTP protocol', () => {
    let dbHelper;
    let app;
    let userA;
    let userB;
    let form;
    let otherForm;

    const seedPublishedForm = async (user, {
        name,
        slug,
        redirectUrl = null,
        notifyOnSubmit = false,
        notificationEmails = [],
        fields,
    }) => {
        const inserted = await dbHelper.pool.query(
            `INSERT INTO forms (
                organization_id, name, slug, type, status,
                submit_button_text, success_message, redirect_url,
                notify_on_submit, notification_emails, theme,
                create_contact, contact_tags, created_by
             )
             VALUES (
                $1, $2, $3, 'form', 'published',
                'Submit', 'Thanks', $4, $5, $6, '{"primaryColor":"#3B82F6"}',
                true, ARRAY[]::text[], $7
             )
             RETURNING *`,
            [
                user.org.id,
                name,
                slug,
                redirectUrl,
                notifyOnSubmit,
                notificationEmails,
                user.user.id,
            ]
        );
        const seededFields = [];
        for (const [index, field] of fields.entries()) {
            const result = await dbHelper.pool.query(
                `INSERT INTO form_fields (
                    form_id, field_type, label, is_required, validation,
                    options, field_order, width, conditions, map_to_contact_field
                 )
                 VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'full', '[]', $8)
                 RETURNING *`,
                [
                    inserted.rows[0].id,
                    field.field_type,
                    field.label,
                    field.is_required ?? false,
                    JSON.stringify(field.validation || {}),
                    JSON.stringify(field.options || []),
                    index,
                    field.map_to_contact_field || null,
                ]
            );
            seededFields.push(result.rows[0]);
        }
        return { ...inserted.rows[0], fields: seededFields };
    };

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);
        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`public-form-a-${Date.now()}@test.itemize`, 'Public Form A'),
            dbHelper.seedUser(`public-form-b-${Date.now()}@test.itemize`, 'Public Form B'),
        ]);
        form = await seedPublishedForm(userA, {
            name: 'Public Contract Form',
            slug: `public-contract-${Date.now()}`,
            redirectUrl: 'https://example.com/thanks',
            notifyOnSubmit: true,
            notificationEmails: [
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
        otherForm = await seedPublishedForm(userB, {
            name: 'Other Public Form',
            slug: form.slug,
            fields: [
                {
                    field_type: 'email',
                    label: 'Email',
                    is_required: true,
                    map_to_contact_field: 'email',
                },
            ],
        });
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    it('retains global public-ID reads while ambiguous legacy slugs fail closed', async () => {
        const publicRead = await request(app)
            .get(`/api/forms/public/form/${form.public_id}`);
        expect(publicRead.status).toBe(200);
        expect(publicRead.body.data).toMatchObject({
            id: form.id,
            public_id: form.public_id,
            redirect_url: 'https://example.com/thanks',
        });
        expect(publicRead.body.data.fields).toHaveLength(3);
        expect(publicRead.headers['cache-control']).toBe('no-store');
        expect(publicRead.headers['x-robots-tag']).toBe('noindex, nofollow');

        expect(
            (await request(app).get(`/api/forms/public/form/${form.slug}`)).status
        ).toBe(404);
        expect(
            (await request(app).get(`/api/forms/public/form/${otherForm.public_id}`)).status
        ).toBe(200);
    });

    it('serializes same-email contact creation while preserving submissions', async () => {
        const email = `public-race-${Date.now()}@example.com`;
        const emailField = form.fields.find(field => field.label === 'Email');
        const planField = form.fields.find(field => field.label === 'Plan');
        const submit = submittedEmail => request(app)
            .post(`/api/forms/public/form/${form.public_id}`)
            .send({
                data: {
                    [emailField.id]: submittedEmail,
                    [planField.id]: 'starter',
                },
            });

        const responses = await Promise.all([
            submit(`  ${email.toUpperCase()}  `),
            submit(email),
        ]);
        expect(responses.map(response => response.status)).toEqual([201, 201]);

        const contacts = await dbHelper.pool.query(
            `SELECT COUNT(*)::int AS count
             FROM contacts
             WHERE organization_id = $1 AND email = $2`,
            [userA.org.id, email]
        );
        expect(contacts.rows[0].count).toBe(1);
        const submissions = await dbHelper.pool.query(
            `SELECT COUNT(*)::int AS count
             FROM form_submissions
             WHERE form_id = $1 AND data->>$2 = $3`,
            [form.id, String(emailField.id), email]
        );
        expect(submissions.rows[0].count).toBe(2);
    });

    it('validates and normalizes a submission and durably fans out side effects', async () => {
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
            `SELECT id, data
             FROM form_submissions
             WHERE form_id = $1 AND data->>$2 = 'lead@example.com'
             ORDER BY id DESC
             LIMIT 1`,
            [form.id, String(emailField.id)]
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
        expect(notifications.rows.map(row => row.payload.to)).toEqual([
            'ops@example.com',
            'owner@example.com',
        ]);
        expect(notifications.rows.every(row => row.status === 'queued')).toBe(true);
        expect(JSON.stringify(notifications.rows)).not.toContain('lead@example.com');

        const emailService = {
            sendEmail: jest.fn().mockResolvedValue({
                success: true,
                id: 'email-form-notice',
            }),
        };
        await expect(runWorkflowSideEffectJobs(dbHelper.pool, {
            batchSize: 1,
            emailService,
            outboxId: notifications.rows[0].id,
        })).resolves.toMatchObject({ claimed: 1, sent: 1 });
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
                    [emailField.id]: 'invalid-option@example.com',
                    [planField.id]: 'enterprise',
                },
            });
        expect(invalidOption.status).toBe(400);

        const unknown = await request(app)
            .post(`/api/forms/public/form/${form.public_id}`)
            .send({
                data: {
                    [emailField.id]: 'unknown@example.com',
                    [planField.id]: 'starter',
                    999999: 'smuggled',
                },
            });
        expect(unknown.status).toBe(400);

        const oversized = await request(app)
            .post(`/api/forms/public/form/${form.public_id}`)
            .send({
                data: {
                    [emailField.id]: 'oversized@example.com',
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

    it('enforces tenant and JSON-object integrity for direct writers', async () => {
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
    });
});
