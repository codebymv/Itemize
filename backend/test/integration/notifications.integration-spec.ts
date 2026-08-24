import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { NotificationsService } from '../../src/notifications/notifications.service';

describe('Notification center GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberToken: string;
  let outsiderToken: string;
  let firstNotificationId: string;
  let outsiderNotificationId: string;
  let notificationsService: NotificationsService;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for notification tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });

    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email,name,provider,email_verified)
       VALUES ($1,'Notification Member','email',TRUE),
              ($2,'Notification Outsider','email',TRUE)
       RETURNING id`,
      [
        `notification-member-${suffix}@test.itemize`,
        `notification-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));

    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name,slug)
       VALUES ('Notification Primary',$1),('Notification Other',$2)
       RETURNING id`,
      [`notification-primary-${suffix}`, `notification-other-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map(
      (row) => Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (organization_id,user_id,role,joined_at)
       VALUES ($1,$3,'owner',NOW()),($2,$4,'owner',NOW())`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    await pool.query(
      `UPDATE users SET default_organization_id=CASE id
         WHEN $3 THEN $1 WHEN $4 THEN $2 ELSE default_organization_id END
       WHERE id=ANY($5::int[])`,
      [
        organizationId,
        outsiderOrganizationId,
        memberId,
        outsiderId,
        [memberId, outsiderId],
      ],
    );

    firstNotificationId = await insertNotification({
      orgId: organizationId,
      userId: memberId,
      dedupeKey: 'estimate:41:accepted',
      eventType: 'estimate.accepted',
      title: 'Estimate accepted',
      body: 'A customer accepted EST-00041 for $125.00.',
      href: '/estimates/41',
      occurredAt: '2026-08-24T12:00:00.000Z',
    });
    await insertNotification({
      orgId: organizationId,
      userId: memberId,
      dedupeKey: 'invoice:40:paid',
      eventType: 'invoice.paid',
      title: 'Invoice paid',
      body: 'A customer paid INV-00040 in full.',
      href: '/invoices/40',
      occurredAt: '2026-08-23T12:00:00.000Z',
    });
    outsiderNotificationId = await insertNotification({
      orgId: outsiderOrganizationId,
      userId: outsiderId,
      dedupeKey: 'estimate:99:declined',
      eventType: 'estimate.declined',
      title: 'Estimate declined',
      body: 'A customer declined EST-00099.',
      href: '/estimates/99',
      occurredAt: '2026-08-24T11:00:00.000Z',
    });

    memberToken = await jwt.signAsync({ id: memberId }, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
    });
    outsiderToken = await jwt.signAsync({ id: outsiderId }, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
    });

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
    notificationsService = app.get(NotificationsService);
  });

  afterAll(async () => {
    if (pool && (organizationId || outsiderOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id=ANY($1::int[])', [
        [organizationId, outsiderOrganizationId].filter(Boolean),
      ]);
    }
    if (pool && (memberId || outsiderId)) {
      await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [
        [memberId, outsiderId].filter(Boolean),
      ]);
    }
    if (app) await app.close();
  });

  async function insertNotification(input: {
    orgId: number;
    userId: number;
    dedupeKey: string;
    eventType: string;
    title: string;
    body: string;
    href: string;
    occurredAt: string;
  }): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `WITH event AS (
         INSERT INTO notification_events (
           organization_id,event_type,dedupe_key,payload,occurred_at
         ) VALUES ($1,$3,$4,'{}'::jsonb,$7::timestamptz)
         RETURNING id
       )
       INSERT INTO user_notifications (
         event_id,organization_id,recipient_user_id,title,body,href,created_at
       )
       SELECT event.id,$1,$2,$5,$6,$8,$7::timestamptz FROM event
       RETURNING id`,
      [
        input.orgId,
        input.userId,
        input.eventType,
        input.dedupeKey,
        input.title,
        input.body,
        input.occurredAt,
        input.href,
      ],
    );
    return String(result.rows[0].id);
  }

  const graphql = (
    token: string,
    orgId: number,
    document: string,
    variables: Record<string, unknown> = {},
    csrf = false,
  ) => {
    const requestBuilder = request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', csrf
        ? `itemize_auth=${token}; csrf-token=notification-csrf`
        : `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));
    if (csrf) requestBuilder.set('x-csrf-token', 'notification-csrf');
    return requestBuilder.send({ query: document, variables });
  };

  const pageQuery = `query Notifications($first: Int!, $after: String, $unreadOnly: Boolean!) {
    notificationsCenter(first: $first,after: $after,unreadOnly: $unreadOnly) {
      nodes { id eventType title body href readAt seenAt createdAt }
      pageInfo { endCursor hasNextPage }
      unreadCount unseenCount
    }
  }`;

  it('pages only the active tenant and recipient with an opaque cursor', async () => {
    const firstPage = await graphql(
      memberToken,
      organizationId,
      pageQuery,
      { first: 1, unreadOnly: false },
    ).expect(200);
    expect(firstPage.body.errors).toBeUndefined();
    expect(firstPage.body.data.notificationsCenter).toMatchObject({
      unreadCount: 2,
      unseenCount: 2,
      pageInfo: { hasNextPage: true },
    });
    expect(firstPage.body.data.notificationsCenter.nodes).toEqual([
      expect.objectContaining({
        id: firstNotificationId,
        eventType: 'estimate.accepted',
        href: '/estimates/41',
      }),
    ]);

    const secondPage = await graphql(
      memberToken,
      organizationId,
      pageQuery,
      {
        first: 1,
        after: firstPage.body.data.notificationsCenter.pageInfo.endCursor,
        unreadOnly: false,
      },
    ).expect(200);
    expect(secondPage.body.errors).toBeUndefined();
    expect(secondPage.body.data.notificationsCenter.nodes[0]).toMatchObject({
      eventType: 'invoice.paid',
    });

    const outsider = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      pageQuery,
      { first: 25, unreadOnly: false },
    ).expect(200);
    expect(outsider.body.data.notificationsCenter.nodes).toEqual([
      expect.objectContaining({ id: outsiderNotificationId }),
    ]);
  });

  it('tracks seen and read separately and supports unread filtering', async () => {
    const seen = await graphql(
      memberToken,
      organizationId,
      'mutation { markNotificationsSeen }',
      {},
      true,
    ).expect(200);
    expect(seen.body).toEqual({ data: { markNotificationsSeen: 2 } });

    const read = await graphql(
      memberToken,
      organizationId,
      'mutation Read($id: ID!) { markNotificationRead(notificationId: $id) }',
      { id: firstNotificationId },
      true,
    ).expect(200);
    expect(read.body).toEqual({ data: { markNotificationRead: true } });

    const unread = await graphql(
      memberToken,
      organizationId,
      pageQuery,
      { first: 25, unreadOnly: true },
    ).expect(200);
    expect(unread.body.errors).toBeUndefined();
    expect(unread.body.data.notificationsCenter).toMatchObject({
      unreadCount: 1,
      unseenCount: 0,
    });
    expect(unread.body.data.notificationsCenter.nodes).toHaveLength(1);
    expect(unread.body.data.notificationsCenter.nodes[0].eventType)
      .toBe('invoice.paid');
  });

  it('does not allow a recipient to mutate another tenant notification', async () => {
    const forbidden = await graphql(
      memberToken,
      organizationId,
      'mutation Read($id: ID!) { markNotificationRead(notificationId: $id) }',
      { id: outsiderNotificationId },
      true,
    ).expect(200);
    expect(forbidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('returns a newly inserted notification and enqueues its realtime event', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const notification = await notificationsService.createWithClient(client, {
        organizationId,
        recipientUserId: memberId,
        eventType: 'estimate.accepted',
        entityType: 'estimate',
        entityId: 142,
        dedupeKey: `estimate:142:accepted:${Date.now()}`,
        payload: { estimateNumber: 'EST-00142' },
        category: 'business',
        priority: 'normal',
        title: 'Estimate accepted',
        body: 'A customer accepted EST-00142.',
        href: '/estimates/142',
      });
      expect(notification).toEqual(expect.objectContaining({
        id: expect.stringMatching(/^[1-9]\d*$/),
        eventType: 'estimate.accepted',
        href: '/estimates/142',
      }));
      const outbox = await client.query(
        `SELECT event_name,payload
         FROM realtime_event_outbox
         WHERE event_key=$1`,
        [`notification-created:${notification?.id}`],
      );
      expect(outbox.rows).toEqual([
        expect.objectContaining({ event_name: 'notificationCreated' }),
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
