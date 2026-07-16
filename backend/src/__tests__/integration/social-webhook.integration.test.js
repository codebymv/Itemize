const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const TestDbHelper = require('./test-db-helper');
const createSocialWebhookRoutes = require('../../routes/social/webhook.routes');
const {
  runSocialWebhookProcessingJobs,
  runSocialWebhookReconciliationJobs,
} = require('../../jobs/social-webhook-jobs');

const appSecret = 'meta-social-integration-secret';
const verifyToken = 'meta-social-verify-token';

function createIoRecorder() {
  const emissions = [];
  return {
    emissions,
    to: jest.fn(room => ({
      emit: (event, payload) => emissions.push({ event, payload, room }),
    })),
  };
}

function createApp(pool, io, options = {}) {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); },
  }));
  app.use('/api/social', createSocialWebhookRoutes(pool, io, null, options));
  return app;
}

function signedPost(app, body, { valid = true } = {}) {
  const payload = JSON.stringify(body);
  const signature = crypto.createHmac('sha256', appSecret).update(payload).digest('hex');
  return request(app)
    .post('/api/social/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', valid ? `sha256=${signature}` : `sha256=${'0'.repeat(64)}`)
    .send(payload);
}

function messageBody(object, destinationId, messageId, senderId = 'sender-1') {
  return {
    object,
    entry: [{
      id: destinationId,
      messaging: [{
        sender: { id: senderId },
        recipient: { id: destinationId },
        timestamp: 1784120000000,
        message: { mid: messageId, text: `Message ${messageId}` },
      }],
    }],
  };
}

function messageBatchBody(object, destinationId, messageIds) {
  return {
    object,
    entry: [{
      id: destinationId,
      messaging: messageIds.map((messageId, index) => ({
        sender: { id: `batch-sender-${index}` },
        recipient: { id: destinationId },
        timestamp: 1784120000000 + index,
        message: { mid: messageId, text: `Message ${messageId}` },
      })),
    }],
  };
}

