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

describe('Category GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let memberToken: string;
  let outsiderToken: string;
  let generalId: number;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for category tests');
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
       VALUES ($1, 'Category Member', 'email', true),
              ($2, 'Category Outsider', 'email', true)
       RETURNING id`,
      [
        `category-member-${suffix}@test.itemize`,
        `category-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    memberToken = await jwt.signAsync(
      { id: memberId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );

    const general = await pool.query<{ id: number }>(
      `SELECT id
       FROM categories
       WHERE user_id = $1 AND name = 'General'`,
      [memberId],
    );
    generalId = Number(general.rows[0]?.id);

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

    const createCategoriesRouter = require('../../../backend/src/routes/categories.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use('/api', createCategoriesRouter(pool, authenticateJWT));
  });

  afterAll(async () => {
    if (pool && (memberId || outsiderId)) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        [memberId, outsiderId].filter(Boolean),
      ]);
    }
    if (app) await app.close();
  });

  const query = (
    token: string,
    document: string,
    variables: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .send({ query: document, variables });

  const mutation = (
    token: string,
    document: string,
    variables: Record<string, unknown> = {},
  ) => {
    const csrf = 'category-csrf';
    return request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .send({ query: document, variables });
  };

  const fields = 'id name colorValue createdAt updatedAt';

  it('seeds General for new users and keeps reads user-scoped', async () => {
    expect(generalId).toBeGreaterThan(0);

    const member = await query(
      memberToken,
      `{ categories { ${fields} } }`,
    ).expect(200);
    const outsider = await query(
      outsiderToken,
      `{ categories { ${fields} } }`,
    ).expect(200);
    const legacy = await request(legacyApp)
      .get('/api/categories')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .expect(200);

    expect(member.body.errors).toBeUndefined();
    expect(member.body.data.categories).toHaveLength(1);
    expect(member.body.data.categories[0]).toMatchObject({
      id: generalId,
      name: 'General',
      colorValue: '#6B7280',
    });
    expect(legacy.body.data.map((category: { name: string }) => category.name))
      .toEqual(member.body.data.categories.map(
        (category: { name: string }) => category.name,
      ));
    expect(outsider.body.data.categories).toHaveLength(1);
    expect(outsider.body.data.categories[0].id).not.toBe(generalId);
  });

  it('keeps the characterized REST CRUD path available for rollback', async () => {
    const created = await request(legacyApp)
      .post('/api/categories')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .send({ name: 'Legacy rollback', color_value: '#123' })
      .expect(201);
    expect(created.body.data).toMatchObject({
      name: 'Legacy rollback',
      color_value: '#123',
    });

    const categoryId = Number(created.body.data.id);
    const updated = await request(legacyApp)
      .put(`/api/categories/${categoryId}`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .send({ name: 'Legacy renamed', color_value: '#456' })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      id: categoryId,
      name: 'Legacy renamed',
      color_value: '#456',
    });

    const deleted = await request(legacyApp)
      .delete(`/api/categories/${categoryId}`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .expect(200);
    expect(deleted.body.data).toEqual({
      message: 'Category deleted successfully',
    });
  });

  it('validates creates, normalizes colors, and requires CSRF', async () => {
    const created = await mutation(
      memberToken,
      `mutation Create($input: CreateCategoryInput!) {
        createCategory(input: $input) { ${fields} }
      }`,
      { input: { name: ' Work ', colorValue: '#abc' } },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createCategory).toMatchObject({
      name: 'Work',
      colorValue: '#ABC',
    });

    const duplicate = await mutation(
      memberToken,
      `mutation Create($input: CreateCategoryInput!) {
        createCategory(input: $input) { id }
      }`,
      { input: { name: 'Work' } },
    ).expect(200);
    expect(duplicate.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'DUPLICATE_CATEGORY_NAME',
    });

    const noCsrf = await query(
      memberToken,
      `mutation {
        createCategory(input: { name: "Denied" }) { id }
      }`,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('propagates a rename through every personal content store atomically', async () => {
    const work = await pool.query<{ id: number }>(
      `SELECT id FROM categories WHERE user_id = $1 AND name = 'Work'`,
      [memberId],
    );
    const workId = Number(work.rows[0].id);
    await Promise.all([
      pool.query(
        `INSERT INTO lists (user_id, title, category, category_id)
         VALUES ($1, 'Category list', 'Work', $2)`,
        [memberId, workId],
      ),
      pool.query(
        `INSERT INTO notes (user_id, title, category, category_id)
         VALUES ($1, 'Category note', 'Work', $2)`,
        [memberId, workId],
      ),
      pool.query(
        `INSERT INTO whiteboards (user_id, title, category)
         VALUES ($1, 'Category whiteboard', 'Work')`,
        [memberId],
      ),
      pool.query(
        `INSERT INTO wireframes (user_id, title, category)
         VALUES ($1, 'Category wireframe', 'Work')`,
        [memberId],
      ),
      pool.query(
        `INSERT INTO vaults (user_id, title, category)
         VALUES ($1, 'Category vault', 'Work')`,
        [memberId],
      ),
    ]);

    const renamed = await mutation(
      memberToken,
      `mutation Update($id: Int!, $input: UpdateCategoryInput!) {
        updateCategory(id: $id, input: $input) { ${fields} }
      }`,
      { id: workId, input: { name: 'Projects' } },
    ).expect(200);
    expect(renamed.body.errors).toBeUndefined();
    expect(renamed.body.data.updateCategory).toMatchObject({
      id: workId,
      name: 'Projects',
      colorValue: '#ABC',
    });

    const content = await pool.query<{
      source: string;
      category: string;
      category_id: number | null;
    }>(
      `SELECT 'lists' AS source, category, category_id
       FROM lists WHERE user_id = $1 AND title = 'Category list'
       UNION ALL
       SELECT 'notes', category, category_id
       FROM notes WHERE user_id = $1 AND title = 'Category note'
       UNION ALL
       SELECT 'whiteboards', category, NULL
       FROM whiteboards WHERE user_id = $1 AND title = 'Category whiteboard'
       UNION ALL
       SELECT 'wireframes', category, NULL
       FROM wireframes WHERE user_id = $1 AND title = 'Category wireframe'
       UNION ALL
       SELECT 'vaults', category, NULL
       FROM vaults WHERE user_id = $1 AND title = 'Category vault'
       ORDER BY source`,
      [memberId],
    );
    expect(content.rows).toHaveLength(5);
    expect(content.rows.every((row) => row.category === 'Projects')).toBe(true);
    expect(
      content.rows
        .filter((row) => row.source === 'lists' || row.source === 'notes')
        .every((row) => Number(row.category_id) === workId),
    ).toBe(true);
  });

  it('transactionally reassigns deletes to General and protects the invariant', async () => {
    const projects = await pool.query<{ id: number }>(
      `SELECT id FROM categories WHERE user_id = $1 AND name = 'Projects'`,
      [memberId],
    );
    const projectsId = Number(projects.rows[0].id);
    const deleted = await mutation(
      memberToken,
      `mutation Delete($id: Int!) {
        deleteCategory(id: $id) { deletedId }
      }`,
      { id: projectsId },
    ).expect(200);
    expect(deleted.body.errors).toBeUndefined();
    expect(deleted.body.data.deleteCategory.deletedId).toBe(projectsId);

    const content = await pool.query<{
      source: string;
      category: string;
      category_id: number | null;
    }>(
      `SELECT 'lists' AS source, category, category_id
       FROM lists WHERE user_id = $1 AND title = 'Category list'
       UNION ALL
       SELECT 'notes', category, category_id
       FROM notes WHERE user_id = $1 AND title = 'Category note'
       UNION ALL
       SELECT 'whiteboards', category, NULL
       FROM whiteboards WHERE user_id = $1 AND title = 'Category whiteboard'
       UNION ALL
       SELECT 'wireframes', category, NULL
       FROM wireframes WHERE user_id = $1 AND title = 'Category wireframe'
       UNION ALL
       SELECT 'vaults', category, NULL
       FROM vaults WHERE user_id = $1 AND title = 'Category vault'`,
      [memberId],
    );
    expect(content.rows.every((row) => row.category === 'General')).toBe(true);
    expect(
      content.rows
        .filter((row) => row.source === 'lists' || row.source === 'notes')
        .every((row) => Number(row.category_id) === generalId),
    ).toBe(true);

    const protectedDelete = await mutation(
      memberToken,
      `mutation Delete($id: Int!) {
        deleteCategory(id: $id) { deletedId }
      }`,
      { id: generalId },
    ).expect(200);
    expect(protectedDelete.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'GENERAL_CATEGORY_REQUIRED',
    });

    const protectedRename = await mutation(
      memberToken,
      `mutation Update($id: Int!, $input: UpdateCategoryInput!) {
        updateCategory(id: $id, input: $input) { id }
      }`,
      { id: generalId, input: { name: 'Default' } },
    ).expect(200);
    expect(protectedRename.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'GENERAL_CATEGORY_REQUIRED',
    });
  });
});
