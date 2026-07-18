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

describe('Workspace content GraphQL PostgreSQL reads', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let memberToken: string;
  let outsiderToken: string;
  let workCategoryId: number;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for workspace content tests');
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
       VALUES ($1, 'Workspace Member', 'email', true),
              ($2, 'Workspace Outsider', 'email', true)
       RETURNING id`,
      [
        `workspace-member-${suffix}@test.itemize`,
        `workspace-outsider-${suffix}@test.itemize`,
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

    const category = await pool.query<{ id: number }>(
      `INSERT INTO categories (user_id, name, color_value)
       VALUES ($1, 'Work', '#123456')
       RETURNING id`,
      [memberId],
    );
    workCategoryId = Number(category.rows[0].id);
    const outsiderGeneral = await pool.query<{ id: number }>(
      `SELECT id FROM categories WHERE user_id = $1 AND name = 'General'`,
      [outsiderId],
    );
    const foreignCategoryId = Number(outsiderGeneral.rows[0].id);

    await pool.query(
      `INSERT INTO lists
         (user_id, title, category, category_id, items, position_x, position_y)
       VALUES
         ($1, 'Alpha tasks', 'Work', NULL, $2::jsonb, 10, 20),
         ($1, 'Beta tasks', 'General', $3, '[]'::jsonb, 30, 40),
         ($4, 'Outsider list', 'General', $3, '[]'::jsonb, 0, 0)`,
      [
        memberId,
        JSON.stringify([{ id: 'a', text: 'Ship it', completed: false }]),
        foreignCategoryId,
        outsiderId,
      ],
    );
    await pool.query(
      `INSERT INTO notes
         (user_id, title, content, category, category_id, position_x, position_y)
       VALUES
         ($1, 'Alpha note', 'release details', 'Work', NULL, 50, 60),
         ($1, 'Beta note', 'personal details', 'General', $2, 70, 80),
         ($3, 'Outsider note', 'private', 'General', $2, 0, 0)`,
      [memberId, foreignCategoryId, outsiderId],
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

    const createListsRouter = require('../../../backend/src/routes/lists.routes');
    const createNotesRouter = require('../../../backend/src/routes/notes.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    const broadcast = {};
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use('/api', createListsRouter(pool, authenticateJWT, broadcast));
    legacyApp.use('/api', createNotesRouter(pool, authenticateJWT, broadcast));
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

  const listFields = `
    id userId title category categoryId
    items { id text completed }
    colorValue positionX positionY width height zIndex
    shareToken isPublic sharedAt createdAt updatedAt`;
  const noteFields = `
    id userId title content category categoryId
    colorValue positionX positionY width height zIndex
    shareToken isPublic sharedAt createdAt updatedAt`;

  it('returns deterministic user-scoped list pages and repairs category identity at read time', async () => {
    const result = await query(
      memberToken,
      `query Lists($filter: WorkspaceContentFilterInput, $page: PageInput) {
        workspaceLists(filter: $filter, page: $page) {
          nodes { ${listFields} }
          pageInfo { page pageSize total totalPages hasNextPage hasPreviousPage }
        }
      }`,
      {
        filter: { search: 'tasks', categoryId: workCategoryId },
        page: { page: 1, pageSize: 1 },
      },
    ).expect(200);

    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.workspaceLists.pageInfo).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    });
    expect(result.body.data.workspaceLists.nodes[0]).toMatchObject({
      userId: memberId,
      title: 'Alpha tasks',
      category: 'Work',
      categoryId: workCategoryId,
      items: [{ id: 'a', text: 'Ship it', completed: false }],
    });

    const outsider = await query(
      outsiderToken,
      `{ workspaceLists { nodes { id userId title } pageInfo { total } } }`,
    ).expect(200);
    expect(outsider.body.data.workspaceLists.nodes).toHaveLength(1);
    expect(outsider.body.data.workspaceLists.nodes[0]).toMatchObject({
      userId: outsiderId,
      title: 'Outsider list',
    });
  });

  it('returns user-scoped note pages with title/content search', async () => {
    const result = await query(
      memberToken,
      `query Notes($filter: WorkspaceContentFilterInput) {
        workspaceNotes(filter: $filter) {
          nodes { ${noteFields} }
          pageInfo { total }
        }
      }`,
      { filter: { search: 'release', categoryId: workCategoryId } },
    ).expect(200);

    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.workspaceNotes.pageInfo.total).toBe(1);
    expect(result.body.data.workspaceNotes.nodes[0]).toMatchObject({
      userId: memberId,
      title: 'Alpha note',
      content: 'release details',
      category: 'Work',
      categoryId: workCategoryId,
    });
  });

  it('keeps all three characterized REST read paths available for rollback', async () => {
    const lists = await request(legacyApp)
      .get('/api/lists')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .expect(200);
    const canvasLists = await request(legacyApp)
      .get('/api/canvas/lists')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .expect(200);
    const notes = await request(legacyApp)
      .get('/api/notes')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .expect(200);

    expect(lists.body.lists).toHaveLength(2);
    expect(canvasLists.body).toHaveLength(2);
    expect(notes.body.notes).toHaveLength(2);
  });

  it('rejects invalid filters and pagination without querying another user', async () => {
    const invalidCategory = await query(
      memberToken,
      `query {
        workspaceLists(filter: { categoryId: 0 }) {
          nodes { id }
        }
      }`,
    ).expect(200);
    expect(invalidCategory.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      field: 'categoryId',
    });

    const invalidPage = await query(
      memberToken,
      `query {
        workspaceNotes(page: { page: 1, pageSize: 101 }) {
          nodes { id }
        }
      }`,
    ).expect(200);
    expect(invalidPage.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      field: 'pageSize',
    });
  });
});
