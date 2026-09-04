import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Product catalog GraphQL PostgreSQL contract', () => {
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
      throw new Error('TEST_DATABASE_URL is required for product tests');
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
       VALUES ($1, 'Product Member', 'email', true),
              ($2, 'Product Outsider', 'email', true)
       RETURNING id`,
      [
        `product-member-${suffix}@test.itemize`,
        `product-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Product Primary', $1), ('Product Other', $2)
       RETURNING id`,
      [`product-primary-${suffix}`, `product-other-${suffix}`],
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
      `UPDATE users
       SET default_organization_id = CASE id
         WHEN $3 THEN $1
         WHEN $4 THEN $2
         ELSE default_organization_id
       END
       WHERE id = ANY($5::int[])`,
      [
        organizationId,
        outsiderOrganizationId,
        memberId,
        outsiderId,
        [memberId, outsiderId],
      ],
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

  const graphql = (
    token: string,
    orgId: number,
    document: string,
    variables: Record<string, unknown> = {},
    csrf = true,
  ) => {
    const call = request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', csrf
        ? `itemize_auth=${token}; csrf-token=product-csrf`
        : `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));
    if (csrf) call.set('x-csrf-token', 'product-csrf');
    return call.send({ query: document, variables });
  };

  const fields = `
    id organizationId name description sku price currency productType
    billingPeriod taxRate taxable isActive createdById createdAt updatedAt
  `;

  it('lists only the verified organization and treats search metacharacters literally', async () => {
    const fixtures = await pool.query<{ id: number }>(
      `INSERT INTO products (
         organization_id, name, sku, price, created_by
       ) VALUES
         ($1, 'Literal %_ service', 'OWN-%_', 49.95, $3),
         ($2, 'Literal %_ foreign', 'OTHER-%_', 49.95, $4)
       RETURNING id`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    const ownId = Number(fixtures.rows[0].id);
    const foreignId = Number(fixtures.rows[1].id);

    const listed = await graphql(
      memberToken,
      organizationId,
      `query Products($filter: ProductFilterInput) {
        products(filter: $filter) {
          nodes { id organizationId name sku }
          pageInfo { total }
          stats { total active inactive oneTime recurring }
        }
      }`,
      { filter: { search: '%_', productType: 'one_time' } },
      false,
    ).expect(200);
    expect(listed.body.errors).toBeUndefined();
    expect(listed.body.data.products).toMatchObject({
      nodes: [
        {
          id: ownId,
          organizationId,
          name: 'Literal %_ service',
          sku: 'OWN-%_',
        },
      ],
      pageInfo: { total: 1 },
      stats: expect.objectContaining({ total: 1, active: 1, oneTime: 1 }),
    });
    expect(
      listed.body.data.products.nodes.map((product: { id: number }) => product.id),
    ).toEqual([ownId]);

    await pool.query('DELETE FROM products WHERE id = ANY($1::int[])', [
      [ownId, foreignId],
    ]);
  });

  it('keeps GraphQL CRUD decimal-safe and authoritative in PostgreSQL', async () => {
    const createMutation = `mutation Create(
      $input: CreateProductInput!
      $idempotencyKey: String!
    ) {
      createProduct(input: $input, idempotencyKey: $idempotencyKey) { ${fields} }
    }`;
    const createVariables = {
      input: {
        name: ' Monthly retainer ',
        description: ' Priority support ',
        sku: ' RETAINER ',
        price: '1200.50',
        currency: 'usd',
        productType: 'recurring',
        billingPeriod: 'monthly',
        taxRate: '8.25',
      },
      idempotencyKey: `product-retainer-${Date.now()}`,
    };
    const [created, replayed] = await Promise.all([
      graphql(memberToken, organizationId, createMutation, createVariables),
      graphql(memberToken, organizationId, createMutation, createVariables),
    ]);
    expect(created.status).toBe(200);
    expect(replayed.status).toBe(200);
    expect(created.body.errors).toBeUndefined();
    expect(replayed.body.errors).toBeUndefined();
    expect(created.body.data.createProduct).toMatchObject({
      organizationId,
      name: 'Monthly retainer',
      description: 'Priority support',
      sku: 'RETAINER',
      price: '1200.50',
      currency: 'USD',
      productType: 'recurring',
      billingPeriod: 'monthly',
      taxRate: '8.25',
    });
    const id = Number(created.body.data.createProduct.id);
    expect(Number(replayed.body.data.createProduct.id)).toBe(id);

    const conflicting = await graphql(
      memberToken,
      organizationId,
      createMutation,
      {
        ...createVariables,
        input: { ...createVariables.input, name: 'Different product' },
      },
    ).expect(200);
    expect(conflicting.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'IDEMPOTENCY_KEY_REUSED',
    });

    const stored = await pool.query<{
      id: number;
      product_type: string;
      billing_period: string | null;
      price: string;
    }>(
      `SELECT id, product_type, billing_period, price
       FROM products
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    expect(stored.rows[0]).toMatchObject({
      id,
      product_type: 'recurring',
      billing_period: 'monthly',
      price: '1200.50',
    });

    const listed = await graphql(
      memberToken,
      organizationId,
      `query Products($filter: ProductFilterInput, $page: PageInput) {
        products(filter: $filter, page: $page) {
          nodes { ${fields} }
          pageInfo { page pageSize total hasNextPage }
        }
      }`,
      {
        filter: { isActive: true, search: 'retainer' },
        page: { page: 1, pageSize: 1 },
      },
      false,
    ).expect(200);
    expect(listed.body.errors).toBeUndefined();
    expect(listed.body.data.products.nodes[0].id).toBe(id);
    expect(listed.body.data.products.pageInfo).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
      hasNextPage: false,
    });

    const updated = await graphql(
      memberToken,
      organizationId,
      `mutation Update($id: Int!, $input: UpdateProductInput!) {
        updateProduct(id: $id, input: $input) { ${fields} }
      }`,
      {
        id,
        input: {
          description: null,
          sku: null,
          productType: 'one_time',
          isActive: false,
        },
      },
    ).expect(200);
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data.updateProduct).toMatchObject({
      id,
      description: null,
      sku: null,
      productType: 'one_time',
      billingPeriod: null,
      isActive: false,
    });

    const deleted = await graphql(
      memberToken,
      organizationId,
      `mutation Delete($id: Int!) {
        deleteProduct(id: $id) { deletedId success }
      }`,
      { id },
    ).expect(200);
    expect(deleted.body.data.deleteProduct).toEqual({
      deletedId: id,
      success: true,
    });

    const unavailable = await graphql(
      memberToken,
      organizationId,
      createMutation,
      createVariables,
    ).expect(200);
    expect(unavailable.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE',
    });
  });

  it('enforces CSRF, validation, and tenant-hidden mutation outcomes', async () => {
    const noCsrf = await graphql(
      memberToken,
      organizationId,
      `mutation {
        createProduct(
          input: { name: "Denied", price: "10" }
          idempotencyKey: "product-no-csrf"
        ) { id }
      }`,
      {},
      false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const invalid = await graphql(
      memberToken,
      organizationId,
      `mutation Create($input: CreateProductInput!, $idempotencyKey: String!) {
        createProduct(input: $input, idempotencyKey: $idempotencyKey) { id }
      }`,
      {
        input: {
          name: 'Invalid',
          price: '10.999',
          productType: 'recurring',
          taxRate: '100.01',
        },
        idempotencyKey: `product-invalid-${Date.now()}`,
      },
    ).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
    });

    const foreign = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `mutation Update($id: Int!, $input: UpdateProductInput!) {
        updateProduct(id: $id, input: $input) { id }
      }`,
      { id: 2147483647, input: { name: 'Hidden' } },
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });
});
