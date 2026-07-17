import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Authenticated forms REST/GraphQL PostgreSQL parity', () => {
  let graphqlApp: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberId: number;
  let outsiderId: number;
  let memberToken: string;
  let outsiderToken: string;
  let formId: number;
  let submissionId: number;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for forms tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });

    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Forms Member', 'email', true),
              ($2, 'Forms Outsider', 'email', true)
       RETURNING id`,
      [
        `forms-member-${suffix}@test.itemize`,
        `forms-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug, forms_limit)
       VALUES ('Forms Org', $1, 20), ('Forms Outsider', $2, 20)
       RETURNING id`,
      [`forms-${suffix}`, `forms-outsider-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $2, 'owner', NOW()), ($3, $4, 'owner', NOW())`,
      [organizationId, memberId, outsiderOrganizationId, outsiderId],
    );
    await pool.query(
      `UPDATE users
       SET default_organization_id = CASE id
         WHEN $1::int THEN $2::int
         WHEN $3::int THEN $4::int
       END
       WHERE id = ANY($5::int[])`,
      [
        memberId,
        organizationId,
        outsiderId,
        outsiderOrganizationId,
        [memberId, outsiderId],
      ],
    );
    const form = await pool.query<{ id: number }>(
      `INSERT INTO forms (
         organization_id, name, description, slug, type, status,
         redirect_url, notification_emails, theme, created_by
       ) VALUES (
         $1, 'Intake', 'Primary intake', $2, 'form', 'draft',
         'https://example.com/thanks', ARRAY['owner@example.com'],
         '{"primaryColor":"#112233"}'::jsonb, $3
       ) RETURNING id`,
      [organizationId, `intake-${suffix}`, memberId],
    );
    formId = Number(form.rows[0].id);
    await pool.query(
      `INSERT INTO form_fields (
         form_id, field_type, label, is_required, validation, options,
         field_order, width, conditions, map_to_contact_field
       ) VALUES
         ($1, 'text', 'Name', true, '{}'::jsonb, '[]'::jsonb, 0, 'full', '[]'::jsonb, 'first_name'),
         ($1, 'email', 'Email', true, '{}'::jsonb, '[]'::jsonb, 1, 'half', '[]'::jsonb, 'email')`,
      [formId],
    );
    const submission = await pool.query<{ id: number }>(
      `INSERT INTO form_submissions (form_id, organization_id, data)
       VALUES ($1, $2, '{"answer":"first"}'::jsonb)
       RETURNING id`,
      [formId, organizationId],
    );
    submissionId = Number(submission.rows[0].id);

    memberToken = await jwt.signAsync(
      { id: memberId, name: 'Forms Member' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId, name: 'Forms Outsider' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .compile();
    graphqlApp = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(graphqlApp);
    await graphqlApp.init();

    const createFormsRouter = require('../../../backend/src/routes/forms.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use(
      '/api/forms',
      createFormsRouter(
        pool,
        authenticateJWT,
        (_req: unknown, _res: unknown, next: () => void) => next(),
      ),
    );
  });

  afterAll(async () => {
    if (pool) {
      if (organizationId || outsiderOrganizationId) {
        await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [
          [organizationId, outsiderOrganizationId].filter(Boolean),
        ]);
      }
      if (memberId || outsiderId) {
        await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
          [memberId, outsiderId].filter(Boolean),
        ]);
      }
    }
    if (graphqlApp) await graphqlApp.close();
  });

  const graphql = (
    token: string,
    organization: number,
    query: string,
    variables: Record<string, unknown> = {},
  ) =>
    request(graphqlApp.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organization))
      .send({ query, variables });

  const mutation = (
    token: string,
    organization: number,
    query: string,
    variables: Record<string, unknown> = {},
  ) => {
    const csrf = 'forms-csrf';
    return request(graphqlApp.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .set('x-organization-id', String(organization))
      .send({ query, variables });
  };

  it('matches list/detail projections and keeps foreign forms private', async () => {
    const legacy = await request(legacyApp)
      .get('/api/forms')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    const target = await graphql(
      memberToken,
      organizationId,
      `query {
        forms {
          id organizationId name status submissionCount fieldCount fields { id }
        }
        form(id: ${formId}) {
          id name description publicId redirectUrl notificationEmails theme
          fields { id formId fieldType label fieldOrder width mapToContactField }
        }
      }`,
    ).expect(200);
    expect(target.body.errors).toBeUndefined();
    const legacyForm = legacy.body.data.forms.find(
      (form: { id: number }) => form.id === formId,
    );
    expect(target.body.data.forms).toContainEqual(
      expect.objectContaining({
        id: legacyForm.id,
        organizationId: legacyForm.organization_id,
        name: legacyForm.name,
        status: legacyForm.status,
        submissionCount: 1,
        fieldCount: 2,
        fields: expect.arrayContaining([
          expect.objectContaining({ id: expect.any(Number) }),
        ]),
      }),
    );
    expect(target.body.data.form).toMatchObject({
      id: formId,
      description: 'Primary intake',
      redirectUrl: 'https://example.com/thanks',
      notificationEmails: ['owner@example.com'],
    });
    expect(target.body.data.form.publicId).toMatch(/^frm_[a-f0-9]{32}$/);
    expect(target.body.data.form.fields).toHaveLength(2);

    const foreign = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query { form(id: ${formId}) { id } }`,
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('creates defaults, preserves omitted values, clears explicit nullable values, and enforces CSRF/limits', async () => {
    const created = await mutation(
      memberToken,
      organizationId,
      `mutation Create($input: CreateFormInput!) {
        createForm(input: $input) {
          id name redirectUrl notificationEmails
          fields { fieldType label fieldOrder mapToContactField }
        }
      }`,
      {
        input: {
          name: '  Registration  ',
          redirectUrl: 'https://example.com/done',
          notificationEmails: ['OWNER@example.com', 'owner@example.com'],
        },
      },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createForm).toMatchObject({
      name: 'Registration',
      redirectUrl: 'https://example.com/done',
      notificationEmails: ['owner@example.com'],
    });
    expect(created.body.data.createForm.fields).toHaveLength(2);
    const createdId = created.body.data.createForm.id;

    const preserved = await mutation(
      memberToken,
      organizationId,
      `mutation Update($id: Int!, $input: UpdateFormInput!) {
        updateForm(id: $id, input: $input) { id name redirectUrl description }
      }`,
      { id: createdId, input: { description: 'Configured' } },
    ).expect(200);
    expect(preserved.body.data.updateForm.redirectUrl).toBe(
      'https://example.com/done',
    );
    const cleared = await mutation(
      memberToken,
      organizationId,
      `mutation Update($id: Int!, $input: UpdateFormInput!) {
        updateForm(id: $id, input: $input) { redirectUrl description }
      }`,
      { id: createdId, input: { redirectUrl: null, description: null } },
    ).expect(200);
    expect(cleared.body.data.updateForm).toEqual({
      redirectUrl: null,
      description: null,
    });

    const noCsrf = await graphql(
      memberToken,
      organizationId,
      `mutation { deleteForm(id: ${createdId}) { deletedId } }`,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const count = await pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM forms WHERE organization_id = $1',
      [organizationId],
    );
    await pool.query('UPDATE organizations SET forms_limit = $1 WHERE id = $2', [
      count.rows[0].count,
      organizationId,
    ]);
    const limited = await mutation(
      memberToken,
      organizationId,
      `mutation { createForm(input: { name: "Blocked" }) { id } }`,
    ).expect(200);
    expect(limited.body.errors[0].extensions).toMatchObject({
      code: 'FORBIDDEN',
      reason: 'PLAN_LIMIT_REACHED',
    });
    await pool.query('UPDATE organizations SET forms_limit = 20 WHERE id = $1', [
      organizationId,
    ]);
  });

  it('atomically replaces fields, remaps conditions, and rejects invalid publication', async () => {
    const replaced = await mutation(
      memberToken,
      organizationId,
      `mutation Replace($formId: Int!, $fields: [FormFieldInput!]!) {
        replaceFormFields(formId: $formId, fields: $fields) {
          fields { id fieldOrder label conditions }
        }
      }`,
      {
        formId,
        fields: [
          {
            id: 1001,
            fieldType: 'radio',
            label: 'Attending',
            isRequired: true,
            options: [
              { label: 'Yes', value: 'yes' },
              { label: 'No', value: 'no' },
            ],
            width: 'half',
          },
          {
            id: 1002,
            fieldType: 'text',
            label: 'Guest name',
            isRequired: false,
            width: 'half',
            conditions: [
              {
                field_id: 1001,
                operator: 'equals',
                value: 'yes',
                action: 'show',
              },
            ],
          },
        ],
      },
    ).expect(200);
    expect(replaced.body.errors).toBeUndefined();
    const fields = replaced.body.data.replaceFormFields.fields;
    expect(fields.map((field: { fieldOrder: number }) => field.fieldOrder)).toEqual([
      0, 1,
    ]);
    expect(fields[1].conditions[0].field_id).toBe(fields[0].id);

    await mutation(
      memberToken,
      organizationId,
      `mutation { replaceFormFields(formId: ${formId}, fields: []) { fields { id } } }`,
    ).expect(200);
    const invalidPublish = await mutation(
      memberToken,
      organizationId,
      `mutation { updateForm(id: ${formId}, input: { status: "published" }) { id } }`,
    ).expect(200);
    expect(invalidPublish.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_FORM_CONFIGURATION',
    });
  });

  it('duplicates condition graphs with new IDs and deletes only tenant-owned forms', async () => {
    const restored = await mutation(
      memberToken,
      organizationId,
      `mutation Replace($formId: Int!, $fields: [FormFieldInput!]!) {
        replaceFormFields(formId: $formId, fields: $fields) {
          fields { id label conditions }
        }
      }`,
      {
        formId,
        fields: [
          {
            id: 2001,
            fieldType: 'select',
            label: 'Kind',
            options: [{ label: 'A', value: 'a' }],
          },
          {
            id: 2002,
            fieldType: 'text',
            label: 'Details',
            conditions: [
              { field_id: 2001, operator: 'equals', value: 'a', action: 'show' },
            ],
          },
        ],
      },
    ).expect(200);
    const sourceFields = restored.body.data.replaceFormFields.fields;
    const duplicated = await mutation(
      memberToken,
      organizationId,
      `mutation { duplicateForm(id: ${formId}) {
        id name status fields { id label conditions }
      } }`,
    ).expect(200);
    expect(duplicated.body.errors).toBeUndefined();
    expect(duplicated.body.data.duplicateForm).toMatchObject({
      name: 'Intake (Copy)',
      status: 'draft',
    });
    const copy = duplicated.body.data.duplicateForm;
    expect(copy.fields[0].id).not.toBe(sourceFields[0].id);
    expect(copy.fields[1].conditions[0].field_id).toBe(copy.fields[0].id);

    const foreignDelete = await mutation(
      outsiderToken,
      outsiderOrganizationId,
      `mutation { deleteForm(id: ${copy.id}) { deletedId } }`,
    ).expect(200);
    expect(foreignDelete.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const deleted = await mutation(
      memberToken,
      organizationId,
      `mutation { deleteForm(id: ${copy.id}) { deletedId } }`,
    ).expect(200);
    expect(deleted.body.data.deleteForm.deletedId).toBe(copy.id);
  });

  it('pages submissions deterministically and tenant-privately deletes one', async () => {
    const second = await pool.query<{ id: number }>(
      `INSERT INTO form_submissions (form_id, organization_id, data)
       VALUES ($1, $2, '{"answer":"second"}'::jsonb)
       RETURNING id`,
      [formId, organizationId],
    );
    const page = await graphql(
      memberToken,
      organizationId,
      `query {
        formSubmissions(formId: ${formId}, page: 1, limit: 1) {
          submissions { id formId organizationId data }
          page limit total totalPages
        }
      }`,
    ).expect(200);
    expect(page.body.errors).toBeUndefined();
    expect(page.body.data.formSubmissions).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(page.body.data.formSubmissions.submissions[0].id).toBe(
      Number(second.rows[0].id),
    );

    const foreign = await mutation(
      outsiderToken,
      outsiderOrganizationId,
      `mutation {
        deleteFormSubmission(formId: ${formId}, submissionId: ${submissionId}) {
          deletedId
        }
      }`,
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const deleted = await mutation(
      memberToken,
      organizationId,
      `mutation {
        deleteFormSubmission(formId: ${formId}, submissionId: ${submissionId}) {
          deletedId
        }
      }`,
    ).expect(200);
    expect(deleted.body.data.deleteFormSubmission.deletedId).toBe(submissionId);
  });
});
