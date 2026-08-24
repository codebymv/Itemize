async function runNotificationCenterMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_events (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      event_type VARCHAR(100) NOT NULL,
      entity_type VARCHAR(64),
      entity_id BIGINT,
      dedupe_key VARCHAR(255) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT notification_events_dedupe
        UNIQUE (organization_id, dedupe_key),
      CONSTRAINT notification_events_entity_check CHECK (
        (entity_type IS NULL AND entity_id IS NULL)
        OR (entity_type IS NOT NULL AND entity_id IS NOT NULL AND entity_id > 0)
      ),
      CONSTRAINT notification_events_payload_object
        CHECK (jsonb_typeof(payload) = 'object'),
      CONSTRAINT notification_events_payload_size
        CHECK (pg_column_size(payload) <= 65536)
    );

    CREATE TABLE IF NOT EXISTS user_notifications (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL
        REFERENCES notification_events(id) ON DELETE CASCADE,
      organization_id INTEGER NOT NULL,
      recipient_user_id INTEGER NOT NULL,
      category VARCHAR(32) NOT NULL DEFAULT 'business'
        CHECK (category IN (
          'business', 'billing', 'collaboration', 'security', 'system'
        )),
      priority VARCHAR(16) NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      href TEXT,
      seen_at TIMESTAMP WITH TIME ZONE,
      read_at TIMESTAMP WITH TIME ZONE,
      archived_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT user_notifications_event_recipient
        UNIQUE (event_id, recipient_user_id),
      CONSTRAINT user_notifications_membership
        FOREIGN KEY (organization_id, recipient_user_id)
        REFERENCES organization_members(organization_id, user_id)
        ON DELETE CASCADE,
      CONSTRAINT user_notifications_href_relative CHECK (
        href IS NULL OR href ~ '^/[A-Za-z0-9/_?&=.%+-]*$'
      )
    );

    CREATE INDEX IF NOT EXISTS idx_user_notifications_feed
      ON user_notifications(
        organization_id, recipient_user_id, created_at DESC, id DESC
      )
      WHERE archived_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_user_notifications_unseen
      ON user_notifications(organization_id, recipient_user_id, created_at DESC)
      WHERE archived_at IS NULL AND seen_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
      ON user_notifications(organization_id, recipient_user_id, created_at DESC)
      WHERE archived_at IS NULL AND read_at IS NULL;

    ALTER TABLE realtime_event_outbox
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_aggregate_type_check,
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_channel_check,
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_channel_event_check,
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_channel_aggregate_check,
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_recipient_check;

    ALTER TABLE realtime_event_outbox
      ADD CONSTRAINT realtime_event_outbox_aggregate_type_check
        CHECK (aggregate_type IN (
          'list', 'note', 'whiteboard', 'wireframe', 'chat_session',
          'notification'
        )),
      ADD CONSTRAINT realtime_event_outbox_channel_check
        CHECK (channel IN (
          'user_canvas', 'shared_list', 'shared_note', 'shared_whiteboard',
          'shared_wireframe', 'user_wireframe', 'shared_revocation',
          'chat_session', 'user_notification'
        )),
      ADD CONSTRAINT realtime_event_outbox_channel_event_check CHECK (
        (channel = 'user_canvas' AND event_name IN ('userListUpdated', 'userListDeleted'))
        OR (channel = 'shared_list' AND event_name = 'listUpdated')
        OR (channel = 'shared_note' AND event_name = 'noteUpdated')
        OR (channel = 'shared_whiteboard' AND event_name = 'whiteboardUpdated')
        OR (channel = 'shared_wireframe' AND event_name = 'wireframeUpdated')
        OR (channel = 'user_wireframe' AND event_name = 'userWireframeUpdated')
        OR (channel = 'shared_revocation' AND event_name = 'sharedContentRevoked')
        OR (channel = 'chat_session' AND event_name = 'newChatMessage')
        OR (channel = 'user_notification' AND event_name = 'notificationCreated')
      ),
      ADD CONSTRAINT realtime_event_outbox_channel_aggregate_check CHECK (
        (channel IN ('user_canvas', 'shared_list') AND aggregate_type = 'list')
        OR (channel = 'shared_note' AND aggregate_type = 'note')
        OR (channel = 'shared_whiteboard' AND aggregate_type = 'whiteboard')
        OR (
          channel IN ('shared_wireframe', 'user_wireframe')
          AND aggregate_type = 'wireframe'
        )
        OR (
          channel = 'shared_revocation'
          AND aggregate_type IN ('list', 'note', 'whiteboard', 'wireframe')
        )
        OR (channel = 'chat_session' AND aggregate_type = 'chat_session')
        OR (
          channel = 'user_notification' AND aggregate_type = 'notification'
        )
      ),
      ADD CONSTRAINT realtime_event_outbox_recipient_check CHECK (
        (
          channel IN ('user_canvas', 'user_wireframe', 'user_notification')
          AND recipient_key ~ '^[1-9][0-9]*$'
        )
        OR (
          channel IN (
            'shared_list', 'shared_note', 'shared_whiteboard',
            'shared_wireframe', 'shared_revocation'
          )
          AND recipient_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
        OR (
          channel = 'chat_session'
          AND recipient_key ~ '^cs_[0-9a-f]{48}$'
        )
      );
  `);

  return true;
}

module.exports = { runNotificationCenterMigration };
