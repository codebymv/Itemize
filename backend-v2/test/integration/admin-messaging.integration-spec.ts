import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { ADMIN_EMAIL_PROVIDER, AdminEmailProvider } from '../../src/admin-messaging/admin-email.provider';
import { AdminEmailDeliveryService } from '../../src/admin-messaging/admin-email-delivery.service';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Admin messaging GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let delivery: AdminEmailDeliveryService;
  let adminId: number;
  let memberId: number;
  let organizationId: number;
  let templateId: number;
  let adminToken: string;
  let memberToken: string;
  const jwt = new JwtService();
  const suffix = `${Date.now()}-${process.pid}`;
  const provider: jest.Mocked<AdminEmailProvider> = { send: jest.fn() };

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required for admin messaging tests');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.FRONTEND_URL = 'https://itemize.test';
    process.env.ADMIN_EMAIL_DELIVERY_SCHEDULER_ENABLED = 'false';
    pool = new Pool({ connectionString, ssl: process.env.TEST_DATABASE_SSL === 'true' });
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email,name,provider,email_verified,role)
       VALUES ($1,'Messaging Admin','email',true,'ADMIN'),($2,'Messaging Member','email',true,'USER') RETURNING id`,
      [`messaging-admin-${suffix}@test.itemize`, `messaging-member-${suffix}@test.itemize`],
    );
    [adminId, memberId] = users.rows.map((row) => Number(row.id));
    const organization = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name,slug) VALUES ('Messaging Cutover',$1) RETURNING id`, [`messaging-cutover-${suffix}`],
    );
    organizationId = Number(organization.rows[0].id);
    await pool.query('UPDATE users SET default_organization_id=$1 WHERE id=ANY($2::int[])', [organizationId, [adminId, memberId]]);
    const template = await pool.query<{ id: number }>(
      `INSERT INTO email_templates (organization_id,name,subject,body_html,category,created_by)
       VALUES ($1,'Admin Welcome','Welcome {{userName}}','<p>Hello {{userEmail}}</p>','onboarding',$2) RETURNING id`,
      [organizationId, adminId],
    );
    templateId = Number(template.rows[0].id);
    adminToken = await jwt.signAsync({ id: adminId }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    memberToken = await jwt.signAsync({ id: memberId }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL).useValue(pool)
      .overrideProvider(ADMIN_EMAIL_PROVIDER).useValue(provider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    configureApp(app);
    await app.init();
    delivery = app.get(AdminEmailDeliveryService);
  });

  afterAll(async () => {
    if (pool && adminId) {
      await pool.query('DELETE FROM email_logs WHERE sent_by=$1 OR recipient_id=ANY($2::int[])', [adminId, [adminId, memberId].filter(Boolean)]);
      await pool.query('DELETE FROM admin_email_batches WHERE requested_by_user_id=$1', [adminId]);
    }
    if (pool && organizationId) await pool.query('DELETE FROM organizations WHERE id=$1', [organizationId]);
    if (pool && (adminId || memberId)) await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [[adminId, memberId].filter(Boolean)]);
    if (app) await app.close();
  });

  const graphql = (query: string, variables: Record<string, unknown> = {}, token = adminToken, csrf = false) => {
    const call = request(app.getHttpServer()).post('/graphql')
      .set('Cookie', csrf ? `itemize_auth=${token}; csrf-token=messaging-csrf` : `itemize_auth=${token}`);
    if (csrf) call.set('x-csrf-token', 'messaging-csrf');
    return call.send({ query, variables });
  };

  it('denies anonymous and non-admin audit access', async () => {
    const anonymous = await request(app.getHttpServer()).post('/graphql')
      .send({ query: '{ adminEmailLogs { total } }' }).expect(200);
    expect(anonymous.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    const member = await graphql('{ adminEmailTemplates { total } }', {}, memberToken).expect(200);
    expect(member.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('lists global templates with stable filters and renders preview without delivery side effects', async () => {
    const listed = await graphql(
      `query Templates($input:AdminEmailTemplateFilterInput){adminEmailTemplates(input:$input){
        templates{id name subject bodyHtml category organizationId organizationName createdBy createdByName createdAt updatedAt} total}}`,
      { input: { category: 'onboarding', search: 'Welcome' } },
    ).expect(200);
    expect(listed.body.errors).toBeUndefined();
    expect(listed.body.data.adminEmailTemplates).toMatchObject({
      templates: [expect.objectContaining({ id: templateId, organizationId, name: 'Admin Welcome' })], total: 1,
    });
    const preview = await graphql(
      `mutation Preview($input:AdminEmailPreviewInput!){previewAdminEmail(input:$input){subject html}}`,
      { input: { subject: 'Hi {{userName}}', bodyHtml: '<p>{{userEmail}}</p>', baseUrl: 'https://preview.itemize.test/path' } },
      adminToken, true,
    ).expect(200);
    expect(preview.body.data.previewAdminEmail.subject).toBe('Hi John Doe');
    expect(preview.body.data.previewAdminEmail.html).toContain('https://preview.itemize.test/cover.png');
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('requires CSRF, commits intent plus logs atomically, and replays idempotently', async () => {
    const mutation = `mutation Enqueue($input:AdminEmailBatchInput!){enqueueAdminEmailBatch(input:$input){batchId status accepted replayed}}`;
    const input = {
      idempotencyKey: `admin-messaging-${suffix}`,
      recipients: [{ id: memberId, email: `messaging-member-${suffix}@test.itemize`, name: 'Messaging Member' }],
      subject: 'Hello {{ userName }}', bodyHtml: '<p>Account: {{userEmail}}</p>',
    };
    const blocked = await graphql(mutation, { input }).expect(200);
    expect(blocked.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const queued = await graphql(mutation, { input }, adminToken, true).expect(200);
    expect(queued.body.errors).toBeUndefined();
    expect(queued.body.data.enqueueAdminEmailBatch).toMatchObject({ status: 'queued', accepted: 1, replayed: false });
    const batchId = queued.body.data.enqueueAdminEmailBatch.batchId;
    const stored = await pool.query<{ delivery_status: string; log_status: string; body_html: string; recipient_id: number }>(
      `SELECT delivery.status delivery_status, log.status log_status, delivery.body_html, log.recipient_id
       FROM admin_email_deliveries delivery JOIN email_logs log ON log.id=delivery.email_log_id
       WHERE delivery.batch_id=$1`, [batchId],
    );
    expect(stored.rows[0]).toMatchObject({ delivery_status: 'queued', log_status: 'queued', recipient_id: memberId });
    expect(stored.rows[0].body_html).toContain(`messaging-member-${suffix}@test.itemize`);
    expect(provider.send).not.toHaveBeenCalled();

    const replay = await graphql(mutation, { input }, adminToken, true).expect(200);
    expect(replay.body.data.enqueueAdminEmailBatch).toMatchObject({ batchId, accepted: 1, replayed: true });
    const deliveries = await pool.query<{ count: number }>('SELECT COUNT(*)::int count FROM admin_email_deliveries WHERE batch_id=$1', [batchId]);
    expect(deliveries.rows[0].count).toBe(1);
    const conflict = await graphql(mutation, { input: { ...input, subject: 'Different' } }, adminToken, true).expect(200);
    expect(conflict.body.errors[0].extensions).toMatchObject({ code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('leases queued delivery, records provider acceptance, and exposes list/detail audit shapes', async () => {
    provider.send.mockResolvedValue({ kind: 'sent', providerId: `provider-${suffix}` });
    await expect(delivery.runDue(10)).resolves.toMatchObject({ attempted: 1, sent: 1 });
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: expect.stringMatching(/^admin-email:/) }));
    const list = await graphql('{adminEmailLogs(input:{page:0,limit:1,status:"sent"}){logs{id recipientEmail bodyHtml status externalId sentAt createdAt} total hasMore}}').expect(200);
    expect(list.body.errors).toBeUndefined();
    expect(list.body.data.adminEmailLogs.logs[0]).toMatchObject({ bodyHtml: null, status: 'sent', externalId: `provider-${suffix}` });
    const logId = list.body.data.adminEmailLogs.logs[0].id;
    const detail = await graphql('query Log($id:Int!){adminEmailLog(id:$id){id bodyHtml status externalId sentBy sentByName sentByEmail}}', { id: logId }).expect(200);
    expect(detail.body.data.adminEmailLog).toMatchObject({ id: logId, status: 'sent', externalId: `provider-${suffix}`, sentBy: adminId });
    expect(detail.body.data.adminEmailLog.bodyHtml).toContain('Messaging Member');
  });
});
