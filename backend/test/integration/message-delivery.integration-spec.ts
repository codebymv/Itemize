import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import {
  ResendMessageEmailProvider,
  TwilioMessageSmsProvider,
} from '../../src/admin-messaging/message-delivery.providers';
import { MessageDeliveryService } from '../../src/admin-messaging/message-delivery.service';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Message delivery GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let delivery: MessageDeliveryService;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let userId: number;
  let outsiderId: number;
  let contactId: number;
  let emailTemplateId: number;
  let smsTemplateId: number;
  let token: string;
  const jwt = new JwtService();
  const emailProvider = { send: jest.fn() };
  const smsProvider = { send: jest.fn() };
  const originalScheduler = process.env.MESSAGE_DELIVERY_SCHEDULER_ENABLED;

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.MESSAGE_DELIVERY_SCHEDULER_ENABLED = 'false';
    pool = new Pool({ connectionString, ssl: process.env.TEST_DATABASE_SSL === 'true' });

    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Delivery Member', 'email', true),
              ($2, 'Delivery Outsider', 'email', true)
       RETURNING id`,
      [`delivery-member-${suffix}@test.itemize`, `delivery-outsider-${suffix}@test.itemize`],
    );
    [userId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug, emails_limit, sms_limit)
       VALUES ('Delivery Primary', $1, 100, 100),
              ('Delivery Other', $2, 100, 100)
       RETURNING id`,
      [`delivery-primary-${suffix}`, `delivery-other-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) => Number(row.id));
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $2, 'owner', NOW()), ($3, $4, 'owner', NOW())`,
      [organizationId, userId, outsiderOrganizationId, outsiderId],
    );
    await pool.query(
      `UPDATE users SET default_organization_id=CASE id
         WHEN $1::int THEN $2::int WHEN $3::int THEN $4::int END
       WHERE id=ANY($5::int[])`,
      [userId, organizationId, outsiderId, outsiderOrganizationId, [userId, outsiderId]],
    );
    contactId = Number((await pool.query<{ id: number }>(
      `INSERT INTO contacts (
         organization_id, first_name, last_name, email, phone, created_by
       ) VALUES ($1, 'Ada', 'Lovelace', $2, '+16025550100', $3)
       RETURNING id`,
      [organizationId, `ada-${suffix}@test.itemize`, userId],
    )).rows[0].id);
    emailTemplateId = Number((await pool.query<{ id: number }>(
      `INSERT INTO email_templates (
         organization_id, name, subject, body_html, body_text, category, created_by
       ) VALUES (
         $1, 'Welcome', 'Hello {{first_name}}',
         '<p>Welcome {{full_name}} {{unknown}}</p>', 'Hello {{first_name}}',
         'general', $2
       ) RETURNING id`,
      [organizationId, userId],
    )).rows[0].id);
    smsTemplateId = Number((await pool.query<{ id: number }>(
      `INSERT INTO sms_templates (
         organization_id, name, message, category, created_by
       ) VALUES ($1, 'Reminder', 'Hi {{first_name}}', 'general', $2)
       RETURNING id`,
      [organizationId, userId],
    )).rows[0].id);
    token = await jwt.signAsync({ id: userId }, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(ResendMessageEmailProvider)
      .useValue(emailProvider)
      .overrideProvider(TwilioMessageSmsProvider)
      .useValue(smsProvider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();
    delivery = app.get(MessageDeliveryService);
  });

  afterAll(async () => {
    if (originalScheduler === undefined) delete process.env.MESSAGE_DELIVERY_SCHEDULER_ENABLED;
    else process.env.MESSAGE_DELIVERY_SCHEDULER_ENABLED = originalScheduler;
    if (pool && (organizationId || outsiderOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id=ANY($1::int[])', [
        [organizationId, outsiderOrganizationId].filter(Boolean),
      ]);
    }
    if (pool && (userId || outsiderId)) {
      await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [
        [userId, outsiderId].filter(Boolean),
      ]);
    }
    if (app) await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const graphql = (
    document: string,
    variables: Record<string, unknown>,
    csrf = true,
  ) => {
    const call = request(app.getHttpServer())
      .post('/graphql')
      .set(
        'Cookie',
        csrf
          ? `itemize_auth=${token}; csrf-token=delivery-csrf`
          : `itemize_auth=${token}`,
      )
      .set('x-organization-id', String(organizationId));
    if (csrf) call.set('x-csrf-token', 'delivery-csrf');
    return call.send({ query: document, variables });
  };

  const fields = `
    id kind channel status accepted replayed contactId templateId providerId createdAt
  `;

  it('persists one contact email intent, replays it, then logs only after provider acceptance', async () => {
    const mutation = `mutation Send($input: EnqueueContactEmailInput!) {
      enqueueContactEmail(input: $input) { ${fields} }
    }`;
    const input = {
      contactId,
      templateId: emailTemplateId,
      idempotencyKey: `email-contact-${Date.now()}`,
    };
    const usageBefore = Number((await pool.query<{ emails_used: number }>(
      'SELECT emails_used FROM organizations WHERE id=$1',
      [organizationId],
    )).rows[0].emails_used);
    const created = await graphql(mutation, { input }).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.enqueueContactEmail).toMatchObject({
      kind: 'contact_email',
      status: 'queued',
      accepted: true,
      replayed: false,
      contactId,
      templateId: emailTemplateId,
    });
    const replayed = await graphql(mutation, { input }).expect(200);
    expect(replayed.body.data.enqueueContactEmail).toMatchObject({
      id: created.body.data.enqueueContactEmail.id,
      replayed: true,
    });
    expect(Number((await pool.query<{ emails_used: number }>(
      'SELECT emails_used FROM organizations WHERE id=$1',
      [organizationId],
    )).rows[0].emails_used)).toBe(usageBefore + 1);
    expect((await pool.query(
      'SELECT id FROM email_logs WHERE contact_id=$1',
      [contactId],
    )).rows).toHaveLength(0);

    emailProvider.send.mockResolvedValue({ kind: 'accepted', providerId: `re_${Date.now()}` });
    await expect(delivery.runDue()).resolves.toMatchObject({ accepted: 1 });
    const [jobs, logs, activities] = await Promise.all([
      pool.query(
        'SELECT status, attempt_count FROM message_delivery_jobs WHERE id=$1',
        [created.body.data.enqueueContactEmail.id],
      ),
      pool.query('SELECT * FROM email_logs WHERE contact_id=$1', [contactId]),
      pool.query(
        `SELECT * FROM contact_activities
         WHERE contact_id=$1 AND type='email'`,
        [contactId],
      ),
    ]);
    expect(jobs.rows[0]).toMatchObject({ status: 'provider_accepted', attempt_count: 1 });
    expect(logs.rows).toHaveLength(1);
    expect(logs.rows[0].sent_by).toBe(userId);
    expect(activities.rows).toHaveLength(1);
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
  });

  it('rejects a reused key with changed content and hides foreign contacts', async () => {
    const mutation = `mutation Send($input: EnqueueContactEmailInput!) {
      enqueueContactEmail(input: $input) { id }
    }`;
    const key = `email-conflict-${Date.now()}`;
    await graphql(mutation, {
      input: {
        contactId,
        subject: 'First',
        bodyHtml: '<p>First</p>',
        idempotencyKey: key,
      },
    }).expect(200);
    const conflict = await graphql(mutation, {
      input: {
        contactId,
        subject: 'Changed',
        bodyHtml: '<p>Changed</p>',
        idempotencyKey: key,
      },
    }).expect(200);
    expect(conflict.body.errors[0].extensions.code).toBe('CONFLICT');

    const foreignContact = Number((await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id, first_name, email, created_by)
       VALUES ($1, 'Foreign', $2, $3) RETURNING id`,
      [outsiderOrganizationId, `foreign-${Date.now()}@test.itemize`, outsiderId],
    )).rows[0].id);
    const denied = await graphql(mutation, {
      input: {
        contactId: foreignContact,
        subject: 'Hidden',
        bodyHtml: '<p>Hidden</p>',
        idempotencyKey: `foreign-${Date.now()}`,
      },
    }).expect(200);
    expect(denied.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('hides foreign templates across contact and test deliveries', async () => {
    const foreignTemplates = await pool.query<{
      email_template_id: number;
      sms_template_id: number;
    }>(
      `WITH email_template AS (
         INSERT INTO email_templates (
           organization_id,name,subject,body_html,category,created_by
         ) VALUES ($1,'Foreign email','Hidden','<p>Hidden</p>','general',$2)
         RETURNING id
       ), sms_template AS (
         INSERT INTO sms_templates (
           organization_id,name,message,category,created_by
         ) VALUES ($1,'Foreign SMS','Hidden','general',$2)
         RETURNING id
       )
       SELECT email_template.id AS email_template_id,
              sms_template.id AS sms_template_id
       FROM email_template CROSS JOIN sms_template`,
      [outsiderOrganizationId, outsiderId],
    );
    const { email_template_id: foreignEmailTemplateId,
      sms_template_id: foreignSmsTemplateId } = foreignTemplates.rows[0];
    const keys = {
      contactEmail: `foreign-contact-email-${Date.now()}`,
      testEmail: `foreign-test-email-${Date.now()}`,
      contactSms: `foreign-contact-sms-${Date.now()}`,
      testSms: `foreign-test-sms-${Date.now()}`,
    };

    const attempts = await Promise.all([
      graphql(
        `mutation Send($input: EnqueueContactEmailInput!) {
          enqueueContactEmail(input: $input) { id }
        }`,
        { input: {
          contactId,
          templateId: foreignEmailTemplateId,
          idempotencyKey: keys.contactEmail,
        } },
      ).expect(200),
      graphql(
        `mutation Test($input: SendEmailTemplateTestInput!) {
          sendEmailTemplateTest(input: $input) { id }
        }`,
        { input: {
          templateId: foreignEmailTemplateId,
          toEmail: 'operator@test.itemize',
          idempotencyKey: keys.testEmail,
        } },
      ).expect(200),
      graphql(
        `mutation Send($input: EnqueueContactSmsInput!) {
          enqueueContactSms(input: $input) { id }
        }`,
        { input: {
          contactId,
          templateId: foreignSmsTemplateId,
          idempotencyKey: keys.contactSms,
        } },
      ).expect(200),
      graphql(
        `mutation Test($input: SendSmsTemplateTestInput!) {
          sendSmsTemplateTest(input: $input) { id }
        }`,
        { input: {
          templateId: foreignSmsTemplateId,
          toPhone: '+16025550100',
          idempotencyKey: keys.testSms,
        } },
      ).expect(200),
    ]);
    for (const attempt of attempts) {
      expect(attempt.body.data).toBeNull();
      expect(attempt.body.errors[0].extensions.code).toBe('NOT_FOUND');
    }

    const persisted = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM message_delivery_jobs
       WHERE organization_id=$1 AND idempotency_key=ANY($2::text[])`,
      [organizationId, Object.values(keys)],
    );
    expect(persisted.rows[0].count).toBe(0);
  });

  it('marks test content and creates no normal contact artifacts', async () => {
    let providerSequence = 0;
    emailProvider.send.mockImplementation(async () => ({
      kind: 'accepted',
      providerId: `re_test_${Date.now()}_${providerSequence++}`,
    }));
    const response = await graphql(
      `mutation Test($input: SendEmailTemplateTestInput!) {
        sendEmailTemplateTest(input: $input) { ${fields} }
      }`,
      {
        input: {
          templateId: emailTemplateId,
          toEmail: 'operator@test.itemize',
          sampleData: { first_name: 'Grace' },
          idempotencyKey: `email-test-${Date.now()}`,
        },
      },
    ).expect(200);
    expect(response.body.data.sendEmailTemplateTest).toMatchObject({
      kind: 'test_email',
      contactId: null,
      accepted: true,
    });
    await delivery.runDue();
    expect(emailProvider.send.mock.calls.some(([message]) =>
      message.subject === '[TEST] Hello Grace')).toBe(true);
    const job = await pool.query(
      `SELECT email_log_id, contact_activity_id, status
       FROM message_delivery_jobs WHERE id=$1`,
      [response.body.data.sendEmailTemplateTest.id],
    );
    expect(job.rows[0]).toMatchObject({
      email_log_id: null,
      contact_activity_id: null,
      status: 'provider_accepted',
    });
  });

  it('quarantines ambiguous SMS instead of retrying it', async () => {
    smsProvider.send.mockResolvedValue({
      kind: 'reconciliation',
      message: 'SMS provider outcome is unknown',
    });
    const response = await graphql(
      `mutation Send($input: EnqueueContactSmsInput!) {
        enqueueContactSms(input: $input) { ${fields} }
      }`,
      {
        input: {
          contactId,
          templateId: smsTemplateId,
          idempotencyKey: `sms-contact-${Date.now()}`,
        },
      },
    ).expect(200);
    expect(response.body.errors).toBeUndefined();
    await expect(delivery.runDue()).resolves.toMatchObject({
      reconciliationRequired: 1,
    });
    const job = await pool.query(
      `SELECT status, attempt_count FROM message_delivery_jobs WHERE id=$1`,
      [response.body.data.enqueueContactSms.id],
    );
    expect(job.rows[0]).toMatchObject({
      status: 'reconciliation_required',
      attempt_count: 1,
    });
    await delivery.runDue();
    expect(smsProvider.send).toHaveBeenCalledTimes(1);
  });

  it('requires CSRF before persisting delivery intent', async () => {
    const denied = await graphql(
      `mutation Test($input: SendSmsTemplateTestInput!) {
        sendSmsTemplateTest(input: $input) { id }
      }`,
      {
        input: {
          templateId: smsTemplateId,
          toPhone: '+16025550100',
          idempotencyKey: `csrf-${Date.now()}`,
        },
      },
      false,
    ).expect(200);
    expect(denied.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('rejects exhausted usage without persisting a job', async () => {
    const before = await pool.query<{ sms_limit: number }>(
      `UPDATE organizations SET sms_limit=sms_used
       WHERE id=$1 RETURNING sms_limit`,
      [organizationId],
    );
    const key = `usage-${Date.now()}`;
    try {
      const denied = await graphql(
        `mutation Send($input: EnqueueContactSmsInput!) {
          enqueueContactSms(input: $input) { id }
        }`,
        { input: { contactId, message: 'No quota', idempotencyKey: key } },
      ).expect(200);
      expect(denied.body.errors[0].extensions).toMatchObject({
        code: 'FORBIDDEN',
        reason: 'MESSAGING_USAGE_EXHAUSTED',
      });
      expect((await pool.query(
        `SELECT id FROM message_delivery_jobs
         WHERE organization_id=$1 AND idempotency_key=$2`,
        [organizationId, key],
      )).rows).toHaveLength(0);
    } finally {
      await pool.query(
        'UPDATE organizations SET sms_limit=$2 WHERE id=$1',
        [organizationId, Math.max(Number(before.rows[0].sms_limit) + 100, 100)],
      );
    }
  });
});
