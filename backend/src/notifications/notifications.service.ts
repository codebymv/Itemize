import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { itemizeGraphqlError } from '../common/graphql-error';
import { RealtimeOutboxService } from '../realtime-outbox/realtime-outbox.service';
import {
  CreateNotificationInput,
  NotificationRow,
  NotificationsRepository,
} from './notifications.repository';
import { NotificationPage, UserNotification } from './notification.types';

type NotificationCursor = { createdAt: string; id: string };
type CreateOrganizationNotificationInput = Omit<
  CreateNotificationInput,
  'recipientUserId'
> & { preferredUserId?: number | null };

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly realtime: RealtimeOutboxService,
  ) {}

  async createWithClient(
    client: PoolClient,
    input: CreateNotificationInput,
  ): Promise<UserNotification | null> {
    const row = await this.notifications.create(client, input);
    if (!row) return null;
    const notification = this.map(row);
    await this.realtime.enqueue(client, {
      eventKey: `notification-created:${notification.id}`,
      aggregateType: 'notification',
      aggregateId: Number(notification.id),
      channel: 'user_notification',
      recipientKey: String(input.recipientUserId),
      eventName: 'notificationCreated',
      eventType: input.eventType,
      payload: { organizationId: input.organizationId, notification },
      occurredAt: input.occurredAt,
    });
    return notification;
  }

  async createForOrganizationOwnerWithClient(
    client: PoolClient,
    input: CreateOrganizationNotificationInput,
  ): Promise<UserNotification | null> {
    const recipient = await client.query<{ user_id: number }>(
      `SELECT member.user_id
       FROM organization_members member
       WHERE member.organization_id=$1
         AND (member.user_id=$2 OR member.role='owner')
       ORDER BY CASE WHEN member.user_id=$2 THEN 0 ELSE 1 END,
                member.joined_at,member.user_id
       LIMIT 1`,
      [input.organizationId, input.preferredUserId ?? null],
    );
    const recipientUserId = recipient.rows[0]?.user_id;
    if (!recipientUserId) return null;
    const { preferredUserId: _preferredUserId, ...notification } = input;
    return this.createWithClient(client, {
      ...notification,
      recipientUserId: Number(recipientUserId),
    });
  }

  async list(input: {
    organizationId: number;
    userId: number;
    first?: number;
    after?: string;
    unreadOnly?: boolean;
  }): Promise<NotificationPage> {
    const first = input.first ?? 25;
    if (!Number.isInteger(first) || first < 1 || first > 50) {
      throw itemizeGraphqlError(
        'first must be between 1 and 50',
        'BAD_USER_INPUT',
        { field: 'first' },
      );
    }
    const cursor = this.decodeCursor(input.after);
    const rows = await this.notifications.findPage({
      organizationId: input.organizationId,
      userId: input.userId,
      first,
      afterCreatedAt: cursor ? new Date(cursor.createdAt) : null,
      afterId: cursor?.id ?? null,
      unreadOnly: Boolean(input.unreadOnly),
    });
    const hasNextPage = rows.length > first;
    const nodes = rows.slice(0, first).map((row) => this.map(row));
    const counts = await this.notifications.counts(
      input.organizationId,
      input.userId,
    );
    return {
      nodes,
      pageInfo: {
        hasNextPage,
        endCursor: nodes.length > 0
          ? this.encodeCursor(nodes[nodes.length - 1])
          : null,
      },
      unreadCount: counts.unread,
      unseenCount: counts.unseen,
    };
  }

  markSeen(organizationId: number, userId: number): Promise<number> {
    return this.notifications.markSeen(organizationId, userId);
  }

  async markRead(
    organizationId: number,
    userId: number,
    notificationId: string,
  ): Promise<boolean> {
    this.validateId(notificationId);
    const updated = await this.notifications.markRead(
      organizationId,
      userId,
      notificationId,
    );
    if (!updated) {
      throw itemizeGraphqlError('Notification not found', 'NOT_FOUND');
    }
    return true;
  }

  markAllRead(organizationId: number, userId: number): Promise<number> {
    return this.notifications.markAllRead(organizationId, userId);
  }

  private map(row: NotificationRow): UserNotification {
    return {
      id: String(row.id),
      eventType: row.event_type,
      category: row.category,
      priority: row.priority,
      title: row.title,
      body: row.body,
      href: row.href,
      entityType: row.entity_type,
      entityId: row.entity_id === null ? null : String(row.entity_id),
      payload: row.payload ?? {},
      occurredAt: new Date(row.occurred_at),
      seenAt: row.seen_at ? new Date(row.seen_at) : null,
      readAt: row.read_at ? new Date(row.read_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  private encodeCursor(notification: UserNotification): string {
    return Buffer.from(JSON.stringify({
      createdAt: notification.createdAt.toISOString(),
      id: notification.id,
    } satisfies NotificationCursor)).toString('base64url');
  }

  private decodeCursor(value: string | undefined): NotificationCursor | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as Partial<NotificationCursor>;
      if (
        typeof parsed.createdAt !== 'string'
        || Number.isNaN(Date.parse(parsed.createdAt))
        || typeof parsed.id !== 'string'
        || !/^[1-9]\d*$/.test(parsed.id)
      ) {
        throw new Error('invalid');
      }
      return { createdAt: parsed.createdAt, id: parsed.id };
    } catch {
      throw itemizeGraphqlError('after is invalid', 'BAD_USER_INPUT', {
        field: 'after',
      });
    }
  }

  private validateId(value: string): void {
    if (!/^[1-9]\d*$/.test(value)) {
      throw itemizeGraphqlError('notificationId is invalid', 'BAD_USER_INPUT', {
        field: 'notificationId',
      });
    }
  }
}
