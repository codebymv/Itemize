async function runChatWidgetPublicIdempotencyMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_public_session_requests (
      id BIGSERIAL PRIMARY KEY,
      widget_id INTEGER NOT NULL REFERENCES chat_widgets(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      chat_session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      http_status SMALLINT NOT NULL CHECK (http_status IN (200, 201)),
      resumed BOOLEAN NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (widget_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_public_session_requests_session
      ON chat_public_session_requests(chat_session_id);

    CREATE TABLE IF NOT EXISTS chat_visitor_message_requests (
      id BIGSERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      chat_message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (session_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_visitor_message_requests_message
      ON chat_visitor_message_requests(chat_message_id);
  `);
  return true;
}

module.exports = { runChatWidgetPublicIdempotencyMigration };
