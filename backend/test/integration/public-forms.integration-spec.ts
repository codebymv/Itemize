import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

type SeededForm = {
  id: number;
  public_id: string;
  slug: string;
  fieldIds: Record<string, number>;
};

describe('Public forms (legacy behavior pinned)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  let organizationId: number;
  let ownerId: number;
  let nestForm: SeededForm;

  const seedForm = async (slug: string): Promise<SeededForm> => {
    const inserted = await pool.query<{ id: number; public_id: string }>(
      `INSERT INTO forms (
         organization_id, name, slug, type, status,
         submit_button_text, success_message, redirect_url,
         notify_on_submit, notification_emails, theme,
         create_contact, contact_tags, created_by
       )
       VALUES (
         $1, 'Parity form', $2, 'form', 'published',
         'Submit', 'Thanks for reaching out', 'https://done.example.com',
         true, ARRAY['ops@test.itemize','owner@test.itemize'],
         '{"primaryColor":"#3B82F6"}', true, ARRAY['from-form']::text[], $3
       )
       RETURNING id, public_id`,
      [organizationId, slug, ownerId],
    );
    const formId = Number(inserted.rows[0].id);
    const fieldIds: Record<string, number> = {};
    const fields: Array<{
      key: string;
      field_type: string;
      label: string;
      is_required?: boolean;
      validation?: Record<string, unknown>;
      options?: unknown[];
      map_to_contact_field?: string | null;
      conditions?: unknown[];
    }> = [
      { key: 'first', field_type: 'text', label: 'First name', is_required: true, map_to_contact_field: 'first_name' },
      { key: 'email', field_type: 'email', label: 'Work email', is_required: true, map_to_contact_field: 'email' },
      { key: 'phone', field_type: 'phone', label: 'Phone', map_to_contact_field: 'phone' },
      { key: 'plan', field_type: 'select', label: 'Plan', is_required: true, options: ['starter', 'pro'] },
      { key: 'rating', field_type: 'rating', label: 'Rating' },
    ];
    for (const [order, field] of fields.entries()) {
      const row = await pool.query<{ id: number }>(
        `INSERT INTO form_fields (
           form_id, field_type, label, is_required, validation,
           options, field_order, width, conditions, map_to_contact_field
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'full', $8::jsonb, $9)
         RETURNING id`,
        [
          formId,
          field.field_type,
          field.label,
          field.is_required ?? false,
          JSON.stringify(field.validation || {}),
          JSON.stringify(field.options || []),
          order,
          JSON.stringify(field.conditions || []),
          field.map_to_contact_field ?? null,
        ],
      );
      fieldIds[field.key] = Number(row.rows[0].id);
    }
    // A conditional note that becomes required only for the pro plan.
    const note = await pool.query<{ id: number }>(
      `INSERT INTO form_fields (
         form_id, field_type, label, is_required, validation,
         options, field_order, width, conditions, map_to_contact_field
       )
       VALUES ($1, 'textarea', 'Pro notes', false, '{}'::jsonb, '[]'::jsonb, 5, 'full', $2::jsonb, NULL)
       RETURNING id`,
      [
        formId,
        JSON.stringify([
          { field_id: fieldIds.plan, operator: 'equals', value: 'pro', action: 'require' },
        ]),
      ],
    );
    fieldIds.note = Number(note.rows[0].id);
    return {
      id: formId,
      public_id: inserted.rows[0].public_id,
      slug,
      fieldIds,
    };
  };

  const validSubmission = (form: SeededForm, email: string) => ({
    data: {
      [String(form.fieldIds.first)]: '  Parity Tester ',
      [String(form.fieldIds.email)]: email,
      [String(form.fieldIds.plan)]: 'starter',
      [String(form.fieldIds.rating)]: 4,
    },
  });

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for public form tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    const owner = await dbHelper.seedUser(
      `public-forms-owner-${Date.now()}@test.itemize`,
      'Forms Owner',
    );
    organizationId = owner.org.id;
    ownerId = owner.user.id;
    nestForm = await seedForm(`parity-nest-${Date.now()}`);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();

  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbHelper) {
      const TestDbHelper = require('../../../db/test-support/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  it('serves the published definition by public ID and slug', async () => {
    for (const identifier of [nestForm.public_id, nestForm.slug]) {
      const nest = await request(app.getHttpServer()).get(
        `/api/forms/public/form/${identifier}`,
      );
      expect(nest.status).toBe(200);
      expect(nest.headers['cache-control']).toBe('no-store');
      expect(nest.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(nest.body.data.fields).toHaveLength(6);
      expect(nest.body.data).not.toHaveProperty('notification_emails');
    }
  });

  it('conceals unknown identifiers', async () => {
    const nest = await request(app.getHttpServer()).get(
      '/api/forms/public/form/never-existed',
    );
    expect(nest.status).toBe(404);
    expect(nest.body).toEqual({
      success: false,
      error: { message: 'Form not found', code: 'NOT_FOUND' },
    });
  });

  it('rejects invalid submissions across the validation matrix', async () => {
    const cases: Array<Record<string, unknown>> = [
      {},
      { data: 'not-an-object' },
      { data: { [String(nestForm.fieldIds.email)]: 'a@b.co' } },
      {
        ...validSubmission(nestForm, 'matrix@test.itemize'),
        data: {
          ...validSubmission(nestForm, 'matrix@test.itemize').data,
          [String(nestForm.fieldIds.email)]: 'not-an-email',
        },
      },
      {
        ...validSubmission(nestForm, 'matrix@test.itemize'),
        data: {
          ...validSubmission(nestForm, 'matrix@test.itemize').data,
          [String(nestForm.fieldIds.plan)]: 'enterprise',
        },
      },
      {
        ...validSubmission(nestForm, 'matrix@test.itemize'),
        data: {
          ...validSubmission(nestForm, 'matrix@test.itemize').data,
          [String(nestForm.fieldIds.rating)]: 9,
        },
      },
      {
        ...validSubmission(nestForm, 'matrix@test.itemize'),
        data: {
          ...validSubmission(nestForm, 'matrix@test.itemize').data,
          [String(nestForm.fieldIds.plan)]: 'pro',
        },
      },
      { data: { unknown_field: 'x' } },
    ];
    for (const body of cases) {
      const nest = await request(app.getHttpServer())
        .post(`/api/forms/public/form/${nestForm.public_id}`)
        .send(body);
      expect(nest.status).toBe(400);
    }
    const submissions = await pool.query(
      'SELECT id FROM form_submissions WHERE form_id = $1',
      [nestForm.id],
    );
    expect(submissions.rows).toHaveLength(0);
  });

  it('accepts submissions and fans out the durable side effects', async () => {
    const email = `parity-contact-${Date.now()}@Test.Itemize`;
    const nest = await request(app.getHttpServer())
      .post(`/api/forms/public/form/${nestForm.public_id}`)
      .set('user-agent', 'parity-agent')
      .set('referer', 'https://embed.example.com')
      .send(validSubmission(nestForm, email))
      .expect(201);
    expect(nest.body).toEqual({
      success: true,
      data: {
        success: true,
        message: 'Thanks for reaching out',
        redirect_url: 'https://done.example.com',
      },
    });

    const submissions = await pool.query(
      `SELECT form_id, contact_id, data, user_agent, referrer
       FROM form_submissions
       WHERE form_id = $1
       ORDER BY form_id`,
      [nestForm.id],
    );
    expect(submissions.rows).toHaveLength(1);
    const [nestRow] = submissions.rows;
    expect(nestRow.user_agent).toBe('parity-agent');
    expect(nestRow.referrer).toBe('https://embed.example.com');
    expect(nestRow.data[String(nestForm.fieldIds.first)]).toBe('Parity Tester');
    expect(nestRow.data[String(nestForm.fieldIds.email)]).toBe(
      email.toLowerCase(),
    );

    const contact = await pool.query(
      `SELECT first_name, email, source, tags
       FROM contacts WHERE id = $1`,
      [nestRow.contact_id],
    );
    expect(contact.rows[0]).toMatchObject({
      first_name: 'Parity Tester',
      email: email.toLowerCase(),
      source: 'form',
      tags: ['from-form'],
    });

    for (const row of submissions.rows) {
      const submissionId = (
        await pool.query(
          'SELECT id FROM form_submissions WHERE form_id = $1',
          [row.form_id],
        )
      ).rows[0].id;
      const trigger = await pool.query(
        'SELECT trigger_type, payload FROM workflow_triggers WHERE event_key = $1',
        [`domain:form_submitted:${submissionId}`],
      );
      expect(trigger.rows).toHaveLength(1);
      expect(trigger.rows[0].payload).toMatchObject({
        submission_id: submissionId,
        form_id: row.form_id,
      });
      const notifications = await pool.query(
        `SELECT payload->>'to' AS recipient, status
         FROM workflow_side_effect_outbox
         WHERE idempotency_key LIKE $1
         ORDER BY payload->>'to'`,
        [`form-submission-${submissionId}-notify-%`],
      );
      expect(notifications.rows.map((n) => n.recipient)).toEqual([
        'ops@test.itemize',
        'owner@test.itemize',
      ]);
      expect(notifications.rows.every((n) => n.status === 'queued')).toBe(true);
    }
  });

  it('replays one public submission without duplicating its durable effects', async () => {
    const key = `public-form-replay-${Date.now()}`;
    const email = `public-form-replay-${Date.now()}@test.itemize`;
    const body = validSubmission(nestForm, email);

    const first = await request(app.getHttpServer())
      .post(`/api/forms/public/form/${nestForm.public_id}`)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post(`/api/forms/public/form/${nestForm.public_id}`)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    expect(replay.body).toEqual(first.body);

    const submissions = await pool.query<{ id: number }>(
      `SELECT id
       FROM form_submissions
       WHERE form_id = $1 AND idempotency_key = $2`,
      [nestForm.id, key],
    );
    expect(submissions.rows).toHaveLength(1);
    const submissionId = submissions.rows[0].id;

    const triggers = await pool.query(
      'SELECT id FROM workflow_triggers WHERE event_key = $1',
      [`domain:form_submitted:${submissionId}`],
    );
    expect(triggers.rows).toHaveLength(1);
    const notifications = await pool.query(
      `SELECT id
       FROM workflow_side_effect_outbox
       WHERE idempotency_key LIKE $1`,
      [`form-submission-${submissionId}-notify-%`],
    );
    expect(notifications.rows).toHaveLength(2);

    const conflict = await request(app.getHttpServer())
      .post(`/api/forms/public/form/${nestForm.public_id}`)
      .set('Idempotency-Key', key)
      .send(validSubmission(nestForm, `changed-${email}`))
      .expect(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('requires the conditional field when its condition activates', async () => {
    const body = {
      data: {
        ...validSubmission(nestForm, 'conditional@test.itemize').data,
        [String(nestForm.fieldIds.plan)]: 'pro',
        [String(nestForm.fieldIds.note)]: 'Needs onboarding help',
      },
    };
    const accepted = await request(app.getHttpServer())
      .post(`/api/forms/public/form/${nestForm.public_id}`)
      .send(body)
      .expect(201);
    expect(accepted.body.data.success).toBe(true);
  });
});
