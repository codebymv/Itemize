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
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();

    const createCrudRouter =
      require('../../../backend/src/routes/invoices/crud.routes');
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
