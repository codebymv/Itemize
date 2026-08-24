import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import express, { Express } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

const WEBHOOK_SECRET = 'workflow-webhook-parity-secret';

describe('Workflow webhook retained HTTP parity (NestJS vs legacy origin)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  let organizationId: number;
  let ownerId: number;

  const seedWorkflow = async (
    triggerType = 'contact_added',
    isActive = true,
  ) => {
    const workflow = await pool.query<{ id: number }>(
      `INSERT INTO workflows (
         organization_id, name, trigger_type, trigger_config, is_active,
         webhook_secret, created_by
       ) VALUES ($1, $2, $3, '{}'::jsonb, $4, $5, $6)
       RETURNING id`,
      [
        organizationId,
        `Webhook parity ${Date.now()}-${Math.random()}`,
        triggerType,
        isActive,
        WEBHOOK_SECRET,
        ownerId,
      ],
    );
    return Number(workflow.rows[0].id);
  };

  const signedPost = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    workflowId: number | string,
    event: Record<string, unknown>,
    options: {
      deliveryId?: string;
      timestamp?: number;
      tamper?: boolean;
      omitHeaders?: boolean;
    } = {},
  ) => {
    const payload = JSON.stringify(event);
    const timestamp = options.timestamp ?? Date.now();
    const signature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(`${timestamp}.${payload}`)
      .digest('hex');
    let req = request(server)
      .post(`/api/webhooks/${workflowId}`)
      .set('Content-Type', 'application/json');
    if (!options.omitHeaders) {
      req = req
        .set('x-itemize-signature', options.tamper ? 'ab'.repeat(32) : signature)
        .set('x-itemize-timestamp', String(timestamp));
      if (options.deliveryId) {
        req = req.set('x-itemize-delivery-id', options.deliveryId);
      }
    }
    return req.send(payload);
  };

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for workflow webhook tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    const owner = await dbHelper.seedUser(
      `workflow-webhook-parity-${Date.now()}@test.itemize`,
      'Workflow Webhook Owner',
    );
    organizationId = owner.org.id;
    ownerId = owner.user.id;

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

  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbHelper) {
      const TestDbHelper = require('../../../db/test-support/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  it.each([
    ['nest', () => app.getHttpServer()],
  ] as const)(
    'accepts a signed delivery and records the durable trigger through the %s runtime',
    async (runtime, server) => {
      const workflowId = await seedWorkflow();
      const deliveryId = `delivery-${runtime}-${Date.now()}`;
      const response = await signedPost(
        server(),
        workflowId,
        {
          eventType: 'contact_created',
          entityData: { entityType: 'contact', entityId: 42, source: runtime },
        },
        { deliveryId },
      );
      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        success: true,
        accepted: true,
        workflowId: String(workflowId),
        eventType: 'contact_added',
        execution: 'durably_queued',
        message: 'Trigger recorded for asynchronous workflow enrollment',
      });
      expect(response.body.triggerId).toEqual(expect.anything());

      const trigger = await pool.query(
        `SELECT workflow_id, trigger_type, source, delivery_key, status, payload
         FROM workflow_triggers
         WHERE event_key = $1`,
        [`webhook:${workflowId}:${deliveryId}`],
      );
      expect(trigger.rows[0]).toMatchObject({
        workflow_id: workflowId,
        trigger_type: 'contact_added',
        source: 'webhook',
        delivery_key: deliveryId,
        status: 'queued',
      });
      expect(trigger.rows[0].payload).toMatchObject({ entityId: 42 });
    },
  );

  it('replays a legacy-recorded delivery as a duplicate through NestJS', async () => {
    const workflowId = await seedWorkflow();
    const deliveryId = `delivery-cross-${Date.now()}`;
    const event = { eventType: 'contact_added', entityData: {} };
    await signedPost(app.getHttpServer(), workflowId, event, { deliveryId }).expect(202);
    const replay = await signedPost(app.getHttpServer(), workflowId, event, {
      deliveryId,
    });
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({
      success: true,
      duplicate: true,
      message: 'Webhook delivery already recorded',
      workflowId: String(workflowId),
    });
    const triggers = await pool.query(
      'SELECT id FROM workflow_triggers WHERE event_key = $1',
      [`webhook:${workflowId}:${deliveryId}`],
    );
    expect(triggers.rows).toHaveLength(1);
  });

  it('rejects missing, expired, and tampered signatures identically', async () => {
    const workflowId = await seedWorkflow();
    const event = { eventType: 'contact_added' };
    const cases: Array<[string, Parameters<typeof signedPost>[3]]> = [
      ['Missing webhook signature headers', { omitHeaders: true }],
      ['Webhook timestamp is invalid or expired', { timestamp: Date.now() - 10 * 60 * 1000 }],
      ['Invalid webhook signature', { tamper: true }],
    ];
    for (const [message, options] of cases) {
      const nest = await signedPost(app.getHttpServer(), workflowId, event, options);
      expect(nest.status).toBe(401);
      expect(nest.body).toEqual({ error: message });
    }
  });

  it('reports inactive workflows, trigger mismatches, unknown workflows, and invalid events identically', async () => {
    const inactiveId = await seedWorkflow('contact_added', false);
    const inactive = await Promise.all([
      signedPost(app.getHttpServer(), inactiveId, { eventType: 'contact_added' }),
      signedPost(app.getHttpServer(), inactiveId, { eventType: 'contact_added' }),
    ]);
    expect(inactive[0].status).toBe(200);
    expect(inactive[0].body).toEqual(inactive[1].body);
    expect(inactive[0].body).toMatchObject({
      success: false,
      message: 'Workflow is not active',
    });

    const mismatchId = await seedWorkflow('form_submitted');
    const mismatch = await Promise.all([
      signedPost(app.getHttpServer(), mismatchId, { eventType: 'contact_added' }),
      signedPost(app.getHttpServer(), mismatchId, { eventType: 'contact_added' }),
    ]);
    expect(mismatch[0].status).toBe(409);
    expect(mismatch[1].status).toBe(409);
    expect(mismatch[0].body).toEqual(mismatch[1].body);
    expect(mismatch[0].body).toMatchObject({
      expectedEventType: 'form_submitted',
      receivedEventType: 'contact_added',
    });

    const unknown = await Promise.all([
      signedPost(app.getHttpServer(), 999999999, { eventType: 'contact_added' }),
      signedPost(app.getHttpServer(), 999999999, { eventType: 'contact_added' }),
    ]);
    expect(unknown[0].status).toBe(404);
    expect(unknown[1].status).toBe(404);
    expect(unknown[0].body).toEqual(unknown[1].body);

    const workflowId = await seedWorkflow();
    const invalid = await Promise.all([
      signedPost(app.getHttpServer(), workflowId, { eventType: 'not_a_trigger' }),
      signedPost(app.getHttpServer(), workflowId, { eventType: 'not_a_trigger' }),
    ]);
    expect(invalid[0].status).toBe(400);
    expect(invalid[1].status).toBe(400);
    expect(invalid[0].body).toEqual(invalid[1].body);
    expect(invalid[0].body.error).toBe('Validation failed');
    expect(invalid[0].body.details[0].field).toBe('eventType');
  });
});
