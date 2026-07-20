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
import { EstimateEmailDeliveryService } from '../../src/estimates/estimate-email-delivery.service';
import { ESTIMATE_EMAIL_PROVIDER } from '../../src/estimates/estimate-email.provider';
import { RecurringInvoicesService } from '../../src/recurring-invoices/recurring-invoices.service';
import {
  INVOICE_EMAIL_PROVIDER,
  INVOICE_PAYMENT_LINK_PROVIDER,
  INVOICE_PDF_RENDERER,
} from '../../src/invoices/invoice-delivery.providers';

describe('Core invoice GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberToken: string;
  let outsiderToken: string;
  let contactId: number;
  let outsiderContactId: number;
  let businessId: number;
  let productId: number;
  let recurringInvoicesService: RecurringInvoicesService;
  let estimateEmailDeliveryService: EstimateEmailDeliveryService;
  const estimateEmailProvider = { send: jest.fn() };
  const invoiceEmailProvider = { send: jest.fn() };
  const invoicePaymentLinkProvider = { getOrCreate: jest.fn() };
  const invoicePdfRenderer = { render: jest.fn() };
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for invoice tests');
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
       VALUES ($1, 'Invoice Member', 'email', true),
              ($2, 'Invoice Outsider', 'email', true)
       RETURNING id`,
      [
        `invoice-member-${suffix}@test.itemize`,
        `invoice-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Invoice Primary', $1), ('Invoice Other', $2)
       RETURNING id`,
      [`invoice-primary-${suffix}`, `invoice-other-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (
         organization_id, user_id, role, joined_at
       ) VALUES ($1, $3, 'owner', NOW()), ($2, $4, 'owner', NOW())`,
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
    const contacts = await pool.query<{ id: number }>(
      `INSERT INTO contacts (
         organization_id, first_name, last_name, email, created_by
       ) VALUES
         ($1, 'Ada', 'Lovelace', $3, $5),
         ($2, 'Grace', 'Hopper', $4, $6)
       RETURNING id`,
      [
        organizationId,
        outsiderOrganizationId,
        `ada-${suffix}@test.itemize`,
        `grace-${suffix}@test.itemize`,
        memberId,
        outsiderId,
      ],
    );
    [contactId, outsiderContactId] = contacts.rows.map((row) => Number(row.id));
    businessId = Number((await pool.query<{ id: number }>(
      `INSERT INTO businesses (organization_id, name)
       VALUES ($1, 'Primary Business') RETURNING id`,
      [organizationId],
    )).rows[0].id);
    productId = Number((await pool.query<{ id: number }>(
      `INSERT INTO products (
         organization_id, name, price, currency, product_type, created_by
       ) VALUES ($1, 'Consulting', 12.50, 'USD', 'one_time', $2)
       RETURNING id`,
      [organizationId, memberId],
    )).rows[0].id);
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
      .overrideProvider(ESTIMATE_EMAIL_PROVIDER)
      .useValue(estimateEmailProvider)
      .overrideProvider(INVOICE_EMAIL_PROVIDER)
      .useValue(invoiceEmailProvider)
      .overrideProvider(INVOICE_PAYMENT_LINK_PROVIDER)
      .useValue(invoicePaymentLinkProvider)
      .overrideProvider(INVOICE_PDF_RENDERER)
      .useValue(invoicePdfRenderer)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    recurringInvoicesService = moduleRef.get(RecurringInvoicesService);
    estimateEmailDeliveryService = moduleRef.get(EstimateEmailDeliveryService);
    configureApp(app);
    await app.init();

    const createCrudRouter =
      require('../../../backend/src/routes/invoices/crud.routes');
    const createSettingsRouter =
      require('../../../backend/src/routes/invoices/settings.routes');
    const createEmailPreviewRouter =
      require('../../../backend/src/routes/invoices/email-preview.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    const { requireOrganization } =
      require('../../../backend/src/middleware/organization')(pool);
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    const createEstimateRouter =
      require('../../../backend/src/routes/estimates.routes');
    legacyApp.use(
      '/api/invoices/estimates',
      createEstimateRouter(pool, authenticateJWT),
    );
    const createRecurringRouter =
      require('../../../backend/src/routes/recurring.routes');
    legacyApp.use(
      '/api/invoices/recurring',
      createRecurringRouter(pool, authenticateJWT),
    );
    legacyApp.use(
      '/api/invoices',
      createSettingsRouter({ pool, authenticateJWT, requireOrganization }),
    );
    legacyApp.use(
      '/api/invoices',
      createEmailPreviewRouter({ pool, authenticateJWT, requireOrganization }),
    );
    legacyApp.use(
      '/api/invoices',
      createCrudRouter({ pool, authenticateJWT, requireOrganization }),
    );
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

  const graphql = (
    token: string,
    orgId: number,
    document: string,
    variables: Record<string, unknown> = {},
    csrf = true,
  ) => {
    const call = request(app.getHttpServer())
      .post('/graphql')
      .set(
        'Cookie',
        csrf
          ? `itemize_auth=${token}; csrf-token=invoice-csrf`
          : `itemize_auth=${token}`,
      )
      .set('x-organization-id', String(orgId));
    if (csrf) call.set('x-csrf-token', 'invoice-csrf');
    return call.send({ query: document, variables });
  };

  const createMutation = `
    mutation Create($input: CreateInvoiceInput!) {
      createInvoice(input: $input) {
        id organizationId invoiceNumber contactId businessId status
        subtotal taxRate taxAmount discountAmount total amountDue
        issueDate dueDate
        items {
          id productId name quantity unitPrice taxRate taxAmount total sortOrder
        }
      }
    }
  `;

  const input = () => ({
    contactId,
    businessId,
    customerName: 'Ada Lovelace',
    customerEmail: 'ada@example.com',
    issueDate: '2026-07-18',
    dueDate: '2026-08-17',
    taxRate: '8.25',
    discountType: 'fixed',
    discountValue: '1.00',
    items: [
      {
        productId,
        name: 'Consulting',
        quantity: '2',
        unitPrice: '12.50',
        taxRate: '5',
      },
    ],
  });

  const sendInvoiceMutation = `
    mutation SendInvoice($id: Int!, $input: SendInvoiceInput!) {
      sendInvoice(id: $id, input: $input) {
        success emailSent replayed deliveryId status
      }
    }
  `;

  const sendInput = (key: string) => ({
    idempotencyKey: key,
    subject: 'Your invoice',
    message: 'Please review and pay this invoice.',
    ccEmails: ['owner@example.com'],
    includePaymentLink: true,
    resend: false,
  });

  const paymentLinkMutation = `
    mutation CreateInvoicePaymentLink(
      $id: Int!, $input: CreateInvoicePaymentLinkInput!
    ) {
      createInvoicePaymentLink(id: $id, input: $input) {
        success replayed intentId status url sessionId
      }
    }
  `;

  it('creates atomically, calculates decimals in PostgreSQL, and interoperates with REST', async () => {
    const created = await graphql(
      memberToken,
      organizationId,
      createMutation,
      { input: input() },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createInvoice).toMatchObject({
      organizationId,
      contactId,
      businessId,
      status: 'draft',
      subtotal: '25.00',
      taxRate: '8.25',
      taxAmount: '2.06',
      discountAmount: '1.00',
      total: '26.06',
      amountDue: '26.06',
      items: [{
        productId,
        quantity: '2.00',
        unitPrice: '12.50',
        taxAmount: '1.25',
        total: '26.25',
        sortOrder: 0,
      }],
    });
    const id = Number(created.body.data.createInvoice.id);
    const rest = await request(legacyApp)
      .get(`/api/invoices/${id}`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    expect(rest.body.data).toMatchObject({
      id,
      invoice_number: created.body.data.createInvoice.invoiceNumber,
      total: '26.06',
    });

    const listed = await graphql(
      memberToken,
      organizationId,
      `query List($filter: InvoiceFilterInput, $page: PageInput) {
        invoices(filter: $filter, page: $page) {
          nodes { id invoiceNumber total }
          pageInfo { page pageSize total totalPages }
        }
      }`,
      {
        filter: { status: 'draft', search: 'Ada' },
        page: { page: 1, pageSize: 10 },
      },
      false,
    ).expect(200);
    expect(listed.body.errors).toBeUndefined();
    expect(listed.body.data.invoices.nodes.map(
      (row: { id: number }) => Number(row.id),
    )).toContain(id);

    const updated = await graphql(
      memberToken,
      organizationId,
      `mutation Update($id: Int!, $input: UpdateInvoiceInput!) {
        updateInvoice(id: $id, input: $input) {
          id notes subtotal total items { name sortOrder }
        }
      }`,
      {
        id,
        input: {
          notes: 'Repriced',
          taxRate: '0',
          discountType: null,
          discountValue: '0',
          items: [{
            name: 'Repriced service',
            quantity: '3',
            unitPrice: '10',
            taxRate: '0',
          }],
        },
      },
    ).expect(200);
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data.updateInvoice).toMatchObject({
      notes: 'Repriced',
      subtotal: '30.00',
      total: '30.00',
      items: [{ name: 'Repriced service', sortOrder: 0 }],
    });

    const deleted = await graphql(
      memberToken,
      organizationId,
      `mutation Delete($id: Int!) {
        deleteInvoice(id: $id) { success deletedId invoiceNumber }
      }`,
      { id },
    ).expect(200);
    expect(deleted.body.errors).toBeUndefined();
    expect(deleted.body.data.deleteInvoice).toMatchObject({
      success: true,
      deletedId: id,
    });
  });

  it('sends invoices durably and leaves every unconfirmed delivery unsent', async () => {
    invoiceEmailProvider.send.mockReset();
    invoicePaymentLinkProvider.getOrCreate.mockReset();
    invoicePdfRenderer.render.mockReset();
    invoicePaymentLinkProvider.getOrCreate.mockResolvedValue({
      kind: 'ready', sessionId: 'cs_invoice_send', url: 'https://pay.test/invoice',
    });
    invoicePdfRenderer.render.mockResolvedValue(Buffer.from('invoice-pdf'));
    invoiceEmailProvider.send.mockResolvedValue({ kind: 'sent', providerId: 'email-1' });

    const created = await graphql(
      memberToken, organizationId, createMutation, { input: input() },
    ).expect(200);
    const id = Number(created.body.data.createInvoice.id);

    const noCsrf = await graphql(
      memberToken, organizationId, sendInvoiceMutation,
      { id, input: sendInput('invoice-no-csrf') }, false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const hidden = await graphql(
      outsiderToken, outsiderOrganizationId, sendInvoiceMutation,
      { id, input: sendInput('invoice-hidden') },
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const sent = await graphql(
      memberToken, organizationId, sendInvoiceMutation,
      { id, input: sendInput('invoice-success') },
    ).expect(200);
    expect(sent.body.errors).toBeUndefined();
    expect(sent.body.data.sendInvoice).toMatchObject({
      success: true, emailSent: true, replayed: false, status: 'SENT',
    });
    expect(invoicePaymentLinkProvider.getOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: id, amountDue: '26.06' }),
    );
    expect(invoiceEmailProvider.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ada@example.com',
      cc: ['owner@example.com'],
      html: expect.stringContaining('https://pay.test/invoice'),
      filename: expect.stringMatching(/^.+\.pdf$/),
      pdf: Buffer.from('invoice-pdf'),
    }));
    const committed = await pool.query(
      `SELECT i.status, i.sent_at IS NOT NULL AS sent,
              i.stripe_payment_intent_id, i.stripe_hosted_invoice_url,
              d.status AS delivery_status, d.provider_id
       FROM invoices i JOIN invoice_email_deliveries d ON d.invoice_id = i.id
       WHERE i.id = $1 AND i.organization_id = $2`,
      [id, organizationId],
    );
    expect(committed.rows[0]).toMatchObject({
      status: 'sent', sent: true, stripe_payment_intent_id: 'cs_invoice_send',
      stripe_hosted_invoice_url: 'https://pay.test/invoice',
      delivery_status: 'sent', provider_id: 'email-1',
    });

    const replay = await graphql(
      memberToken, organizationId, sendInvoiceMutation,
      { id, input: sendInput('invoice-success') },
    ).expect(200);
    expect(replay.body.data.sendInvoice).toMatchObject({
      success: true, emailSent: true, replayed: true, status: 'SENT',
    });
    expect(invoiceEmailProvider.send).toHaveBeenCalledTimes(1);
    const conflictingReplay = await graphql(
      memberToken, organizationId, sendInvoiceMutation,
      { id, input: { ...sendInput('invoice-success'), subject: 'Different request' } },
    ).expect(200);
    expect(conflictingReplay.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT', reason: 'INVOICE_SEND_IDEMPOTENCY_CONFLICT',
    });
    expect(invoiceEmailProvider.send).toHaveBeenCalledTimes(1);

    const rejectedCreate = await graphql(
      memberToken, organizationId, createMutation, { input: input() },
    ).expect(200);
    const rejectedId = Number(rejectedCreate.body.data.createInvoice.id);
    invoiceEmailProvider.send.mockResolvedValueOnce({
      kind: 'rejected', message: 'provider rejected',
    });
    const rejected = await graphql(
      memberToken, organizationId, sendInvoiceMutation,
      { id: rejectedId, input: { ...sendInput('invoice-rejected'), includePaymentLink: false } },
    ).expect(200);
    expect(rejected.body.data.sendInvoice).toMatchObject({
      success: false, emailSent: false, status: 'RETRY',
    });
    expect((await pool.query(
      'SELECT status, sent_at FROM invoices WHERE id = $1', [rejectedId],
    )).rows[0]).toEqual({ status: 'draft', sent_at: null });

    const pdfCreate = await graphql(
      memberToken, organizationId, createMutation, { input: input() },
    ).expect(200);
    const pdfId = Number(pdfCreate.body.data.createInvoice.id);
    invoicePdfRenderer.render.mockRejectedValueOnce(new Error('renderer failed'));
    const callsBeforePdfFailure = invoiceEmailProvider.send.mock.calls.length;
    const pdfFailed = await graphql(
      memberToken, organizationId, sendInvoiceMutation,
      { id: pdfId, input: { ...sendInput('invoice-pdf-failed'), includePaymentLink: false } },
    ).expect(200);
    expect(pdfFailed.body.data.sendInvoice.status).toBe('RETRY');
    expect(invoiceEmailProvider.send).toHaveBeenCalledTimes(callsBeforePdfFailure);
    expect((await pool.query(
      'SELECT status, sent_at FROM invoices WHERE id = $1', [pdfId],
    )).rows[0]).toEqual({ status: 'draft', sent_at: null });

    const ambiguousCreate = await graphql(
      memberToken, organizationId, createMutation, { input: input() },
    ).expect(200);
    const ambiguousId = Number(ambiguousCreate.body.data.createInvoice.id);
    invoiceEmailProvider.send.mockRejectedValueOnce(new Error('connection reset'));
    const ambiguous = await graphql(
      memberToken, organizationId, sendInvoiceMutation,
      { id: ambiguousId, input: { ...sendInput('invoice-ambiguous'), includePaymentLink: false } },
    ).expect(200);
    expect(ambiguous.body.data.sendInvoice.status).toBe('RECONCILIATION_REQUIRED');
    expect((await pool.query(
      'SELECT status, sent_at FROM invoices WHERE id = $1', [ambiguousId],
    )).rows[0]).toEqual({ status: 'draft', sent_at: null });
    const bypass = await graphql(
      memberToken, organizationId, sendInvoiceMutation,
      { id: ambiguousId, input: { ...sendInput('invoice-bypass'), includePaymentLink: false } },
    ).expect(200);
    expect(bypass.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT', reason: 'INVOICE_DELIVERY_IN_PROGRESS',
    });
  });

  it('creates replay-safe payment links and fences stale or ambiguous outcomes', async () => {
    invoicePaymentLinkProvider.getOrCreate.mockReset();
    invoicePaymentLinkProvider.getOrCreate.mockResolvedValue({
      kind: 'ready', sessionId: 'cs_payment_link', url: 'https://pay.test/ready',
    });
    const created = await graphql(
      memberToken, organizationId, createMutation, { input: input() },
    ).expect(200);
    const id = Number(created.body.data.createInvoice.id);

    const noCsrf = await graphql(
      memberToken, organizationId, paymentLinkMutation,
      { id, input: { idempotencyKey: 'payment-no-csrf' } }, false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const hidden = await graphql(
      outsiderToken, outsiderOrganizationId, paymentLinkMutation,
      { id, input: { idempotencyKey: 'payment-hidden' } },
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const ready = await graphql(
      memberToken, organizationId, paymentLinkMutation,
      { id, input: { idempotencyKey: 'payment-ready' } },
    ).expect(200);
    expect(ready.body.errors).toBeUndefined();
    expect(ready.body.data.createInvoicePaymentLink).toMatchObject({
      success: true, replayed: false, status: 'READY',
      url: 'https://pay.test/ready', sessionId: 'cs_payment_link',
    });
    expect(invoicePaymentLinkProvider.getOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: id, organizationId, amountDue: '26.06',
        existingSessionId: null,
      }),
    );
    const replay = await graphql(
      memberToken, organizationId, paymentLinkMutation,
      { id, input: { idempotencyKey: 'payment-ready' } },
    ).expect(200);
    expect(replay.body.data.createInvoicePaymentLink).toMatchObject({
      success: true, replayed: true, status: 'READY',
      url: 'https://pay.test/ready', sessionId: 'cs_payment_link',
    });
    expect(invoicePaymentLinkProvider.getOrCreate).toHaveBeenCalledTimes(1);
    expect((await pool.query(
      `SELECT stripe_payment_intent_id, stripe_hosted_invoice_url
       FROM invoices WHERE id = $1`, [id],
    )).rows[0]).toEqual({
      stripe_payment_intent_id: 'cs_payment_link',
      stripe_hosted_invoice_url: 'https://pay.test/ready',
    });

    await pool.query(
      'UPDATE invoices SET amount_due = amount_due - 1 WHERE id = $1', [id],
    );
    const staleReplay = await graphql(
      memberToken, organizationId, paymentLinkMutation,
      { id, input: { idempotencyKey: 'payment-ready' } },
    ).expect(200);
    expect(staleReplay.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT', reason: 'INVOICE_PAYMENT_LINK_IDEMPOTENCY_CONFLICT',
    });

    const paidCreate = await graphql(
      memberToken, organizationId, createMutation, { input: input() },
    ).expect(200);
    const paidId = Number(paidCreate.body.data.createInvoice.id);
    await pool.query(
      `UPDATE invoices SET status = 'paid', amount_due = 0 WHERE id = $1`,
      [paidId],
    );
    const callsBeforePaid = invoicePaymentLinkProvider.getOrCreate.mock.calls.length;
    const paid = await graphql(
      memberToken, organizationId, paymentLinkMutation,
      { id: paidId, input: { idempotencyKey: 'payment-paid' } },
    ).expect(200);
    expect(paid.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT', reason: 'INVOICE_NOT_PAYABLE',
    });
    expect(invoicePaymentLinkProvider.getOrCreate).toHaveBeenCalledTimes(callsBeforePaid);

    const rejectedCreate = await graphql(
      memberToken, organizationId, createMutation, { input: input() },
    ).expect(200);
    const rejectedId = Number(rejectedCreate.body.data.createInvoice.id);
    invoicePaymentLinkProvider.getOrCreate.mockResolvedValueOnce({
      kind: 'rejected', message: 'Stripe rejected the request',
    });
    const rejected = await graphql(
      memberToken, organizationId, paymentLinkMutation,
      { id: rejectedId, input: { idempotencyKey: 'payment-rejected' } },
    ).expect(200);
    expect(rejected.body.data.createInvoicePaymentLink).toMatchObject({
      success: false, status: 'REJECTED', url: null, sessionId: null,
    });
    invoicePaymentLinkProvider.getOrCreate.mockResolvedValueOnce({
      kind: 'ready', sessionId: 'cs_retry', url: 'https://pay.test/retry',
    });
    const retried = await graphql(
      memberToken, organizationId, paymentLinkMutation,
      { id: rejectedId, input: { idempotencyKey: 'payment-retry' } },
    ).expect(200);
    expect(retried.body.data.createInvoicePaymentLink).toMatchObject({
      success: true, status: 'READY', sessionId: 'cs_retry',
    });

    const ambiguousCreate = await graphql(
      memberToken, organizationId, createMutation, { input: input() },
    ).expect(200);
    const ambiguousId = Number(ambiguousCreate.body.data.createInvoice.id);
    invoicePaymentLinkProvider.getOrCreate.mockRejectedValueOnce(
      new Error('connection reset after request'),
    );
    const ambiguous = await graphql(
      memberToken, organizationId, paymentLinkMutation,
      { id: ambiguousId, input: { idempotencyKey: 'payment-ambiguous' } },
    ).expect(200);
    expect(ambiguous.body.data.createInvoicePaymentLink).toMatchObject({
      success: false, status: 'RECONCILIATION_REQUIRED',
      url: null, sessionId: null,
    });
    const bypass = await graphql(
      memberToken, organizationId, paymentLinkMutation,
      { id: ambiguousId, input: { idempotencyKey: 'payment-bypass' } },
    ).expect(200);
    expect(bypass.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT', reason: 'INVOICE_PAYMENT_LINK_IN_PROGRESS',
    });

    const racedCreate = await graphql(
      memberToken, organizationId, createMutation, { input: input() },
    ).expect(200);
    const racedId = Number(racedCreate.body.data.createInvoice.id);
    invoicePaymentLinkProvider.getOrCreate.mockImplementationOnce(async () => {
      await pool.query(
        'UPDATE invoices SET amount_due = amount_due - 1 WHERE id = $1',
        [racedId],
      );
      return {
        kind: 'ready', sessionId: 'cs_stale_race',
        url: 'https://pay.test/stale-race',
      };
    });
    const raced = await graphql(
      memberToken, organizationId, paymentLinkMutation,
      { id: racedId, input: { idempotencyKey: 'payment-stale-race' } },
    ).expect(200);
    expect(raced.body.data.createInvoicePaymentLink).toMatchObject({
      success: false, status: 'RECONCILIATION_REQUIRED',
      url: null, sessionId: null,
    });
    expect((await pool.query(
      `SELECT stripe_payment_intent_id, stripe_hosted_invoice_url
       FROM invoices WHERE id = $1`, [racedId],
    )).rows[0]).toEqual({
      stripe_payment_intent_id: null, stripe_hosted_invoice_url: null,
    });
  });

  it('enforces CSRF, tenant-hidden references, and locked edit states', async () => {
    const noCsrf = await graphql(
      memberToken,
      organizationId,
      createMutation,
      { input: input() },
      false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const foreignReference = await graphql(
      memberToken,
      organizationId,
      createMutation,
      { input: { ...input(), contactId: outsiderContactId } },
    ).expect(200);
    expect(foreignReference.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const invalidDates = await graphql(
      memberToken,
      organizationId,
      createMutation,
      {
        input: {
          ...input(),
          issueDate: '2026-02-02',
          dueDate: '2026-02-01',
        },
      },
    ).expect(200);
    expect(invalidDates.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_INVOICE_DATE_ORDER',
    });

    const created = await graphql(
      memberToken,
      organizationId,
      createMutation,
      { input: input() },
    ).expect(200);
    const id = Number(created.body.data.createInvoice.id);
    await pool.query(
      `UPDATE invoices SET status = 'paid'
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    const locked = await graphql(
      memberToken,
      organizationId,
      `mutation Update($id: Int!, $input: UpdateInvoiceInput!) {
        updateInvoice(id: $id, input: $input) { id }
      }`,
      { id, input: { notes: 'Forbidden edit' } },
    ).expect(200);
    expect(locked.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'NOT_EDITABLE',
    });
    const hidden = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query Invoice($id: Int!) { invoice(id: $id) { id } }`,
      { id },
      false,
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('allocates unique invoice numbers for concurrent creates', async () => {
    const [first, second] = await Promise.all([
      graphql(memberToken, organizationId, createMutation, { input: input() }),
      graphql(memberToken, organizationId, createMutation, { input: input() }),
    ]);
    expect(first.body.errors).toBeUndefined();
    expect(second.body.errors).toBeUndefined();
    expect(first.body.data.createInvoice.invoiceNumber)
      .not.toBe(second.body.data.createInvoice.invoiceNumber);
  });

  it('updates invoice settings safely and serializes against number allocation', async () => {
    await pool.query(
      `INSERT INTO payment_settings (
         organization_id, invoice_prefix, next_invoice_number,
         default_payment_terms, default_tax_rate, default_currency
       ) VALUES ($1, 'SET-', 900, 30, 10, 'USD')
       ON CONFLICT (organization_id) DO UPDATE SET
         invoice_prefix = EXCLUDED.invoice_prefix,
         next_invoice_number = EXCLUDED.next_invoice_number,
         default_payment_terms = EXCLUDED.default_payment_terms,
         default_tax_rate = EXCLUDED.default_tax_rate,
         default_currency = EXCLUDED.default_currency`,
      [organizationId],
    );
    await pool.query(
      `INSERT INTO payment_settings (
         organization_id, invoice_prefix, next_invoice_number
       ) VALUES ($1, 'OTHER-', 33)
       ON CONFLICT (organization_id) DO UPDATE SET
         invoice_prefix = EXCLUDED.invoice_prefix,
         next_invoice_number = EXCLUDED.next_invoice_number`,
      [outsiderOrganizationId],
    );
    const settingsFields = `
      id organizationId stripeAccountId stripeConnected invoicePrefix
      nextInvoiceNumber defaultPaymentTerms defaultNotes defaultTerms
      defaultTaxRate taxId businessName businessAddress businessPhone
      businessEmail logoUrl defaultCurrency createdAt updatedAt
    `;
    const settingsQuery = `query Settings { invoiceSettings { ${settingsFields} } }`;
    const initial = await graphql(
      memberToken,
      organizationId,
      settingsQuery,
      {},
      false,
    ).expect(200);
    expect(initial.body.data.invoiceSettings).toMatchObject({
      organizationId,
      invoicePrefix: 'SET-',
      nextInvoiceNumber: 900,
      defaultTaxRate: '10.00',
    });
    const outsider = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      settingsQuery,
      {},
      false,
    ).expect(200);
    expect(outsider.body.data.invoiceSettings).toMatchObject({
      organizationId: outsiderOrganizationId,
      invoicePrefix: 'OTHER-',
      nextInvoiceNumber: 33,
    });

    const updateSettings = `
      mutation UpdateSettings($input: UpdateInvoiceSettingsInput!) {
        updateInvoiceSettings(input: $input) { ${settingsFields} }
      }
    `;
    const settingsInput = {
      invoicePrefix: 'SET-',
      nextInvoiceNumber: 901,
      defaultPaymentTerms: 14,
      defaultNotes: null,
      defaultTerms: 'Net 14',
      defaultTaxRate: '8.25',
      taxId: 'TAX-123',
      businessName: 'Settings Studio',
      businessAddress: 'Phoenix, AZ',
      businessPhone: '555-0100',
      businessEmail: 'billing@example.com',
      defaultCurrency: 'usd',
    };
    const noCsrf = await graphql(
      memberToken,
      organizationId,
      updateSettings,
      { input: settingsInput },
      false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const updated = await graphql(
      memberToken,
      organizationId,
      updateSettings,
      { input: settingsInput },
    ).expect(200);
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data.updateInvoiceSettings).toMatchObject({
      organizationId,
      invoicePrefix: 'SET-',
      nextInvoiceNumber: 901,
      defaultPaymentTerms: 14,
      defaultNotes: null,
      defaultTerms: 'Net 14',
      defaultTaxRate: '8.25',
      businessEmail: 'billing@example.com',
      defaultCurrency: 'USD',
    });
    const retained = await request(legacyApp)
      .get('/api/invoices/settings')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    expect(retained.body.data).toMatchObject({
      invoice_prefix: 'SET-',
      next_invoice_number: 901,
      default_payment_terms: 14,
      default_tax_rate: '8.25',
      business_email: 'billing@example.com',
      default_currency: 'USD',
    });

    const regression = await graphql(
      memberToken,
      organizationId,
      updateSettings,
      { input: { nextInvoiceNumber: 900 } },
    ).expect(200);
    expect(regression.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'INVOICE_COUNTER_REGRESSION',
      current: 901,
    });
    await pool.query(
      `INSERT INTO invoices (
         organization_id, invoice_number, due_date, total, amount_due, created_by
       ) VALUES ($1, 'SET-00902', CURRENT_DATE, 0, 0, $2)`,
      [organizationId, memberId],
    );
    const collision = await graphql(
      memberToken,
      organizationId,
      updateSettings,
      { input: { nextInvoiceNumber: 902 } },
    ).expect(200);
    expect(collision.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'INVOICE_NUMBER_ALREADY_EXISTS',
    });

    const [settingsRace, invoiceRace] = await Promise.all([
      graphql(
        memberToken,
        organizationId,
        updateSettings,
        { input: { nextInvoiceNumber: 950 } },
      ),
      graphql(memberToken, organizationId, createMutation, { input: input() }),
    ]);
    expect(settingsRace.body.errors).toBeUndefined();
    expect(invoiceRace.body.errors).toBeUndefined();
    const allocated = invoiceRace.body.data.createInvoice.invoiceNumber;
    expect(['SET-00901', 'SET-00950']).toContain(allocated);
    const final = await pool.query<{
      next_invoice_number: number;
      invoice_count: number;
    }>(
      `SELECT ps.next_invoice_number,
              (SELECT COUNT(*) FROM invoices i
               WHERE i.organization_id = ps.organization_id
                 AND i.invoice_number = $2)::int AS invoice_count
       FROM payment_settings ps
       WHERE ps.organization_id = $1`,
      [organizationId, allocated],
    );
    expect(Number(final.rows[0].next_invoice_number)).toBe(
      allocated === 'SET-00950' ? 951 : 950,
    );
    expect(final.rows[0].invoice_count).toBe(1);
  });

  it('previews invoice email as bounded inert HTML behind tenant and CSRF guards', async () => {
    const mutation = `
      mutation PreviewInvoiceEmail($input: PreviewInvoiceEmailInput!) {
        previewInvoiceEmail(input: $input) { html }
      }
    `;
    const input = {
      message: 'Hello Ada,\nYour invoice is attached.',
      subject: 'Invoice SET-00950',
      includePaymentLink: true,
    };
    const retained = await request(legacyApp)
      .post('/api/invoices/email/preview')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .send({ ...input, baseUrl: 'https://frontend.test.itemize' })
      .expect(200);
    expect(retained.body.data.html).toContain('Hello Ada,\nYour invoice is attached.');
    expect(retained.body.data.html).toContain('Pay Now');
    expect(retained.body.data.html).not.toContain('Unsubscribe');

    const noCsrf = await graphql(
      memberToken,
      organizationId,
      mutation,
      { input },
      false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const foreignOrganization = await graphql(
      memberToken,
      outsiderOrganizationId,
      mutation,
      { input },
    ).expect(200);
    expect(foreignOrganization.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const hostile = await graphql(
      memberToken,
      organizationId,
      mutation,
      {
        input: {
          message: '<script>window.opener.pwned=true</script>',
          subject: '</title><script>alert(1)</script>',
          includePaymentLink: true,
        },
      },
    ).expect(200);
    expect(hostile.body.errors).toBeUndefined();
    const html = hostile.body.data.previewInvoiceEmail.html;
    expect(html).toContain('&lt;script&gt;window.opener.pwned=true&lt;/script&gt;');
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Pay Now');
    expect(html).not.toContain('Unsubscribe');

    const empty = await graphql(
      memberToken,
      organizationId,
      mutation,
      { input: { message: '   ' } },
    ).expect(200);
    expect(empty.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      field: 'message',
      reason: 'EMPTY_INVOICE_EMAIL_MESSAGE',
    });
  });

  const estimateMutation = `
    mutation CreateEstimate($input: CreateEstimateInput!) {
      createEstimate(input: $input) {
        id organizationId estimateNumber contactId status issueDate validUntil
        subtotal taxAmount discountAmount total
        items { productId quantity unitPrice taxRate taxAmount total sortOrder }
      }
    }
  `;

  const estimateInput = () => ({
    contactId,
    customerName: 'Ada Estimate',
    customerEmail: 'ada@example.com',
    validUntil: '2026-08-17',
    discountType: 'fixed',
    discountValue: '1.00',
    items: [{
      productId,
      name: 'Consulting',
      quantity: '2',
      unitPrice: '12.50',
      taxRate: '8',
    }],
  });

  it('supports estimate CRUD with exact per-line tax and REST interoperability', async () => {
    const created = await graphql(
      memberToken,
      organizationId,
      estimateMutation,
      { input: estimateInput() },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createEstimate).toMatchObject({
      organizationId,
      contactId,
      status: 'draft',
      subtotal: '25.00',
      taxAmount: '2.00',
      discountAmount: '1.00',
      total: '26.00',
      items: [{ productId, taxAmount: '2.00', total: '27.00' }],
    });
    const id = Number(created.body.data.createEstimate.id);
    const rest = await request(legacyApp)
      .get(`/api/invoices/estimates/${id}`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    expect(rest.body.data.estimate_number)
      .toBe(created.body.data.createEstimate.estimateNumber);
    const updated = await graphql(
      memberToken,
      organizationId,
      `mutation UpdateEstimate($id: Int!, $input: UpdateEstimateInput!) {
        updateEstimate(id: $id, input: $input) {
          id customerName subtotal taxAmount total items { name sortOrder }
        }
      }`,
      {
        id,
        input: {
          customerName: 'Updated Estimate',
          discountType: null,
          discountValue: '0',
          items: [{
            name: 'Repriced',
            quantity: '3',
            unitPrice: '10',
            taxRate: '5',
          }],
        },
      },
    ).expect(200);
    expect(updated.body.data.updateEstimate).toMatchObject({
      customerName: 'Updated Estimate',
      subtotal: '30.00',
      taxAmount: '1.50',
      total: '31.50',
      items: [{ name: 'Repriced', sortOrder: 0 }],
    });
    const deleted = await graphql(
      memberToken,
      organizationId,
      `mutation DeleteEstimate($id: Int!) {
        deleteEstimate(id: $id) { success deletedId estimateNumber }
      }`,
      { id },
    ).expect(200);
    expect(deleted.body.data.deleteEstimate).toMatchObject({
      success: true,
      deletedId: id,
    });
  });

  it('enforces estimate CSRF, tenant references, dates, and edit states', async () => {
    const noCsrf = await graphql(
      memberToken, organizationId, estimateMutation,
      { input: estimateInput() }, false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const foreign = await graphql(
      memberToken, organizationId, estimateMutation,
      { input: { ...estimateInput(), contactId: outsiderContactId } },
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const invalidDate = await graphql(
      memberToken, organizationId, estimateMutation,
      { input: { ...estimateInput(), validUntil: '2020-01-01' } },
    ).expect(200);
    expect(invalidDate.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_DATE_ORDER',
    });
    const fixedDiscount = await graphql(
      memberToken,
      organizationId,
      estimateMutation,
      {
        input: {
          ...estimateInput(),
          discountValue: '101',
          items: [{
            name: 'Taxed service',
            quantity: '2',
            unitPrice: '100',
            taxRate: '100',
          }],
        },
      },
    ).expect(200);
    const invalidEffectiveDiscount = await graphql(
      memberToken,
      organizationId,
      `mutation UpdateEstimate($id: Int!, $input: UpdateEstimateInput!) {
        updateEstimate(id: $id, input: $input) { id }
      }`,
      {
        id: Number(fixedDiscount.body.data.createEstimate.id),
        input: {
          discountType: 'percent',
          items: [{
            name: 'Taxed service',
            quantity: '2',
            unitPrice: '100',
            taxRate: '100',
          }],
        },
      },
    ).expect(200);
    expect(invalidEffectiveDiscount.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_DISCOUNT',
    });
    const created = await graphql(
      memberToken, organizationId, estimateMutation,
      { input: estimateInput() },
    ).expect(200);
    const id = Number(created.body.data.createEstimate.id);
    await pool.query(
      `UPDATE estimates SET status = 'accepted'
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    const locked = await graphql(
      memberToken,
      organizationId,
      `mutation UpdateEstimate($id: Int!, $input: UpdateEstimateInput!) {
        updateEstimate(id: $id, input: $input) { id }
      }`,
      { id, input: { notes: 'Forbidden' } },
    ).expect(200);
    expect(locked.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'NOT_EDITABLE',
    });
    const hidden = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query Estimate($id: Int!) { estimate(id: $id) { id } }`,
      { id },
      false,
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('allocates unique estimate numbers for concurrent creates', async () => {
    const [first, second] = await Promise.all([
      graphql(memberToken, organizationId, estimateMutation, { input: estimateInput() }),
      graphql(memberToken, organizationId, estimateMutation, { input: estimateInput() }),
    ]);
    expect(first.body.errors).toBeUndefined();
    expect(second.body.errors).toBeUndefined();
    expect(first.body.data.createEstimate.estimateNumber)
      .not.toBe(second.body.data.createEstimate.estimateNumber);
  });

  it('converts an estimate once and converges concurrent retries on one invoice', async () => {
    await pool.query(
      `INSERT INTO payment_settings (
         organization_id, invoice_prefix, next_invoice_number
       ) VALUES ($1, 'CONV-', 51)
       ON CONFLICT (organization_id) DO UPDATE SET
         invoice_prefix = EXCLUDED.invoice_prefix,
         next_invoice_number = EXCLUDED.next_invoice_number`,
      [organizationId],
    );
    const source = await graphql(
      memberToken,
      organizationId,
      estimateMutation,
      {
        input: {
          ...estimateInput(),
          customerPhone: '555-0100',
          customerAddress: '123 Test Way',
          notes: 'Converted notes',
          termsAndConditions: 'Converted terms',
        },
      },
    ).expect(200);
    expect(source.body.errors).toBeUndefined();
    const estimateId = Number(source.body.data.createEstimate.id);
    const conversionMutation = `mutation ConvertEstimate($id: Int!) {
      convertEstimateToInvoice(id: $id) {
        success invoiceId invoiceNumber replayed
      }
    }`;

    const noCsrf = await graphql(
      memberToken,
      organizationId,
      conversionMutation,
      { id: estimateId },
      false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const hidden = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      conversionMutation,
      { id: estimateId },
    ).expect(200);
    expect(hidden.body.errors[0].extensions).toMatchObject({
      code: 'NOT_FOUND',
      reason: 'ESTIMATE_NOT_FOUND',
    });

    const [first, second] = await Promise.all([
      graphql(
        memberToken, organizationId, conversionMutation, { id: estimateId },
      ),
      graphql(
        memberToken, organizationId, conversionMutation, { id: estimateId },
      ),
    ]);
    expect(first.body.errors).toBeUndefined();
    expect(second.body.errors).toBeUndefined();
    const results = [
      first.body.data.convertEstimateToInvoice,
      second.body.data.convertEstimateToInvoice,
    ];
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(new Set(results.map((result) => Number(result.invoiceId))).size).toBe(1);
    expect(new Set(results.map((result) => result.invoiceNumber))).toEqual(
      new Set(['CONV-00051']),
    );
    const invoiceId = Number(results[0].invoiceId);

    const state = await pool.query(
      `SELECT
         e.status AS estimate_status, e.converted_invoice_id,
         i.invoice_number, i.contact_id, i.customer_name, i.customer_email,
         i.customer_phone, i.customer_address, i.issue_date = CURRENT_DATE AS issued_today,
         i.due_date = CURRENT_DATE + 30 AS due_in_thirty_days,
         i.subtotal::text, i.tax_amount::text, i.discount_amount::text,
         i.discount_type, i.discount_value::text, i.total::text,
         i.amount_due::text, i.notes, i.terms_and_conditions, i.created_by
       FROM estimates e
       JOIN invoices i
         ON i.id = e.converted_invoice_id
        AND i.organization_id = e.organization_id
       WHERE e.id = $1 AND e.organization_id = $2`,
      [estimateId, organizationId],
    );
    expect(state.rows[0]).toMatchObject({
      estimate_status: 'accepted',
      converted_invoice_id: invoiceId,
      invoice_number: 'CONV-00051',
      contact_id: contactId,
      customer_name: 'Ada Estimate',
      customer_email: 'ada@example.com',
      customer_phone: '555-0100',
      customer_address: '123 Test Way',
      issued_today: true,
      due_in_thirty_days: true,
      subtotal: '25.00',
      tax_amount: '2.00',
      discount_amount: '1.00',
      discount_type: 'fixed',
      discount_value: '1.00',
      total: '26.00',
      amount_due: '26.00',
      notes: 'Converted notes',
      terms_and_conditions: 'Converted terms',
      created_by: memberId,
    });
    const items = await pool.query(
      `SELECT product_id, name, quantity::text, unit_price::text,
              tax_rate::text, tax_amount::text, total::text, sort_order
       FROM invoice_items
       WHERE invoice_id = $1 AND organization_id = $2
       ORDER BY sort_order, id`,
      [invoiceId, organizationId],
    );
    expect(items.rows).toEqual([{
      product_id: productId,
      name: 'Consulting',
      quantity: '2.00',
      unit_price: '12.50',
      tax_rate: '8.00',
      tax_amount: '2.00',
      total: '27.00',
      sort_order: 0,
    }]);
    const allocation = await pool.query<{ next_invoice_number: number }>(
      `SELECT next_invoice_number FROM payment_settings
       WHERE organization_id = $1`,
      [organizationId],
    );
    expect(Number(allocation.rows[0].next_invoice_number)).toBe(52);

    const replay = await graphql(
      memberToken, organizationId, conversionMutation, { id: estimateId },
    ).expect(200);
    expect(replay.body.errors).toBeUndefined();
    expect(replay.body.data.convertEstimateToInvoice).toEqual({
      success: true,
      invoiceId,
      invoiceNumber: 'CONV-00051',
      replayed: true,
    });
    const retained = await request(legacyApp)
      .get(`/api/invoices/${invoiceId}`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    expect(retained.body.data).toMatchObject({
      id: invoiceId,
      invoice_number: 'CONV-00051',
      total: '26.00',
    });

    const corruptedSource = await graphql(
      memberToken,
      organizationId,
      estimateMutation,
      { input: estimateInput() },
    ).expect(200);
    const corruptedEstimateId = Number(
      corruptedSource.body.data.createEstimate.id,
    );
    const foreignInvoice = await pool.query<{ id: number }>(
      `INSERT INTO invoices (
         organization_id, invoice_number, due_date, total, amount_due, created_by
       ) VALUES ($1, $2, CURRENT_DATE + 30, 0, 0, $3)
       RETURNING id`,
      [
        outsiderOrganizationId,
        `FOREIGN-CONVERSION-${corruptedEstimateId}`,
        outsiderId,
      ],
    );
    await pool.query(
      `UPDATE estimates SET converted_invoice_id = $3
       WHERE id = $1 AND organization_id = $2`,
      [
        corruptedEstimateId,
        organizationId,
        Number(foreignInvoice.rows[0].id),
      ],
    );
    const corrupted = await graphql(
      memberToken,
      organizationId,
      conversionMutation,
      { id: corruptedEstimateId },
    ).expect(200);
    expect(corrupted.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'ESTIMATE_CONVERSION_INVALID_STATE',
    });

    const rollbackSource = await graphql(
      memberToken,
      organizationId,
      estimateMutation,
      { input: estimateInput() },
    ).expect(200);
    const rollbackEstimateId = Number(rollbackSource.body.data.createEstimate.id);
    await pool.query(
      `UPDATE estimates SET total = 100000000.00
       WHERE id = $1 AND organization_id = $2`,
      [rollbackEstimateId, organizationId],
    );
    const failed = await graphql(
      memberToken,
      organizationId,
      conversionMutation,
      { id: rollbackEstimateId },
    ).expect(200);
    expect(failed.body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
    const rolledBack = await pool.query(
      `SELECT status, converted_invoice_id
       FROM estimates
       WHERE id = $1 AND organization_id = $2`,
      [rollbackEstimateId, organizationId],
    );
    expect(rolledBack.rows[0]).toEqual({
      status: 'draft',
      converted_invoice_id: null,
    });
    const allocationAfterFailures = await pool.query<{
      next_invoice_number: number;
    }>(
      `SELECT next_invoice_number FROM payment_settings
       WHERE organization_id = $1`,
      [organizationId],
    );
    expect(Number(allocationAfterFailures.rows[0].next_invoice_number)).toBe(52);
  });

  const sendEstimateMutation = `mutation SendEstimate(
    $id: Int!, $idempotencyKey: String!
  ) {
    sendEstimate(id: $id, idempotencyKey: $idempotencyKey) {
      success emailSent replayed deliveryId status
    }
  }`;

  it('sends an estimate once, persists evidence, and replays the request key', async () => {
    estimateEmailProvider.send.mockReset();
    estimateEmailProvider.send.mockResolvedValue({
      kind: 'sent', providerId: 'email-provider-1',
    });
    const created = await graphql(
      memberToken, organizationId, estimateMutation,
      {
        input: {
          ...estimateInput(),
          customerName: 'Ada <script>alert(1)</script>',
          customerEmail: 'send@example.com',
        },
      },
    ).expect(200);
    const id = Number(created.body.data.createEstimate.id);
    const variables = { id, idempotencyKey: `estimate-send-${id}` };

    const noCsrf = await graphql(
      memberToken, organizationId, sendEstimateMutation, variables, false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const hidden = await graphql(
      outsiderToken, outsiderOrganizationId, sendEstimateMutation, variables,
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect(estimateEmailProvider.send).not.toHaveBeenCalled();

    const sent = await graphql(
      memberToken, organizationId, sendEstimateMutation, variables,
    ).expect(200);
    expect(sent.body.errors).toBeUndefined();
    expect(sent.body.data.sendEstimate).toMatchObject({
      success: true, emailSent: true, replayed: false, status: 'SENT',
    });
    expect(estimateEmailProvider.send).toHaveBeenCalledTimes(1);
    expect(estimateEmailProvider.send.mock.calls[0][0]).toMatchObject({
      to: 'send@example.com',
      idempotencyKey: `estimate-email:${organizationId}:${sent.body.data.sendEstimate.deliveryId}`,
    });
    expect(estimateEmailProvider.send.mock.calls[0][0].html)
      .toContain('Estimate');
    expect(estimateEmailProvider.send.mock.calls[0][0].html)
      .toContain('Ada &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(estimateEmailProvider.send.mock.calls[0][0].html)
      .not.toContain('<script>');

    const replay = await graphql(
      memberToken, organizationId, sendEstimateMutation, variables,
    ).expect(200);
    expect(replay.body.data.sendEstimate).toMatchObject({
      success: true, emailSent: true, replayed: true, status: 'SENT',
      deliveryId: sent.body.data.sendEstimate.deliveryId,
    });
    expect(estimateEmailProvider.send).toHaveBeenCalledTimes(1);
    const state = await pool.query(
      `SELECT e.status, e.sent_at IS NOT NULL AS has_sent_at,
              d.status AS delivery_status, d.provider_id, d.attempt_count
       FROM estimates e
       JOIN estimate_email_deliveries d
         ON d.estimate_id = e.id AND d.organization_id = e.organization_id
       WHERE e.id = $1 AND e.organization_id = $2`,
      [id, organizationId],
    );
    expect(state.rows[0]).toEqual({
      status: 'sent', has_sent_at: true, delivery_status: 'sent',
      provider_id: 'email-provider-1', attempt_count: 1,
    });
  });

  it('keeps failed and ambiguous estimate deliveries honest and retryable', async () => {
    estimateEmailProvider.send.mockReset();
    estimateEmailProvider.send.mockResolvedValueOnce({
      kind: 'rejected', message: 'Provider unavailable',
    });
    const created = await graphql(
      memberToken, organizationId, estimateMutation,
      { input: { ...estimateInput(), customerEmail: 'retry@example.com' } },
    ).expect(200);
    const id = Number(created.body.data.createEstimate.id);
    const variables = { id, idempotencyKey: `estimate-retry-${id}` };
    const failed = await graphql(
      memberToken, organizationId, sendEstimateMutation, variables,
    ).expect(200);
    expect(failed.body.data.sendEstimate).toMatchObject({
      success: false, emailSent: false, replayed: false, status: 'RETRY',
    });
    const unchanged = await pool.query(
      `SELECT status, sent_at FROM estimates
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    expect(unchanged.rows[0]).toEqual({ status: 'draft', sent_at: null });

    await pool.query(
      `UPDATE estimate_email_deliveries SET next_attempt_at = CURRENT_TIMESTAMP
       WHERE estimate_id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    estimateEmailProvider.send.mockResolvedValueOnce({
      kind: 'sent', providerId: 'email-provider-retry',
    });
    await expect(estimateEmailDeliveryService.runDue(10)).resolves.toEqual(
      expect.objectContaining({ sent: expect.any(Number) }),
    );
    const retried = await pool.query(
      `SELECT e.status, d.status AS delivery_status, d.attempt_count
       FROM estimates e JOIN estimate_email_deliveries d
         ON d.estimate_id = e.id AND d.organization_id = e.organization_id
       WHERE e.id = $1 AND e.organization_id = $2`,
      [id, organizationId],
    );
    expect(retried.rows[0]).toEqual({
      status: 'sent', delivery_status: 'sent', attempt_count: 2,
    });

    const ambiguousSource = await graphql(
      memberToken, organizationId, estimateMutation,
      { input: { ...estimateInput(), customerEmail: 'ambiguous@example.com' } },
    ).expect(200);
    const ambiguousId = Number(ambiguousSource.body.data.createEstimate.id);
    estimateEmailProvider.send.mockRejectedValueOnce(new Error('Request timed out'));
    const ambiguous = await graphql(
      memberToken,
      organizationId,
      sendEstimateMutation,
      { id: ambiguousId, idempotencyKey: `estimate-ambiguous-${ambiguousId}` },
    ).expect(200);
    expect(ambiguous.body.data.sendEstimate).toMatchObject({
      success: false,
      emailSent: false,
      status: 'RECONCILIATION_REQUIRED',
    });
    const quarantined = await pool.query(
      `SELECT e.status, d.status AS delivery_status
       FROM estimates e JOIN estimate_email_deliveries d
         ON d.estimate_id = e.id AND d.organization_id = e.organization_id
       WHERE e.id = $1 AND e.organization_id = $2`,
      [ambiguousId, organizationId],
    );
    expect(quarantined.rows[0]).toEqual({
      status: 'draft', delivery_status: 'reconciliation_required',
    });
  });

  it('validates estimate send keys, recipient presence, and terminal state', async () => {
    const missingEmail = await graphql(
      memberToken, organizationId, estimateMutation,
      { input: { ...estimateInput(), customerEmail: null } },
    ).expect(200);
    const missingId = Number(missingEmail.body.data.createEstimate.id);
    const missing = await graphql(
      memberToken, organizationId, sendEstimateMutation,
      { id: missingId, idempotencyKey: 'missing-email' },
    ).expect(200);
    expect(missing.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT', reason: 'ESTIMATE_CUSTOMER_EMAIL_REQUIRED',
    });
    const invalid = await graphql(
      memberToken, organizationId, sendEstimateMutation,
      { id: missingId, idempotencyKey: 'invalid key' },
    ).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT', reason: 'INVALID_IDEMPOTENCY_KEY',
    });
    await pool.query(
      `UPDATE estimates SET status = 'accepted'
       WHERE id = $1 AND organization_id = $2`,
      [missingId, organizationId],
    );
    const terminal = await graphql(
      memberToken, organizationId, sendEstimateMutation,
      { id: missingId, idempotencyKey: 'terminal-estimate' },
    ).expect(200);
    expect(terminal.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT', reason: 'ESTIMATE_SEND_INVALID_STATE',
    });
  });

  const recurringMutation = `
    mutation CreateRecurringInvoice($input: CreateRecurringInvoiceInput!) {
      createRecurringInvoice(input: $input) {
        id organizationId templateName contactId frequency status
        startDate endDate nextRunDate subtotal taxAmount discountAmount total
        items { productId name quantity unitPrice taxRate }
      }
    }
  `;

  const recurringInput = () => ({
    templateName: 'Monthly Consulting',
    contactId,
    customerName: 'Ada Recurring',
    customerEmail: 'ada@example.com',
    frequency: 'monthly',
    startDate: '2026-07-20',
    endDate: '2026-10-20',
    discountType: 'fixed',
    discountValue: '1.00',
    items: [{
      productId,
      name: 'Consulting',
      quantity: '2',
      unitPrice: '12.50',
      taxRate: '8',
    }],
  });

  it('supports recurring CRUD, recalculates stored items, and interoperates with REST', async () => {
    const created = await graphql(
      memberToken, organizationId, recurringMutation,
      { input: recurringInput() },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createRecurringInvoice).toMatchObject({
      organizationId,
      contactId,
      status: 'active',
      nextRunDate: '2026-07-20',
      subtotal: '25.00',
      taxAmount: '2.00',
      discountAmount: '1.00',
      total: '26.00',
      items: [{ productId, unitPrice: '12.50', taxRate: '8' }],
    });
    const id = Number(created.body.data.createRecurringInvoice.id);
    const rest = await request(legacyApp)
      .get(`/api/invoices/recurring/${id}`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    expect(rest.body.template_name).toBe('Monthly Consulting');
    const updated = await graphql(
      memberToken,
      organizationId,
      `mutation UpdateRecurringInvoice(
        $id: Int!, $input: UpdateRecurringInvoiceInput!
      ) {
        updateRecurringInvoice(id: $id, input: $input) {
          id templateName frequency subtotal taxAmount discountAmount total
        }
      }`,
      {
        id,
        input: {
          templateName: 'Weekly Consulting',
          frequency: 'weekly',
          discountType: 'percent',
          discountValue: '10',
        },
      },
    ).expect(200);
    expect(updated.body.data.updateRecurringInvoice).toMatchObject({
      templateName: 'Weekly Consulting',
      frequency: 'weekly',
      subtotal: '25.00',
      taxAmount: '2.00',
      discountAmount: '2.50',
      total: '24.50',
    });
    await request(legacyApp)
      .post(`/api/invoices/recurring/${id}/pause`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    const paused = await graphql(
      memberToken,
      organizationId,
      `query RecurringInvoices($filter: RecurringInvoiceFilterInput) {
        recurringInvoices(filter: $filter) {
          nodes { id status }
          pageInfo { total }
        }
      }`,
      { filter: { status: 'paused' } },
      false,
    ).expect(200);
    expect(paused.body.data.recurringInvoices.nodes).toContainEqual({ id, status: 'paused' });
    const deleted = await graphql(
      memberToken,
      organizationId,
      `mutation DeleteRecurringInvoice($id: Int!) {
        deleteRecurringInvoice(id: $id) { success deletedId templateName }
      }`,
      { id },
    ).expect(200);
    expect(deleted.body.data.deleteRecurringInvoice).toMatchObject({
      success: true,
      deletedId: id,
      templateName: 'Weekly Consulting',
    });
  });

  it('supports recurring lifecycle transitions and bounded generated-invoice history', async () => {
    const created = await graphql(
      memberToken, organizationId, recurringMutation,
      { input: { ...recurringInput(), endDate: null } },
    ).expect(200);
    const id = Number(created.body.data.createRecurringInvoice.id);
    const inserted = await pool.query<{ id: number; invoice_number: string }>(
      `INSERT INTO invoices (
         organization_id, invoice_number, due_date, total, amount_due,
         status, recurring_template_id, created_by, created_at
       ) VALUES
         ($1, $2, CURRENT_DATE, 10, 10, 'draft', $4, $5, NOW() - INTERVAL '1 day'),
         ($1, $3, CURRENT_DATE, 20, 20, 'sent', $4, $5, NOW())
       RETURNING id, invoice_number`,
      [
        organizationId,
        `INV-HISTORY-${id}-1`,
        `INV-HISTORY-${id}-2`,
        id,
        memberId,
      ],
    );
    const history = await graphql(
      memberToken,
      organizationId,
      `query RecurringInvoiceHistory($id: Int!, $page: PageInput) {
        recurringInvoiceHistory(id: $id, page: $page) {
          nodes { id invoiceNumber total status createdAt }
          pageInfo { page pageSize total totalPages hasNextPage }
        }
      }`,
      { id, page: { page: 1, pageSize: 1 } },
      false,
    ).expect(200);
    expect(history.body.errors).toBeUndefined();
    expect(history.body.data.recurringInvoiceHistory).toMatchObject({
      nodes: [{
        id: Number(inserted.rows[1].id),
        invoiceNumber: `INV-HISTORY-${id}-2`,
        total: '20.00',
        status: 'sent',
      }],
      pageInfo: {
        page: 1,
        pageSize: 1,
        total: 2,
        totalPages: 2,
        hasNextPage: true,
      },
    });
    const noCsrf = await graphql(
      memberToken,
      organizationId,
      `mutation PauseRecurringInvoice($id: Int!) {
        pauseRecurringInvoice(id: $id) { id }
      }`,
      { id },
      false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const paused = await graphql(
      memberToken,
      organizationId,
      `mutation PauseRecurringInvoice($id: Int!) {
        pauseRecurringInvoice(id: $id) { id status nextRunDate }
      }`,
      { id },
    ).expect(200);
    expect(paused.body.data.pauseRecurringInvoice).toMatchObject({
      id,
      status: 'paused',
    });
    const pauseReplay = await graphql(
      memberToken,
      organizationId,
      `mutation PauseRecurringInvoice($id: Int!) {
        pauseRecurringInvoice(id: $id) { id }
      }`,
      { id },
    ).expect(200);
    expect(pauseReplay.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'RECURRING_INVOICE_NOT_ACTIVE',
      actualStatus: 'paused',
    });
    await pool.query(
      `UPDATE recurring_invoice_templates
       SET next_run_date = CURRENT_DATE - INTERVAL '40 days'
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    const resumed = await graphql(
      memberToken,
      organizationId,
      `mutation ResumeRecurringInvoice($id: Int!) {
        resumeRecurringInvoice(id: $id) { id status nextRunDate }
      }`,
      { id },
    ).expect(200);
    expect(resumed.body.errors).toBeUndefined();
    expect(resumed.body.data.resumeRecurringInvoice).toMatchObject({
      id,
      status: 'active',
    });
    const dateCheck = await pool.query<{ future: boolean }>(
      `SELECT next_run_date > CURRENT_DATE AS future
       FROM recurring_invoice_templates
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    expect(dateCheck.rows[0].future).toBe(true);
    const rest = await request(legacyApp)
      .get(`/api/invoices/recurring/${id}`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    expect(rest.body).toMatchObject({
      id,
      status: 'active',
    });
    expect(rest.body.next_run_date.slice(0, 10))
      .toBe(resumed.body.data.resumeRecurringInvoice.nextRunDate);
    const resumeReplay = await graphql(
      memberToken,
      organizationId,
      `mutation ResumeRecurringInvoice($id: Int!) {
        resumeRecurringInvoice(id: $id) { id }
      }`,
      { id },
    ).expect(200);
    expect(resumeReplay.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'RECURRING_INVOICE_NOT_PAUSED',
      actualStatus: 'active',
    });
    const hidden = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query RecurringInvoiceHistory($id: Int!) {
        recurringInvoiceHistory(id: $id) { nodes { id } }
      }`,
      { id },
      false,
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('previews without reserving and clones a tenant-owned invoice transactionally', async () => {
    await pool.query(
      `INSERT INTO payment_settings (
         organization_id, invoice_prefix, next_invoice_number
       ) VALUES ($1, 'REC-', 37)
       ON CONFLICT (organization_id) DO UPDATE SET
         invoice_prefix = EXCLUDED.invoice_prefix,
         next_invoice_number = EXCLUDED.next_invoice_number`,
      [organizationId],
    );
    const previewDocument = `query PreviewRecurringInvoiceNumber {
      previewRecurringInvoiceNumber
    }`;
    const firstPreview = await graphql(
      memberToken, organizationId, previewDocument, {}, false,
    ).expect(200);
    const secondPreview = await graphql(
      memberToken, organizationId, previewDocument, {}, false,
    ).expect(200);
    expect(firstPreview.body.data.previewRecurringInvoiceNumber).toBe('REC-00037');
    expect(secondPreview.body.data.previewRecurringInvoiceNumber).toBe('REC-00037');
    const unreserved = await pool.query<{ next_invoice_number: number }>(
      `SELECT next_invoice_number FROM payment_settings
       WHERE organization_id = $1`,
      [organizationId],
    );
    expect(Number(unreserved.rows[0].next_invoice_number)).toBe(37);

    const source = await graphql(
      memberToken,
      organizationId,
      createMutation,
      {
        input: {
          ...input(),
          notes: 'Copied source notes',
          paymentTerms: '14',
        },
      },
    ).expect(200);
    expect(source.body.errors).toBeUndefined();
    const sourceId = Number(source.body.data.createInvoice.id);
    expect(source.body.data.createInvoice.invoiceNumber).toBe('REC-00037');
    const sourceBefore = await pool.query(
      `SELECT total::text, amount_due::text, status, is_recurring_source,
              (SELECT COUNT(*) FROM invoice_items ii
               WHERE ii.invoice_id = invoices.id
                 AND ii.organization_id = invoices.organization_id)::int AS item_count
       FROM invoices
       WHERE id = $1 AND organization_id = $2`,
      [sourceId, organizationId],
    );

    const cloneMutation = `mutation CreateRecurringInvoiceFromInvoice(
      $invoiceId: Int!, $input: CreateRecurringInvoiceFromInvoiceInput!
    ) {
      createRecurringInvoiceFromInvoice(invoiceId: $invoiceId, input: $input) {
        id organizationId templateName sourceInvoiceId sourceInvoiceNumber
        contactId frequency startDate endDate nextRunDate status
        subtotal taxAmount discountAmount discountType discountValue total
        notes paymentTerms
        items { productId name description quantity unitPrice taxRate }
      }
    }`;
    const cloneInput = {
      templateName: 'Copied monthly invoice',
      frequency: 'monthly',
      startDate: '2026-07-21',
      endDate: '2026-12-21',
    };
    const noCsrf = await graphql(
      memberToken,
      organizationId,
      cloneMutation,
      { invoiceId: sourceId, input: cloneInput },
      false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const cloned = await graphql(
      memberToken,
      organizationId,
      cloneMutation,
      { invoiceId: sourceId, input: cloneInput },
    ).expect(200);
    expect(cloned.body.errors).toBeUndefined();
    expect(cloned.body.data.createRecurringInvoiceFromInvoice).toMatchObject({
      organizationId,
      templateName: 'Copied monthly invoice',
      sourceInvoiceId: sourceId,
      sourceInvoiceNumber: 'REC-00037',
      contactId,
      frequency: 'monthly',
      startDate: '2026-07-21',
      endDate: '2026-12-21',
      nextRunDate: '2026-07-21',
      status: 'active',
      subtotal: '25.00',
      taxAmount: '1.25',
      discountAmount: '1.00',
      discountType: 'fixed',
      discountValue: '1.00',
      total: '25.25',
      notes: 'Copied source notes',
      paymentTerms: '14',
      items: [{
        productId,
        name: 'Consulting',
        quantity: '2.00',
        unitPrice: '12.50',
        taxRate: '5.00',
      }],
    });
    const templateId = Number(
      cloned.body.data.createRecurringInvoiceFromInvoice.id,
    );
    const sourceAfter = await pool.query(
      `SELECT total::text, amount_due::text, status, is_recurring_source,
              (SELECT COUNT(*) FROM invoice_items ii
               WHERE ii.invoice_id = invoices.id
                 AND ii.organization_id = invoices.organization_id)::int AS item_count
       FROM invoices
       WHERE id = $1 AND organization_id = $2`,
      [sourceId, organizationId],
    );
    expect(sourceAfter.rows[0]).toEqual({
      ...sourceBefore.rows[0],
      is_recurring_source: true,
    });
    const allocation = await pool.query<{ next_invoice_number: number }>(
      `SELECT next_invoice_number FROM payment_settings
       WHERE organization_id = $1`,
      [organizationId],
    );
    expect(Number(allocation.rows[0].next_invoice_number)).toBe(38);
    const retained = await request(legacyApp)
      .get(`/api/invoices/recurring/${templateId}`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    expect(retained.body).toMatchObject({
      id: templateId,
      source_invoice_id: sourceId,
      total: '25.25',
    });
    const hidden = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      cloneMutation,
      { invoiceId: sourceId, input: cloneInput },
    ).expect(200);
    expect(hidden.body.errors[0].extensions).toMatchObject({
      code: 'NOT_FOUND',
      reason: 'SOURCE_INVOICE_NOT_FOUND',
    });
    await pool.query(
      `UPDATE invoices SET status = 'cancelled'
       WHERE id = $1 AND organization_id = $2`,
      [sourceId, organizationId],
    );
    const cancelled = await graphql(
      memberToken,
      organizationId,
      cloneMutation,
      { invoiceId: sourceId, input: cloneInput },
    ).expect(200);
    expect(cancelled.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'SOURCE_INVOICE_NOT_CONVERTIBLE',
      actualStatus: 'cancelled',
    });
  });

  it('generates recurring invoices once for concurrent idempotent requests', async () => {
    await pool.query(
      `INSERT INTO payment_settings (
         organization_id, invoice_prefix, next_invoice_number
       ) VALUES ($1, 'GEN-', 100)
       ON CONFLICT (organization_id) DO UPDATE SET
         invoice_prefix = EXCLUDED.invoice_prefix,
         next_invoice_number = EXCLUDED.next_invoice_number`,
      [organizationId],
    );
    const created = await graphql(
      memberToken,
      organizationId,
      recurringMutation,
      { input: { ...recurringInput(), endDate: null } },
    ).expect(200);
    const templateId = Number(created.body.data.createRecurringInvoice.id);
    const generationMutation = `mutation GenerateRecurringInvoiceNow(
      $id: Int!, $idempotencyKey: String!
    ) {
      generateRecurringInvoiceNow(
        id: $id, idempotencyKey: $idempotencyKey
      ) {
        invoiceId invoiceNumber nextRunDate templateStatus replayed
      }
    }`;
    const variables = {
      id: templateId,
      idempotencyKey: `recurring-generation-${templateId}`,
    };
    const noCsrf = await graphql(
      memberToken,
      organizationId,
      generationMutation,
      variables,
      false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const invalidKey = await graphql(
      memberToken,
      organizationId,
      generationMutation,
      { id: templateId, idempotencyKey: 'invalid key' },
    ).expect(200);
    expect(invalidKey.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_IDEMPOTENCY_KEY',
    });
    const hidden = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      generationMutation,
      variables,
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const [first, second] = await Promise.all([
      graphql(
        memberToken, organizationId, generationMutation, variables,
      ),
      graphql(
        memberToken, organizationId, generationMutation, variables,
      ),
    ]);
    expect(first.body.errors).toBeUndefined();
    expect(second.body.errors).toBeUndefined();
    const outcomes = [
      first.body.data.generateRecurringInvoiceNow,
      second.body.data.generateRecurringInvoiceNow,
    ];
    expect(outcomes[0]).toMatchObject({
      invoiceNumber: 'GEN-00100',
      nextRunDate: '2026-08-20',
      templateStatus: 'active',
    });
    expect(outcomes[1]).toMatchObject({
      invoiceId: outcomes[0].invoiceId,
      invoiceNumber: 'GEN-00100',
      nextRunDate: '2026-08-20',
      templateStatus: 'active',
    });
    expect(outcomes.map((outcome) => outcome.replayed).sort())
      .toEqual([false, true]);

    const persisted = await pool.query<{
      id: number;
      invoice_number: string;
      due_date_matches: boolean;
      item_count: number;
      item_tax: string;
      item_total: string;
      idempotency_key: string;
    }>(
      `SELECT i.id, i.invoice_number,
              i.due_date = CURRENT_DATE + 30 AS due_date_matches,
              COUNT(ii.id)::int AS item_count,
              MIN(ii.tax_amount)::text AS item_tax,
              MIN(ii.total)::text AS item_total,
              i.custom_fields #>>
                '{_itemize,recurringGeneration,idempotencyKey}'
                AS idempotency_key
       FROM invoices i
       LEFT JOIN invoice_items ii
         ON ii.invoice_id = i.id AND ii.organization_id = i.organization_id
       WHERE i.organization_id = $1 AND i.recurring_template_id = $2
       GROUP BY i.id`,
      [organizationId, templateId],
    );
    expect(persisted.rows).toEqual([expect.objectContaining({
      id: Number(outcomes[0].invoiceId),
      invoice_number: 'GEN-00100',
      due_date_matches: true,
      item_count: 1,
      item_tax: '2.00',
      item_total: '27.00',
      idempotency_key: variables.idempotencyKey,
    })]);
    const schedule = await pool.query<{
      next_run_date: string;
      generated: boolean;
      next_invoice_number: number;
    }>(
      `SELECT r.next_run_date::text,
              r.last_generated_at IS NOT NULL AS generated,
              ps.next_invoice_number
       FROM recurring_invoice_templates r
       JOIN payment_settings ps
         ON ps.organization_id = r.organization_id
       WHERE r.id = $1 AND r.organization_id = $2`,
      [templateId, organizationId],
    );
    expect(schedule.rows[0]).toMatchObject({
      next_run_date: '2026-08-20',
      generated: true,
      next_invoice_number: 101,
    });

    await pool.query(
      `UPDATE recurring_invoice_templates SET status = 'completed'
       WHERE id = $1 AND organization_id = $2`,
      [templateId, organizationId],
    );
    const replay = await graphql(
      memberToken,
      organizationId,
      generationMutation,
      variables,
    ).expect(200);
    expect(replay.body.data.generateRecurringInvoiceNow).toMatchObject({
      invoiceId: outcomes[0].invoiceId,
      invoiceNumber: 'GEN-00100',
      nextRunDate: '2026-08-20',
      templateStatus: 'active',
      replayed: true,
    });
    const completed = await graphql(
      memberToken,
      organizationId,
      generationMutation,
      { id: templateId, idempotencyKey: `${variables.idempotencyKey}-new` },
    ).expect(200);
    expect(completed.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'RECURRING_INVOICE_COMPLETED',
      actualStatus: 'completed',
    });
    const finalCounter = await pool.query<{ next_invoice_number: number }>(
      `SELECT next_invoice_number FROM payment_settings
       WHERE organization_id = $1`,
      [organizationId],
    );
    expect(Number(finalCounter.rows[0].next_invoice_number)).toBe(101);
  });

  it('runs scheduled recurring generation once per due date and rolls failures back', async () => {
    await pool.query(
      `UPDATE recurring_invoice_templates SET status = 'paused'
       WHERE status = 'active' AND next_run_date <= CURRENT_DATE`,
    );
    await pool.query(
      `INSERT INTO payment_settings (
         organization_id, invoice_prefix, next_invoice_number
       ) VALUES ($1, 'JOB-', 500)
       ON CONFLICT (organization_id) DO UPDATE SET
         invoice_prefix = EXCLUDED.invoice_prefix,
         next_invoice_number = EXCLUDED.next_invoice_number`,
      [organizationId],
    );
    const createTemplate = async (templateName: string) => {
      const created = await graphql(
        memberToken,
        organizationId,
        recurringMutation,
        {
          input: {
            ...recurringInput(),
            templateName,
            frequency: 'weekly',
            endDate: null,
          },
        },
      ).expect(200);
      expect(created.body.errors).toBeUndefined();
      return Number(created.body.data.createRecurringInvoice.id);
    };
    const dueId = await createTemplate('Scheduled due template');
    const terminalId = await createTemplate('Scheduled terminal template');
    const futureId = await createTemplate('Scheduled future template');
    await pool.query(
      `UPDATE recurring_invoice_templates
       SET next_run_date = CASE id
             WHEN $1 THEN CURRENT_DATE - 1
             WHEN $2 THEN CURRENT_DATE
             WHEN $3 THEN CURRENT_DATE + 1
           END,
           end_date = CASE WHEN id = $2 THEN CURRENT_DATE ELSE NULL END
       WHERE id = ANY($4::int[]) AND organization_id = $5`,
      [dueId, terminalId, futureId, [dueId, terminalId, futureId], organizationId],
    );

    const workerResults = await Promise.all([
      recurringInvoicesService.generateDue(100),
      recurringInvoicesService.generateDue(100),
    ]);
    expect(workerResults.reduce(
      (total, result) => total + result.generated.length,
      0,
    )).toBe(2);
    expect(workerResults.every((result) => result.failures.length === 0)).toBe(true);
    const generated = await pool.query<{
      recurring_template_id: number;
      invoice_count: number;
      scheduled_key: string;
    }>(
      `SELECT recurring_template_id, COUNT(*)::int AS invoice_count,
              MIN(custom_fields #>>
                '{_itemize,recurringGeneration,idempotencyKey}') AS scheduled_key
       FROM invoices
       WHERE organization_id = $1
         AND recurring_template_id = ANY($2::int[])
       GROUP BY recurring_template_id
       ORDER BY recurring_template_id`,
      [organizationId, [dueId, terminalId, futureId]],
    );
    expect(generated.rows).toEqual([
      {
        recurring_template_id: dueId,
        invoice_count: 1,
        scheduled_key: expect.stringMatching(`^scheduled-${dueId}-`),
      },
      {
        recurring_template_id: terminalId,
        invoice_count: 1,
        scheduled_key: expect.stringMatching(`^scheduled-${terminalId}-`),
      },
    ]);
    const schedules = await pool.query<{
      id: number;
      status: string;
      is_future: boolean;
      generated: boolean;
    }>(
      `SELECT id, status, next_run_date > CURRENT_DATE AS is_future,
              last_generated_at IS NOT NULL AS generated
       FROM recurring_invoice_templates
       WHERE id = ANY($1::int[]) AND organization_id = $2
       ORDER BY id`,
      [[dueId, terminalId, futureId], organizationId],
    );
    expect(schedules.rows).toEqual([
      { id: dueId, status: 'active', is_future: true, generated: true },
      { id: terminalId, status: 'completed', is_future: false, generated: true },
      { id: futureId, status: 'active', is_future: true, generated: false },
    ]);
    const counterAfterSuccess = await pool.query<{ next_invoice_number: number }>(
      `SELECT next_invoice_number FROM payment_settings WHERE organization_id = $1`,
      [organizationId],
    );
    expect(Number(counterAfterSuccess.rows[0].next_invoice_number)).toBe(502);

    const rollbackId = await createTemplate('Scheduled rollback template');
    await pool.query(
      `UPDATE recurring_invoice_templates
       SET next_run_date = CURRENT_DATE, end_date = NULL
       WHERE id = $1 AND organization_id = $2`,
      [rollbackId, organizationId],
    );
    await pool.query(
      `UPDATE payment_settings
       SET invoice_prefix = 'ROLL-', next_invoice_number = 700
       WHERE organization_id = $1`,
      [organizationId],
    );
    await pool.query(
      `INSERT INTO invoices (
         organization_id, invoice_number, due_date, total, amount_due, created_by
       ) VALUES ($1, 'ROLL-00700', CURRENT_DATE, 0, 0, $2)`,
      [organizationId, memberId],
    );
    const failed = await recurringInvoicesService.generateDue(1);
    expect(failed.failures).toEqual([{
      templateId: rollbackId,
      organizationId,
      reason: 'DATABASE_ERROR',
    }]);
    const rollback = await pool.query<{
      next_invoice_number: number;
      next_run_unchanged: boolean;
      generated: boolean;
      generated_invoices: number;
    }>(
      `SELECT ps.next_invoice_number,
              r.next_run_date = CURRENT_DATE AS next_run_unchanged,
              r.last_generated_at IS NOT NULL AS generated,
              (SELECT COUNT(*) FROM invoices i
               WHERE i.organization_id = r.organization_id
                 AND i.recurring_template_id = r.id)::int AS generated_invoices
       FROM recurring_invoice_templates r
       JOIN payment_settings ps ON ps.organization_id = r.organization_id
       WHERE r.id = $1 AND r.organization_id = $2`,
      [rollbackId, organizationId],
    );
    expect(rollback.rows[0]).toEqual({
      next_invoice_number: 700,
      next_run_unchanged: true,
      generated: false,
      generated_invoices: 0,
    });
  });

  it('enforces recurring CSRF, tenant references, dates, and private misses', async () => {
    const noCsrf = await graphql(
      memberToken, organizationId, recurringMutation,
      { input: recurringInput() }, false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const foreign = await graphql(
      memberToken, organizationId, recurringMutation,
      { input: { ...recurringInput(), contactId: outsiderContactId } },
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const invalidDate = await graphql(
      memberToken, organizationId, recurringMutation,
      { input: { ...recurringInput(), endDate: '2026-07-19' } },
    ).expect(200);
    expect(invalidDate.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_DATE_ORDER',
    });
    const created = await graphql(
      memberToken, organizationId, recurringMutation,
      { input: recurringInput() },
    ).expect(200);
    const id = Number(created.body.data.createRecurringInvoice.id);
    const hidden = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query RecurringInvoice($id: Int!) { recurringInvoice(id: $id) { id } }`,
      { id },
      false,
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });
});