describe('Meta social webhook PostgreSQL contract', () => {
  let dbHelper;
  let userA;
  let userB;
  let app;
  let io;
  const originalSecret = process.env.FACEBOOK_APP_SECRET;
  const originalVerifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;

  beforeAll(async () => {
    process.env.FACEBOOK_APP_SECRET = appSecret;
    process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = verifyToken;
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    userA = await dbHelper.seedUser(`meta-a-${Date.now()}@test.itemize`, 'Meta A');
    userB = await dbHelper.seedUser(`meta-b-${Date.now()}@test.itemize`, 'Meta B');
    io = createIoRecorder();
    app = createApp(dbHelper.pool, io);
  }, 30000);

  afterAll(async () => {
    if (originalSecret === undefined) delete process.env.FACEBOOK_APP_SECRET;
    else process.env.FACEBOOK_APP_SECRET = originalSecret;
    if (originalVerifyToken === undefined) delete process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
    else process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = originalVerifyToken;
    await dbHelper.teardown();
  }, 30000);

  async function createChannel(user, {
    channelType = 'facebook', destinationId, pageId = destinationId,
  }) {
    return (await dbHelper.pool.query(`
      INSERT INTO social_channels (
        organization_id, channel_type, external_id, name, page_id,
        instagram_business_account_id, is_active, is_connected, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, $7)
      RETURNING id
    `, [
      user.org.id,
      channelType,
      `${channelType}-${destinationId}`,
      `${channelType} channel`,
      pageId,
      channelType === 'instagram' ? destinationId : null,
      user.user.id,
    ])).rows[0];
  }

  test('answers the challenge and fails closed without its configured token', async () => {
    const valid = await request(app).get('/api/social/webhook').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': verifyToken,
      'hub.challenge': 'challenge-value',
    });
    expect(valid.status).toBe(200);
    expect(valid.text).toBe('challenge-value');

    process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = '';
    const unavailable = await request(app).get('/api/social/webhook').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': verifyToken,
      'hub.challenge': 'challenge-value',
    });
    process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = verifyToken;
    expect(unavailable.status).toBe(503);
  });

  test('rejects an invalid signature before opening a delivery claim', async () => {
    const messageId = `invalid-${Date.now()}`;
    const response = await signedPost(app, messageBody('page', 'invalid-page', messageId), { valid: false });
    expect(response.status).toBe(401);
    const claims = await dbHelper.pool.query(
      'SELECT 1 FROM social_webhook_events WHERE external_message_id = $1', [messageId]
    );
    expect(claims.rows).toHaveLength(0);
  });

  test('persists and emits one Facebook message under duplicate delivery', async () => {
    const destinationId = `facebook-page-${Date.now()}`;
    const messageId = `facebook-message-${Date.now()}`;
    await createChannel(userA, { destinationId });
    const body = messageBody('page', destinationId, messageId);

    const [first, duplicate] = await Promise.all([
      signedPost(app, body),
      signedPost(app, body),
    ]);
    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);

    const [claims, messages, conversations] = await Promise.all([
      dbHelper.pool.query('SELECT processing_status FROM social_webhook_events WHERE external_message_id = $1', [messageId]),
      dbHelper.pool.query('SELECT organization_id FROM social_messages WHERE external_message_id = $1', [messageId]),
      dbHelper.pool.query(`
        SELECT unread_count, message_count FROM social_conversations
        WHERE participant_id = 'sender-1' AND organization_id = $1
      `, [userA.org.id]),
    ]);
    expect(claims.rows).toEqual([{ processing_status: 'processed' }]);
    expect(messages.rows).toEqual([{ organization_id: userA.org.id }]);
    expect(conversations.rows[0]).toMatchObject({ unread_count: 1, message_count: 1 });
    expect(io.emissions.filter(item => item.payload.message.external_message_id === messageId)).toHaveLength(1);
  });

  test('quarantines a page connected to more than one organization', async () => {
    const destinationId = `ambiguous-page-${Date.now()}`;
    const messageId = `ambiguous-message-${Date.now()}`;
    await createChannel(userA, { destinationId });
    await createChannel(userB, { destinationId });

    expect((await signedPost(app, messageBody('page', destinationId, messageId))).status).toBe(200);
    const [claim, messages] = await Promise.all([
      dbHelper.pool.query('SELECT processing_status, matched_channel_id FROM social_webhook_events WHERE external_message_id = $1', [messageId]),
      dbHelper.pool.query('SELECT id FROM social_messages WHERE external_message_id = $1', [messageId]),
    ]);
    expect(claim.rows[0]).toMatchObject({ processing_status: 'ambiguous', matched_channel_id: null });
    expect(messages.rows).toHaveLength(0);
  });

  test('maps an Instagram event only by its business account identity', async () => {
    const destinationId = `instagram-account-${Date.now()}`;
    const messageId = `instagram-message-${Date.now()}`;
    await createChannel(userA, { destinationId, pageId: destinationId });
    await createChannel(userB, {
      channelType: 'instagram', destinationId, pageId: `parent-page-${Date.now()}`,
    });

    expect((await signedPost(app, messageBody('instagram', destinationId, messageId, 'ig-sender'))).status).toBe(200);
    const messages = await dbHelper.pool.query(
      'SELECT organization_id, external_message_id FROM social_messages WHERE external_message_id = $1',
      [messageId]
    );
    expect(messages.rows).toEqual([{
      organization_id: userB.org.id,
      external_message_id: messageId,
    }]);
  });

  test('durably claims a large batch and drains overflow outside the callback', async () => {
    const destinationId = `bounded-page-${Date.now()}`;
    const messageIds = Array.from(
      { length: 5 },
      (_, index) => `bounded-message-${Date.now()}-${index}`
    );
    await createChannel(userA, { destinationId });
    const boundedApp = createApp(dbHelper.pool, io, { inlineLimit: 1 });

    expect((await signedPost(
      boundedApp,
      messageBatchBody('page', destinationId, messageIds)
    )).status).toBe(200);

    const initial = await dbHelper.pool.query(`
      SELECT work_status, COUNT(*)::integer AS count
      FROM social_webhook_events
      WHERE external_message_id = ANY($1::text[])
      GROUP BY work_status
    `, [messageIds]);
    expect(initial.rows).toEqual(expect.arrayContaining([
      { work_status: 'completed', count: 1 },
      { work_status: 'queued', count: 4 },
    ]));

    const emitted = [];
    const summary = await runSocialWebhookProcessingJobs(dbHelper.pool, {
      batchSize: 10,
      onProcessed: result => emitted.push(result.message.external_message_id),
    });
    expect(summary).toMatchObject({ claimed: 4, processed: 4 });
    expect(emitted).toHaveLength(4);

    const final = await dbHelper.pool.query(`
      SELECT processing_status, work_status
      FROM social_webhook_events
      WHERE external_message_id = ANY($1::text[])
    `, [messageIds]);
    expect(final.rows).toHaveLength(5);
    expect(final.rows.every(row => (
      row.processing_status === 'processed' && row.work_status === 'completed'
    ))).toBe(true);
  });

  test('replays an unmatched message once after its channel mapping appears', async () => {
    const destinationId = `late-page-${Date.now()}`;
    const messageId = `late-message-${Date.now()}`;
    expect((await signedPost(app, messageBody('page', destinationId, messageId))).status).toBe(200);

    const quarantined = await dbHelper.pool.query(`
      SELECT processing_status, reconciliation_status
      FROM social_webhook_events WHERE external_message_id = $1
    `, [messageId]);
    expect(quarantined.rows[0]).toMatchObject({
      processing_status: 'unmatched',
      reconciliation_status: 'pending',
    });

    await createChannel(userA, { destinationId });
    const options = { batchSize: 100, baseDelayMs: 300_000 };
    await Promise.all([
      runSocialWebhookReconciliationJobs(dbHelper.pool, options),
      runSocialWebhookReconciliationJobs(dbHelper.pool, options),
    ]);

    const [claim, messages] = await Promise.all([
      dbHelper.pool.query(`
        SELECT processing_status, reconciliation_status, reconciliation_attempt_count
        FROM social_webhook_events WHERE external_message_id = $1
      `, [messageId]),
      dbHelper.pool.query(`
        SELECT organization_id FROM social_messages WHERE external_message_id = $1
      `, [messageId]),
    ]);
    expect(claim.rows[0]).toMatchObject({
      processing_status: 'processed',
      reconciliation_status: 'resolved',
      reconciliation_attempt_count: 1,
    });
    expect(messages.rows).toEqual([{ organization_id: userA.org.id }]);
  });

  test('replays an ambiguous message into the sole remaining organization', async () => {
    const destinationId = `repaired-page-${Date.now()}`;
    const messageId = `repaired-message-${Date.now()}`;
    const channelA = await createChannel(userA, { destinationId });
    const channelB = await createChannel(userB, { destinationId });
    expect((await signedPost(app, messageBody('page', destinationId, messageId))).status).toBe(200);

    await dbHelper.pool.query(
      'UPDATE social_channels SET is_active = FALSE WHERE id = $1',
      [channelB.id]
    );
    await runSocialWebhookReconciliationJobs(dbHelper.pool, { batchSize: 100 });

    const [claim, messages] = await Promise.all([
      dbHelper.pool.query(`
        SELECT processing_status, reconciliation_status, matched_channel_id
        FROM social_webhook_events WHERE external_message_id = $1
      `, [messageId]),
      dbHelper.pool.query(`
        SELECT organization_id FROM social_messages WHERE external_message_id = $1
      `, [messageId]),
    ]);
    expect(claim.rows[0]).toMatchObject({
      processing_status: 'processed',
      reconciliation_status: 'resolved',
      matched_channel_id: channelA.id,
    });
    expect(messages.rows).toEqual([{ organization_id: userA.org.id }]);
  });
});
