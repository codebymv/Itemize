async function runRealtimeOutboxMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS realtime_event_outbox (
      id BIGSERIAL PRIMARY KEY,
      event_key VARCHAR(255) NOT NULL UNIQUE,
      aggregate_type VARCHAR(32) NOT NULL
        CHECK (aggregate_type IN ('list', 'note', 'whiteboard')),
      aggregate_id INTEGER NOT NULL
        CHECK (aggregate_id > 0),
      channel VARCHAR(32) NOT NULL
        CHECK (channel IN ('user_canvas', 'shared_list', 'shared_note', 'shared_whiteboard')),
      recipient_key VARCHAR(255) NOT NULL,
      event_name VARCHAR(64) NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL
        CHECK (jsonb_typeof(payload) = 'object'),
      status VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'retry', 'sent', 'dead_letter', 'expired')),
      attempt_count INTEGER NOT NULL DEFAULT 0
        CHECK (attempt_count >= 0),
      next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      claimed_by VARCHAR(255),
      last_error TEXT,
      occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      delivered_at TIMESTAMP WITH TIME ZONE,
      expired_at TIMESTAMP WITH TIME ZONE,
      CONSTRAINT realtime_event_outbox_channel_event_check CHECK (
        (channel = 'user_canvas' AND event_name IN ('userListUpdated', 'userListDeleted'))
        OR (channel = 'shared_list' AND event_name = 'listUpdated')
        OR (channel = 'shared_note' AND event_name = 'noteUpdated')
        OR (channel = 'shared_whiteboard' AND event_name = 'whiteboardUpdated')
      ),
      CONSTRAINT realtime_event_outbox_channel_aggregate_check CHECK (
        (channel IN ('user_canvas', 'shared_list') AND aggregate_type = 'list')
        OR (channel = 'shared_note' AND aggregate_type = 'note')
        OR (channel = 'shared_whiteboard' AND aggregate_type = 'whiteboard')
      ),
      CONSTRAINT realtime_event_outbox_recipient_check CHECK (
        (channel = 'user_canvas' AND recipient_key ~ '^[1-9][0-9]*$')
        OR (
          channel IN ('shared_list', 'shared_note', 'shared_whiteboard')
          AND recipient_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      ),
      CONSTRAINT realtime_event_outbox_payload_size_check
        CHECK (pg_column_size(payload) <= 65536)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_realtime_event_outbox_queue
      ON realtime_event_outbox(
        COALESCE(next_attempt_at, created_at),
        COALESCE(lease_expires_at, created_at),
        id
      )
      WHERE status IN ('queued', 'processing', 'retry')
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_realtime_event_outbox_delivered
      ON realtime_event_outbox(delivered_at, id)
      WHERE status = 'sent'
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_realtime_event_outbox_aggregate
      ON realtime_event_outbox(aggregate_type, aggregate_id, occurred_at, id)
  `);

  return true;
}

async function runRealtimeOutboxExpirationMigration(pool) {
  await pool.query(`
    ALTER TABLE realtime_event_outbox
      ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP WITH TIME ZONE;

    ALTER TABLE realtime_event_outbox
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_status_check;

    ALTER TABLE realtime_event_outbox
      ADD CONSTRAINT realtime_event_outbox_status_check
        CHECK (status IN (
          'queued', 'processing', 'retry', 'sent', 'dead_letter', 'expired'
        ));

    CREATE INDEX IF NOT EXISTS idx_realtime_event_outbox_expirable
      ON realtime_event_outbox(occurred_at, id)
      WHERE status IN ('queued', 'retry');
  `);
  return true;
}

async function applyCurrentRealtimeOutboxConstraints(pool) {
  await pool.query(`
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
        OR (channel = 'user_notification' AND aggregate_type = 'notification')
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
        OR (channel = 'chat_session' AND recipient_key ~ '^cs_[0-9a-f]{48}$')
      )
  `);
  return true;
}

async function runWhiteboardRealtimeOutboxMigration(pool) {
  // Historical databases can already contain later wireframe, chat, or
  // notification events while lacking this marker. Reconciliation must never
  // narrow the live constraint back to the schema that existed at this step.
  return applyCurrentRealtimeOutboxConstraints(pool);
}

async function runWireframeRealtimeOutboxMigration(pool) {
  return applyCurrentRealtimeOutboxConstraints(pool);
}

async function runSharedRevocationRealtimeOutboxMigration(pool) {
  return applyCurrentRealtimeOutboxConstraints(pool);
}

module.exports = {
  runRealtimeOutboxMigration,
  runWhiteboardRealtimeOutboxMigration,
  runWireframeRealtimeOutboxMigration,
  runSharedRevocationRealtimeOutboxMigration,
  runRealtimeOutboxExpirationMigration,
};
