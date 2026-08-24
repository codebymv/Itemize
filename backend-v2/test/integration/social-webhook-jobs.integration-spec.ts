import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { io as createClient, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { SocialWebhookJobsService } from '../../src/social-webhooks/social-webhook-jobs.service';
import { SocialWebhookJobsSchedulerService } from '../../src/social-webhooks/social-webhook-jobs-scheduler.service';

type EventRow = {
  processing_status: string;
  work_status: string;
  reconciliation_status: string;
  matched_channel_id: number | null;
  social_message_id: number | null;
  reconciliation_attempt_count: number;
  reconciliation_last_error: string | null;
};

function once<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeout = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      timeout,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('Social webhook workers parity (NestJS vs legacy)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let nestJobs: SocialWebhookJobsService;
  let scheduler: SocialWebhookJobsSchedulerService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let legacyJobs: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  let baseUrl: string;
  const clients: ClientSocket[] = [];

  const seedChannel = async (label: string) => {
    const user = await dbHelper.seedUser(
      `social-jobs-${label}-${Date.now()}@test.itemize`,
      `Social Jobs ${label}`,
    );
    const pageId = `page_${label}_${Date.now()}`;
    const channel = (
      await pool.query<{ id: number }>(
        `INSERT INTO social_channels (
           organization_id, channel_type, external_id, name, page_id,
           is_active, is_connected, created_by
         ) VALUES ($1, 'facebook', $2, 'Jobs channel', $3, TRUE, TRUE, $4)
         RETURNING id`,
        [user.org.id, `facebook-${pageId}`, pageId, user.user.id],
      )
    ).rows[0];
    return { user, pageId, channelId: channel.id };
  };

  const seedQueuedEvent = async (
    suffix: string,
    {
      pageId,
      workStatus = 'queued',
      processingStatus = 'pending',
      reconciliationStatus = 'not_required',
      reconciliationAttempts = 0,
      text = 'Hello from the visitor',
    }: {
      pageId: string;
      workStatus?: string;
      processingStatus?: string;
      reconciliationStatus?: string;
      reconciliationAttempts?: number;
      text?: string | null;
    },
  ) => {
    const externalMessageId = `mid_${suffix}_${Date.now()}`;
    const eventKey = `facebook:${externalMessageId}`;
    await pool.query(
      `INSERT INTO social_webhook_events (
         event_key, event_type, external_message_id, channel_type,
         destination_id, sender_id, event_timestamp,
         message_type, text_content, media_url, media_type,
         processing_status, work_status, reconciliation_status,
         reconciliation_attempt_count, reconciliation_next_attempt_at
       ) VALUES ($1, 'messaging', $2, 'facebook', $3, $4,
                 CURRENT_TIMESTAMP - INTERVAL '1 minute',
                 'text', $5, NULL, NULL, $6, $7, $8::varchar, $9,
                 CASE WHEN $8::varchar IN ('pending','retry') THEN CURRENT_TIMESTAMP - INTERVAL '1 second' ELSE NULL END)`,
      [
        eventKey,
        externalMessageId,
        pageId,
        `sender_${suffix}`,
        text,
        processingStatus,
        workStatus,
        reconciliationStatus,
        reconciliationAttempts,
      ],
    );
    return { eventKey, externalMessageId };
  };

  const eventRow = async (eventKey: string): Promise<EventRow> =>
    (
      await pool.query<EventRow>(
        `SELECT processing_status, work_status, reconciliation_status,
                matched_channel_id, social_message_id,
                reconciliation_attempt_count, reconciliation_last_error
         FROM social_webhook_events WHERE event_key = $1`,
        [eventKey],
      )
    ).rows[0];

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for social job tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.REALTIME_HOST_NESTJS_ENABLED = 'true';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
    legacyJobs = require('../../../backend/src/jobs/social-webhook-jobs');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;

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
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
    nestJobs = app.get(SocialWebhookJobsService);
    scheduler = app.get(SocialWebhookJobsSchedulerService);

    // Other suites sharing this scratch database leave claimable rows in
    // both queues; neutralize them so summary counts stay deterministic.
    await pool.query(
      `UPDATE social_webhook_events SET work_status = 'completed'
       WHERE work_status IN ('queued', 'retry')`,
    );
    await pool.query(
      `UPDATE social_webhook_events SET reconciliation_status = 'not_required'
       WHERE reconciliation_status IN ('pending', 'retry')`,
    );
  }, 60000);

  afterAll(async () => {
    for (const socket of clients) socket.disconnect();
    if (app) await app.close();
    if (dbHelper) {
      const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  it('processes routable events identically and delivers the agent notification', async () => {
    const outcomes: Array<{
      event: EventRow;
      message: Record<string, unknown>;
      conversation: Record<string, unknown>;
      hook: Record<string, unknown>;
    }> = [];

    for (const runner of ['legacy', 'nest']) {
      const { user, pageId, channelId } = await seedChannel(`process-${runner}`);
      const seeded = await seedQueuedEvent(`process-${runner}`, { pageId });
      const captured: Record<string, unknown>[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onProcessed = async (result: any) => {
        captured.push({
          organization_id: result.channel.organization_id,
          conversation_id: result.conversationId,
          is_new_conversation: result.isNewConversation,
          content: result.message.text_content,
        });
      };
      const summary =
        runner === 'legacy'
          ? await legacyJobs.runSocialWebhookProcessingJobs(pool, { onProcessed })
          : await nestJobs.runProcessing({ onProcessed });
      expect(summary).toEqual({
        claimed: 1,
        processed: 1,
        unroutable: 0,
        retry: 0,
        deadLetter: 0,
      });
      expect(captured).toHaveLength(1);

      const row = await eventRow(seeded.eventKey);
      expect(row.matched_channel_id).toBe(channelId);
      const message = (
        await pool.query(
          `SELECT message_type, text_content, direction, sender_name, status
           FROM social_messages WHERE id = $1 AND organization_id = $2`,
          [row.social_message_id, user.org.id],
        )
      ).rows[0];
      const conversation = (
        await pool.query(
          `SELECT participant_id, status, unread_count, message_count,
                  last_message_text, last_message_from
           FROM social_conversations WHERE channel_id = $1`,
          [channelId],
        )
      ).rows[0];
      outcomes.push({
        event: row,
        message,
        conversation: {
          ...conversation,
          participant_id: 'normalized',
        },
        hook: { ...captured[0], organization_id: 'normalized', conversation_id: 'normalized' },
      });
    }

    const [legacy, nest] = outcomes;
    expect(nest.event.processing_status).toBe('processed');
    expect(legacy.event.processing_status).toBe('processed');
    expect(nest.event.work_status).toBe(legacy.event.work_status);
    expect(nest.event.reconciliation_status).toBe(legacy.event.reconciliation_status);
    expect(nest.message).toEqual(legacy.message);
    expect(nest.conversation).toEqual(legacy.conversation);
    expect(nest.hook).toEqual(legacy.hook);
  });

  it('delivers social_message into the org-social room through the scheduler hook', async () => {
    const { user, pageId } = await seedChannel('socket');
    const seeded = await seedQueuedEvent('socket', {
      pageId,
      text: 'Live socket assertion',
    });

    const agent = createClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Cookie: `itemize_auth=${user.token}` },
    });
    clients.push(agent);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('connect timeout')), 3000);
      agent.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    const joined = once(agent, 'joinedOrgSocial');
    agent.emit('joinOrgSocial', { organizationId: user.org.id });
    await joined;

    const hook = scheduler.agentNotificationHook();
    expect(hook).not.toBeNull();
    const delivered = once<{
      conversation_id: number;
      message: { text_content: string };
      is_new_conversation: boolean;
    }>(agent, 'social_message');
    const summary = await nestJobs.runProcessing({ onProcessed: hook });
    expect(summary.processed).toBe(1);
    const payload = await delivered;
    expect(payload.message.text_content).toBe('Live socket assertion');
    expect(payload.is_new_conversation).toBe(true);
    expect(payload.conversation_id).toBeGreaterThan(0);
    agent.disconnect();

    const row = await eventRow(seeded.eventKey);
    expect(row.processing_status).toBe('processed');
  });

  it('quarantines unroutable events identically for reconciliation', async () => {
    const outcomes: EventRow[] = [];
    const seededKeys: string[] = [];
    for (const runner of ['legacy', 'nest']) {
      const seeded = await seedQueuedEvent(`unmatched-${runner}`, {
        pageId: `page_missing_${runner}_${Date.now()}`,
      });
      seededKeys.push(seeded.eventKey);
      const summary =
        runner === 'legacy'
          ? await legacyJobs.runSocialWebhookProcessingJobs(pool)
          : await nestJobs.runProcessing();
      expect(summary).toEqual({
        claimed: 1,
        processed: 0,
        unroutable: 1,
        retry: 0,
        deadLetter: 0,
      });
      outcomes.push(await eventRow(seeded.eventKey));
    }
    const [legacy, nest] = outcomes;
    expect(nest.processing_status).toBe('unmatched');
    expect(legacy.processing_status).toBe('unmatched');
    expect(nest.work_status).toBe('completed');
    expect(legacy.work_status).toBe('completed');
    expect(nest.reconciliation_status).toBe('pending');
    expect(legacy.reconciliation_status).toBe('pending');

    // These rows would otherwise be claimed by the reconciliation tests
    // below; neutralize them now that their state is asserted.
    await pool.query(
      `UPDATE social_webhook_events SET reconciliation_status = 'not_required'
       WHERE event_key = ANY($1::varchar[])`,
      [seededKeys],
    );
  });

  it('reconciles quarantined events identically once the channel connects', async () => {
    const outcomes: Array<{ event: EventRow; messageContent: string }> = [];
    for (const runner of ['legacy', 'nest']) {
      const { pageId, channelId } = await seedChannel(`rec-${runner}`);
      const seeded = await seedQueuedEvent(`rec-${runner}`, {
        pageId,
        workStatus: 'completed',
        processingStatus: 'unmatched',
        reconciliationStatus: 'pending',
        text: 'Recovered after connect',
      });
      const summary =
        runner === 'legacy'
          ? await legacyJobs.runSocialWebhookReconciliationJobs(pool)
          : await nestJobs.runReconciliation();
      expect(summary).toEqual({
        claimed: 1,
        processed: 1,
        unroutable: 0,
        retry: 0,
        deadLetter: 0,
      });
      const row = await eventRow(seeded.eventKey);
      expect(row.matched_channel_id).toBe(channelId);
      const message = (
        await pool.query<{ text_content: string }>(
          'SELECT text_content FROM social_messages WHERE id = $1',
          [row.social_message_id],
        )
      ).rows[0];
      outcomes.push({ event: row, messageContent: message.text_content });
    }
    const [legacy, nest] = outcomes;
    expect(nest.event.processing_status).toBe('processed');
    expect(legacy.event.processing_status).toBe('processed');
    expect(nest.event.reconciliation_status).toBe('resolved');
    expect(legacy.event.reconciliation_status).toBe('resolved');
    expect(nest.messageContent).toBe('Recovered after connect');
    expect(legacy.messageContent).toBe('Recovered after connect');
  });

  it('defers unresolved reconciliation identically with the redacted mapping error', async () => {
    const outcomes: EventRow[] = [];
    for (const runner of ['legacy', 'nest']) {
      const seeded = await seedQueuedEvent(`stillgone-${runner}`, {
        pageId: `page_never_${runner}_${Date.now()}`,
        workStatus: 'completed',
        processingStatus: 'unmatched',
        reconciliationStatus: 'pending',
      });
      const summary =
        runner === 'legacy'
          ? await legacyJobs.runSocialWebhookReconciliationJobs(pool)
          : await nestJobs.runReconciliation();
      expect(summary).toEqual({
        claimed: 1,
        processed: 0,
        unroutable: 0,
        retry: 1,
        deadLetter: 0,
      });
      outcomes.push(await eventRow(seeded.eventKey));
    }
    const [legacy, nest] = outcomes;
    expect(nest.reconciliation_status).toBe('retry');
    expect(nest.reconciliation_last_error).toBe(legacy.reconciliation_last_error);
    expect(nest.reconciliation_last_error).toBe(
      'Social channel mapping remains unmatched',
    );
  });

  it('dead-letters exhausted reconciliation identically', async () => {
    const outcomes: EventRow[] = [];
    for (const runner of ['legacy', 'nest']) {
      const seeded = await seedQueuedEvent(`exhaust-${runner}`, {
        pageId: `page_gone_${runner}_${Date.now()}`,
        workStatus: 'completed',
        processingStatus: 'unmatched',
        reconciliationStatus: 'pending',
        reconciliationAttempts: 9,
      });
      const summary =
        runner === 'legacy'
          ? await legacyJobs.runSocialWebhookReconciliationJobs(pool)
          : await nestJobs.runReconciliation();
      expect(summary).toEqual({
        claimed: 1,
        processed: 0,
        unroutable: 0,
        retry: 0,
        deadLetter: 1,
      });
      outcomes.push(await eventRow(seeded.eventKey));
    }
    const [legacy, nest] = outcomes;
    expect(nest.reconciliation_status).toBe('dead_letter');
    expect(legacy.reconciliation_status).toBe('dead_letter');
    expect(nest.reconciliation_attempt_count).toBe(10);
    expect(legacy.reconciliation_attempt_count).toBe(10);
  });
});
