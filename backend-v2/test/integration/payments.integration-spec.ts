import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Payment history GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberToken: string;
  let outsiderToken: string;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for payment tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({ connectionString });
    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Payment Member', 'email', true),
              ($2, 'Payment Outsider', 'email', true)
       RETURNING id`,
      [`payment-member-${suffix}@test.itemize`, `payment-outsider-${suffix}@test.itemize`],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Payment Primary', $1), ('Payment Other', $2)
       RETURNING id`,
      [`payment-primary-${suffix}`, `payment-other-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $3, 'owner', NOW()), ($2, $4, 'owner', NOW())`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    await pool.query(
      `UPDATE users SET default_organization_id = CASE id
         WHEN $3 THEN $1 WHEN $4 THEN $2 ELSE default_organization_id END
       WHERE id = ANY($5::int[])`,
      [
        organizationId,
        outsiderOrganizationId,
        memberId,
        outsiderId,
        [memberId, outsiderId],
      ],
    );
    const contact = await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id, first_name, last_name, email)
       VALUES ($1, 'Ada', 'Lovelace', $2) RETURNING id`,
      [organizationId, `ada-${suffix}@test.itemize`],
    );
    const invoice = await pool.query<{ id: number }>(
      `INSERT INTO invoices (
         organization_id, invoice_number, customer_name, contact_id,
         issue_date, due_date, subtotal, total, amount_due, currency, status
       ) VALUES (
         $1, $2, 'Fallback Name', $3, CURRENT_DATE, CURRENT_DATE + 30,
         100, 100, 100, 'USD', 'sent'
       )
       RETURNING id`,
      [organizationId, `INV-${suffix}`, contact.rows[0].id],
    );
    await pool.query(
      `INSERT INTO payments (
         organization_id, invoice_id, contact_id, amount, currency,
         payment_method, status, paid_at, created_at
       ) VALUES
         ($1, $2, $3, 10.50, 'USD', 'card', 'succeeded', NOW(), NOW() - INTERVAL '1 minute'),
         ($1, $2, $3, 20.25, 'USD', 'bank_transfer', 'pending', NULL, NOW())`,
      [organizationId, invoice.rows[0].id, contact.rows[0].id],
    );
    await pool.query(
      `INSERT INTO payments (
         organization_id, amount, currency, payment_method, status
       ) VALUES ($1, 999, 'USD', 'cash', 'succeeded')`,
      [outsiderOrganizationId],
    );
    memberToken = await jwt.signAsync(
      { id: memberId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
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
  });

  afterAll(async () => {
    if (pool && (organizationId || outsiderOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [
        [organizationId, outsiderOrganizationId].filter(Boolean),
      ]);
    }
    if (pool && (memberId || outsiderId)) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        [memberId, outsiderId].filter(Boolean),
      ]);
    }
    if (app) await app.close();
  });

  const query = (token: string, orgId: number, variables = {}) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId))
      .send({
        query: `query Payments(
          $page: PageInput,
          $status: PaymentStatus,
          $paymentMethod: PaymentMethod
        ) {
          payments(page: $page, status: $status, paymentMethod: $paymentMethod) {
            nodes {
              id organizationId invoiceNumber contactName amount currency
              paymentMethod status paidAt createdAt
            }
            pageInfo { page pageSize total totalPages }
          }
        }`,
        variables,
      });

  it('returns deterministic tenant-scoped history and joined display fields', async () => {
    const response = await query(memberToken, organizationId, {
      page: { page: 1, pageSize: 10 },
    }).expect(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.payments.pageInfo.total).toBe(2);
    expect(response.body.data.payments.nodes).toMatchObject([
      {
        organizationId,
        contactName: 'Ada Lovelace',
        amount: '20.25',
        paymentMethod: 'BANK_TRANSFER',
        status: 'PENDING',
      },
      {
        organizationId,
        invoiceNumber: expect.stringContaining('INV-'),
        amount: '10.50',
      },
    ]);
  });

  it('applies typed filters, bounded pages, and selected-tenant isolation', async () => {
    const filtered = await query(memberToken, organizationId, {
      status: 'SUCCEEDED',
      paymentMethod: 'CARD',
    }).expect(200);
    expect(filtered.body.data.payments.pageInfo.total).toBe(1);
    expect(filtered.body.data.payments.nodes[0].amount).toBe('10.50');

    const invalid = await query(memberToken, organizationId, {
      page: { page: 1, pageSize: 101 },
    }).expect(200);
    expect(invalid.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');

    const outsider = await query(
      outsiderToken,
      outsiderOrganizationId,
    ).expect(200);
    expect(outsider.body.data.payments.pageInfo.total).toBe(1);
    expect(outsider.body.data.payments.nodes[0].amount).toBe('999.00');
  });
});
