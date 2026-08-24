async function runChatWidgetGraphqlMigration(pool) {
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_widgets_one_per_organization
      ON chat_widgets(organization_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sessions_tenant_identity
      ON chat_sessions(id, organization_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_tenant_identity
      ON chat_messages(id, organization_id);

    CREATE TABLE IF NOT EXISTS chat_agent_message_requests (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      session_id INTEGER NOT NULL,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      chat_message_id INTEGER,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chat_agent_message_request_idempotency
        UNIQUE (organization_id, idempotency_key),
      CONSTRAINT chat_agent_message_request_session_fk
        FOREIGN KEY (session_id, organization_id)
        REFERENCES chat_sessions(id, organization_id) ON DELETE CASCADE,
      CONSTRAINT chat_agent_message_request_message_fk
        FOREIGN KEY (chat_message_id, organization_id)
        REFERENCES chat_messages(id, organization_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_agent_message_requests_session
      ON chat_agent_message_requests(organization_id, session_id, created_at DESC);

    ALTER TABLE realtime_event_outbox
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_aggregate_type_check,
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_channel_check,
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_channel_event_check,
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_channel_aggregate_check,
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_recipient_check;

    ALTER TABLE realtime_event_outbox
      ADD CONSTRAINT realtime_event_outbox_aggregate_type_check
        CHECK (aggregate_type IN ('list', 'note', 'whiteboard', 'wireframe', 'chat_session')),
      ADD CONSTRAINT realtime_event_outbox_channel_check
        CHECK (channel IN (
          'user_canvas', 'shared_list', 'shared_note', 'shared_whiteboard',
          'shared_wireframe', 'user_wireframe', 'shared_revocation', 'chat_session'
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
      ),
      ADD CONSTRAINT realtime_event_outbox_recipient_check CHECK (
        (
          channel IN ('user_canvas', 'user_wireframe')
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

module.exports = { runChatWidgetGraphqlMigration };
