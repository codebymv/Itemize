import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type NotificationRow = {
  id: string;
  event_type: string;
  category: string;
  priority: string;
  title: string;
  body: string;
  href: string | null;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: Date;
  seen_at: Date | null;
  read_at: Date | null;
  created_at: Date;
};

export type CreateNotificationInput = {
  organizationId: number;
  recipientUserId: number;
  actorUserId?: number | null;
  eventType: string;
  entityType?: string | null;
  entityId?: number | null;
  dedupeKey: string;
  payload: Record<string, unknown>;
  category: 'business' | 'billing' | 'collaboration' | 'security' | 'system';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  title: string;
  body: string;
  href?: string | null;
  occurredAt?: Date;
};

@Injectable()
export class NotificationsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(
    client: PoolClient,
    input: CreateNotificationInput,
  ): Promise<NotificationRow | null> {
    const result = await client.query<NotificationRow>(
      `WITH inserted_event AS (
         INSERT INTO notification_events (
           organization_id,actor_user_id,event_type,entity_type,entity_id,
           dedupe_key,payload,occurred_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,COALESCE($8,CURRENT_TIMESTAMP))
         ON CONFLICT (organization_id,dedupe_key) DO NOTHING
         RETURNING id
       ), resolved_event AS (
         SELECT id FROM inserted_event
         UNION ALL
         SELECT id FROM notification_events
         WHERE organization_id=$1 AND dedupe_key=$6
         LIMIT 1
       ), inserted_notification AS (
         INSERT INTO user_notifications (
           event_id,organization_id,recipient_user_id,category,priority,
           title,body,href,created_at
         )
         SELECT id,$1,$9,$10,$11,$12,$13,$14,COALESCE($8,CURRENT_TIMESTAMP)
         FROM resolved_event
         ON CONFLICT (event_id,recipient_user_id) DO NOTHING
         RETURNING *
       )
       SELECT notification.id,event.event_type,notification.category,
              notification.priority,notification.title,notification.body,
              notification.href,event.entity_type,event.entity_id,event.payload,
              event.occurred_at,notification.seen_at,notification.read_at,
              notification.created_at
       FROM inserted_notification notification
       JOIN notification_events event ON event.id=notification.event_id`,
      [
        input.organizationId,
        input.actorUserId ?? null,
        input.eventType,
        input.entityType ?? null,
        input.entityId ?? null,
        input.dedupeKey,
        JSON.stringify(input.payload),
        input.occurredAt ?? null,
        input.recipientUserId,
        input.category,
        input.priority,
        input.title,
        input.body,
        input.href ?? null,
      ],
    );
    return result.rows[0] ?? null;
  }

  async findPage(input: {
    organizationId: number;
    userId: number;
    first: number;
    afterCreatedAt: Date | null;
    afterId: string | null;
    unreadOnly: boolean;
  }): Promise<NotificationRow[]> {
    const result = await this.pool.query<NotificationRow>(
      `SELECT notification.id,event.event_type,notification.category,
              notification.priority,notification.title,notification.body,
              notification.href,event.entity_type,event.entity_id,event.payload,
              event.occurred_at,notification.seen_at,notification.read_at,
              notification.created_at
       FROM user_notifications notification
       JOIN notification_events event ON event.id=notification.event_id
       WHERE notification.organization_id=$1
         AND notification.recipient_user_id=$2
         AND notification.archived_at IS NULL
         AND ($3::boolean=FALSE OR notification.read_at IS NULL)
         AND (
           $4::timestamptz IS NULL
           OR (notification.created_at,notification.id) < ($4::timestamptz,$5::bigint)
         )
       ORDER BY notification.created_at DESC,notification.id DESC
       LIMIT $6`,
      [
        input.organizationId,
        input.userId,
        input.unreadOnly,
        input.afterCreatedAt,
        input.afterId,
        input.first + 1,
      ],
    );
    return result.rows;
  }

  async counts(
    organizationId: number,
    userId: number,
  ): Promise<{ unread: number; unseen: number }> {
    const result = await this.pool.query<{ unread: string; unseen: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE read_at IS NULL)::text AS unread,
         COUNT(*) FILTER (WHERE seen_at IS NULL)::text AS unseen
       FROM user_notifications
       WHERE organization_id=$1 AND recipient_user_id=$2
         AND archived_at IS NULL`,
      [organizationId, userId],
    );
    return {
      unread: Number(result.rows[0]?.unread ?? 0),
      unseen: Number(result.rows[0]?.unseen ?? 0),
    };
  }

  async markSeen(organizationId: number, userId: number): Promise<number> {
    const result = await this.pool.query(
      `UPDATE user_notifications
       SET seen_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
       WHERE organization_id=$1 AND recipient_user_id=$2
         AND archived_at IS NULL AND seen_at IS NULL`,
      [organizationId, userId],
    );
    return result.rowCount ?? 0;
  }

  async markRead(
    organizationId: number,
    userId: number,
    notificationId: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE user_notifications
       SET seen_at=COALESCE(seen_at,CURRENT_TIMESTAMP),
           read_at=COALESCE(read_at,CURRENT_TIMESTAMP),
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$3::bigint AND organization_id=$1 AND recipient_user_id=$2
         AND archived_at IS NULL`,
      [organizationId, userId, notificationId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markAllRead(organizationId: number, userId: number): Promise<number> {
    const result = await this.pool.query(
      `UPDATE user_notifications
       SET seen_at=COALESCE(seen_at,CURRENT_TIMESTAMP),
           read_at=COALESCE(read_at,CURRENT_TIMESTAMP),
           updated_at=CURRENT_TIMESTAMP
       WHERE organization_id=$1 AND recipient_user_id=$2
         AND archived_at IS NULL AND read_at IS NULL`,
      [organizationId, userId],
    );
    return result.rowCount ?? 0;
  }
}
