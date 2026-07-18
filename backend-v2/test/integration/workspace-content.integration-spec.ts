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
  let mutationListId: number;
  let mutationNoteId: number;
  const sharedListToken = 'f0b7d55d-ec6b-4eb6-aaf4-165c0d82e417';
  const sharedNoteToken = '87a47b12-f802-4e70-97af-8cf98bff3d4d';
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
      await pool.query(
        `DELETE FROM realtime_event_outbox
         WHERE (
           aggregate_type = 'note'
           AND (
             aggregate_id = $2
             OR aggregate_id IN (
               SELECT id FROM notes WHERE user_id = ANY($1::int[])
             )
           )
         ) OR (
           aggregate_type = 'list'
           AND (
             aggregate_id = $3
             OR aggregate_id IN (
               SELECT id FROM lists WHERE user_id = ANY($1::int[])
             )
           )
         )`,
        [
          [memberId, outsiderId].filter(Boolean),
          mutationNoteId || 0,
          mutationListId || 0,
        ],
      );
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
    includeCsrf = true,
  ) => {
    const csrf = 'workspace-note-csrf';
    const pending = request(app.getHttpServer())
      .post('/graphql')
      .set(
        'Cookie',
        includeCsrf
          ? `itemize_auth=${token}; csrf-token=${csrf}`
          : `itemize_auth=${token}`,
      );
    if (includeCsrf) pending.set('x-csrf-token', csrf);
    return pending.send({ query: document, variables });
  };

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

  it('creates a canonical list that remains readable through REST', async () => {
    const result = await mutation(
      memberToken,
      `mutation Create($input: CreateWorkspaceListInput!) {
        createWorkspaceList(input: $input) { ${listFields} }
      }`,
      {
        input: {
          title: ' GraphQL tasks ',
          category: 'work',
          colorValue: '#abcdef',
          items: [{ id: 'ship', text: ' Ship it ', completed: false }],
          positionX: -15.25,
          positionY: 100.125,
          width: 340,
          height: 265,
        },
      },
    ).expect(200);

    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.createWorkspaceList).toMatchObject({
      userId: memberId,
      title: 'GraphQL tasks',
      category: 'Work',
      categoryId: workCategoryId,
      colorValue: '#ABCDEF',
      items: [{ id: 'ship', text: 'Ship it', completed: false }],
      positionX: -15.25,
      positionY: 100.125,
    });
    mutationListId = result.body.data.createWorkspaceList.id;

    const rest = await request(legacyApp)
      .get('/api/canvas/lists')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .expect(200);
    expect(rest.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: mutationListId,
          category: 'Work',
          category_id: workCategoryId,
        }),
      ]),
    );
  });

  it('commits list owner/shared projections and rejects a stale snapshot', async () => {
    await pool.query(
      `UPDATE lists
       SET is_public = TRUE, share_token = $1, shared_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [sharedListToken, mutationListId, memberId],
    );
    const revision = await pool.query<{ updated_at: Date }>(
      'SELECT updated_at FROM lists WHERE id = $1',
      [mutationListId],
    );
    const expectedUpdatedAt = revision.rows[0].updated_at.toISOString();
    const mutationId = 'f3d0863d-73de-4267-821a-91c06c827b54';
    const document = `mutation Update(
      $id: Int!, $input: UpdateWorkspaceListInput!
    ) {
      updateWorkspaceList(id: $id, input: $input) { ${listFields} }
    }`;
    const updated = await mutation(memberToken, document, {
      id: mutationListId,
      input: {
        mutationId,
        expectedUpdatedAt,
        items: [{ id: 'ship', text: 'Ship it', completed: true }],
      },
    }).expect(200);
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data.updateWorkspaceList.items[0].completed).toBe(true);
    expect(
      new Date(updated.body.data.updateWorkspaceList.updatedAt).getTime(),
    ).toBeGreaterThan(new Date(expectedUpdatedAt).getTime());

    const events = await pool.query<{
      channel: string;
      event_name: string;
      event_type: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT channel, event_name, event_type, payload
       FROM realtime_event_outbox
       WHERE event_key = ANY($1::text[])
       ORDER BY channel`,
      [[
        `list:${mutationListId}:update:${mutationId}:owner`,
        `list:${mutationListId}:update:${mutationId}:shared`,
      ]],
    );
    expect(events.rows).toEqual([
      expect.objectContaining({
        channel: 'shared_list',
        event_name: 'listUpdated',
        event_type: 'LIST_UPDATE',
        payload: expect.objectContaining({ id: mutationListId }),
      }),
      expect.objectContaining({
        channel: 'user_canvas',
        event_name: 'userListUpdated',
        event_type: 'LIST_UPDATE',
        payload: expect.objectContaining({
          id: mutationListId,
          type: 'Work',
        }),
      }),
    ]);

    const stale = await mutation(memberToken, document, {
      id: mutationListId,
      input: {
        mutationId: '2d804cdb-b890-45a0-a779-41d8c9bb866b',
        expectedUpdatedAt,
        title: 'Stale overwrite',
      },
    }).expect(200);
    expect(stale.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'STALE_LIST_REVISION',
      currentUpdatedAt: expect.any(String),
    });
  });

  it('deletes a list with durable owner and shared projections', async () => {
    const mutationId = 'd71ce421-8cee-443b-b672-7a0428020b88';
    const deleted = await mutation(
      memberToken,
      `mutation Delete($id: Int!, $mutationId: String!) {
        deleteWorkspaceList(id: $id, mutationId: $mutationId) { deletedId }
      }`,
      { id: mutationListId, mutationId },
    ).expect(200);
    expect(deleted.body.errors).toBeUndefined();
    expect(deleted.body.data.deleteWorkspaceList.deletedId).toBe(
      mutationListId,
    );

    const events = await pool.query<{ channel: string; event_type: string }>(
      `SELECT channel, event_type
       FROM realtime_event_outbox
       WHERE event_key = ANY($1::text[])
       ORDER BY channel`,
      [[
        `list:${mutationListId}:delete:${mutationId}:owner`,
        `list:${mutationListId}:delete:${mutationId}:shared`,
      ]],
    );
    expect(events.rows).toEqual([
      { channel: 'shared_list', event_type: 'listDeleted' },
      { channel: 'user_canvas', event_type: 'listDeleted' },
    ]);
    const rest = await request(legacyApp)
      .put(`/api/lists/${mutationListId}/title`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .send({ title: 'Gone' })
      .expect(404);
    expect(rest.body.error).toBe('List not found');
  });

  it('self-heals a missing General category for default note creation', async () => {
    await pool.query(
      `DELETE FROM categories
       WHERE user_id = $1 AND name = 'General'`,
      [memberId],
    );

    const result = await mutation(
      memberToken,
      `mutation Create($input: CreateWorkspaceNoteInput!) {
        createWorkspaceNote(input: $input) { id category categoryId }
      }`,
      {
        input: {
          title: 'Default category note',
          positionX: 2013.7268237520689,
          positionY: 1987.125,
        },
      },
    ).expect(200);

    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.createWorkspaceNote).toMatchObject({
      category: 'General',
      categoryId: expect.any(Number),
    });

    const category = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM categories
       WHERE user_id = $1 AND name = 'General'`,
      [memberId],
    );
    expect(category.rows[0].count).toBe('1');
    await pool.query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [
      result.body.data.createWorkspaceNote.id,
      memberId,
    ]);
  });

  it('creates a canonical note that remains readable through REST', async () => {
    const result = await mutation(
      memberToken,
      `mutation Create($input: CreateWorkspaceNoteInput!) {
        createWorkspaceNote(input: $input) { ${noteFields} }
      }`,
      {
        input: {
          title: ' GraphQL note ',
          content: 'Created through Nest',
          category: 'work',
          colorValue: '#abcdef',
          positionX: 90.75,
          positionY: 100.125,
          width: 570,
          height: 350,
        },
      },
    ).expect(200);

    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.createWorkspaceNote).toMatchObject({
      userId: memberId,
      title: 'GraphQL note',
      content: 'Created through Nest',
      category: 'Work',
      categoryId: workCategoryId,
      colorValue: '#ABCDEF',
      positionX: 90.75,
      positionY: 100.125,
    });
    mutationNoteId = result.body.data.createWorkspaceNote.id;

    const rest = await request(legacyApp)
      .get('/api/notes')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .expect(200);
    expect(rest.body.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: mutationNoteId,
          category: 'Work',
        }),
      ]),
    );

    const storedCategory = await pool.query<{
      category: string;
      category_id: number;
    }>(
      'SELECT category, category_id FROM notes WHERE id = $1',
      [mutationNoteId],
    );
    expect(storedCategory.rows[0]).toEqual({
      category: 'Work',
      category_id: workCategoryId,
    });
  });

  it('commits a shared update with its outbox projection and legacy delivery', async () => {
    await pool.query(
      `UPDATE notes
       SET is_public = TRUE, share_token = $1, shared_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [sharedNoteToken, mutationNoteId, memberId],
    );
    const mutationId = 'd85e82f1-7745-43ec-b831-a34ebf0fe846';
    const result = await mutation(
      memberToken,
      `mutation Update($id: Int!, $input: UpdateWorkspaceNoteInput!) {
        updateWorkspaceNote(id: $id, input: $input) { ${noteFields} }
      }`,
      {
        id: mutationNoteId,
        input: { mutationId, content: 'Committed shared content' },
      },
    ).expect(200);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.updateWorkspaceNote.content).toBe(
      'Committed shared content',
    );

    const outbox = await pool.query<{
      id: string;
      event_type: string;
      payload: Record<string, unknown>;
      status: string;
    }>(
      `SELECT id, event_type, payload, status
       FROM realtime_event_outbox
       WHERE event_key = $1`,
      [`note:${mutationNoteId}:update:${mutationId}:shared`],
    );
    expect(outbox.rows[0]).toMatchObject({
      event_type: 'CONTENT_CHANGED',
      status: 'queued',
      payload: {
        id: mutationNoteId,
        content: 'Committed shared content',
      },
    });

    const noteUpdate = jest.fn();
    const { runRealtimeOutboxJobs } = require(
      '../../../backend/src/jobs/realtime-outbox-jobs',
    );
    const delivered = await runRealtimeOutboxJobs(
      pool,
      { noteUpdate },
      {
        batchSize: 1,
        outboxId: outbox.rows[0].id,
        workerId: 'nestjs-note-integration',
      },
    );
    expect(delivered).toMatchObject({ claimed: 1, sent: 1 });
    expect(noteUpdate).toHaveBeenCalledWith(
      sharedNoteToken,
      'CONTENT_CHANGED',
      expect.objectContaining({
        id: mutationNoteId,
        content: 'Committed shared content',
      }),
      expect.any(String),
    );
  });

  it('serializes disjoint updates and conceals the note from another user', async () => {
    const updateDocument = `mutation Update(
      $id: Int!, $input: UpdateWorkspaceNoteInput!
    ) {
      updateWorkspaceNote(id: $id, input: $input) { id title content }
    }`;
    const [titleUpdate, contentUpdate] = await Promise.all([
      mutation(memberToken, updateDocument, {
        id: mutationNoteId,
        input: {
          mutationId: '30d3c419-d8ca-48ef-ac4c-6e516fd6fb46',
          title: 'Concurrent title',
        },
      }),
      mutation(memberToken, updateDocument, {
        id: mutationNoteId,
        input: {
          mutationId: 'd5b54c5c-0fd2-4504-99db-c57ffc81292c',
          content: 'Concurrent content',
        },
      }),
    ]);
    expect(titleUpdate.body.errors).toBeUndefined();
    expect(contentUpdate.body.errors).toBeUndefined();

    const stored = await pool.query<{ title: string; content: string }>(
      'SELECT title, content FROM notes WHERE id = $1',
      [mutationNoteId],
    );
    expect(stored.rows[0]).toEqual({
      title: 'Concurrent title',
      content: 'Concurrent content',
    });

    const outsider = await mutation(outsiderToken, updateDocument, {
      id: mutationNoteId,
      input: {
        mutationId: '4d95084c-3b8c-4224-a449-59a98e56008f',
        title: 'Hijacked',
      },
    }).expect(200);
    expect(outsider.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('deletes atomically with a shared projection and enforces CSRF', async () => {
    const noCsrf = await mutation(
      memberToken,
      `mutation {
        updateWorkspaceNote(
          id: ${mutationNoteId},
          input: {
            mutationId: "3f18cd51-0513-4432-9c65-f9ddf46258a9",
            title: "Rejected"
          }
        ) { id }
      }`,
      {},
      false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const mutationId = '7f26e1b4-af45-46ad-9f08-20b8ce6c7c89';
    const deleted = await mutation(
      memberToken,
      `mutation Delete($id: Int!, $mutationId: String!) {
        deleteWorkspaceNote(id: $id, mutationId: $mutationId) { deletedId }
      }`,
      { id: mutationNoteId, mutationId },
    ).expect(200);
    expect(deleted.body.errors).toBeUndefined();
    expect(deleted.body.data.deleteWorkspaceNote.deletedId).toBe(
      mutationNoteId,
    );

    const persisted = await pool.query<{
      event_type: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT event_type, payload
       FROM realtime_event_outbox
       WHERE event_key = $1`,
      [`note:${mutationNoteId}:delete:${mutationId}:shared`],
    );
    expect(persisted.rows[0]).toMatchObject({
      event_type: 'noteDeleted',
      payload: {
        id: mutationNoteId,
        message: 'This note has been deleted by the owner',
      },
    });

    const rest = await request(legacyApp)
      .put(`/api/notes/${mutationNoteId}/content`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .send({ content: 'Gone' })
      .expect(404);
    expect(rest.body.error).toBe('Note not found');
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

    expect(lists.headers['cache-control']).toBe('private, no-store');
    expect(canvasLists.headers['cache-control']).toBe('private, no-store');
    expect(notes.headers['cache-control']).toBe('private, no-store');
    expect(lists.headers.etag).toEqual(expect.any(String));
    expect(canvasLists.headers.etag).toEqual(expect.any(String));
    expect(notes.headers.etag).toEqual(expect.any(String));

    const conditionalLists = await request(legacyApp)
      .get('/api/lists')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('If-None-Match', lists.headers.etag)
      .expect(200);
    const conditionalCanvasLists = await request(legacyApp)
      .get('/api/canvas/lists')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('If-None-Match', canvasLists.headers.etag)
      .expect(200);
    const conditionalNotes = await request(legacyApp)
      .get('/api/notes')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('If-None-Match', notes.headers.etag)
      .expect(200);

    expect(lists.body.lists).toHaveLength(2);
    expect(canvasLists.body).toHaveLength(2);
    expect(notes.body.notes).toHaveLength(2);
    expect(conditionalLists.body.lists).toHaveLength(2);
    expect(conditionalCanvasLists.body).toHaveLength(2);
    expect(conditionalNotes.body.notes).toHaveLength(2);
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
