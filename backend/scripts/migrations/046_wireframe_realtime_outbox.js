const {
  runWireframeRealtimeOutboxMigration,
} = require('../../src/db_realtime_outbox_migrations');

exports.up = runWireframeRealtimeOutboxMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DELETE FROM realtime_event_outbox
    WHERE aggregate_type = 'wireframe'
       OR channel IN ('shared_wireframe', 'user_wireframe');

    ALTER TABLE realtime_event_outbox
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_aggregate_type_check,
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_channel_check,
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_channel_event_check,
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_channel_aggregate_check,
      DROP CONSTRAINT IF EXISTS realtime_event_outbox_recipient_check;

    ALTER TABLE realtime_event_outbox
      ADD CONSTRAINT realtime_event_outbox_aggregate_type_check
        CHECK (aggregate_type IN ('list', 'note', 'whiteboard')),
      ADD CONSTRAINT realtime_event_outbox_channel_check
        CHECK (channel IN ('user_canvas', 'shared_list', 'shared_note', 'shared_whiteboard')),
      ADD CONSTRAINT realtime_event_outbox_channel_event_check CHECK (
        (channel = 'user_canvas' AND event_name IN ('userListUpdated', 'userListDeleted'))
        OR (channel = 'shared_list' AND event_name = 'listUpdated')
        OR (channel = 'shared_note' AND event_name = 'noteUpdated')
        OR (channel = 'shared_whiteboard' AND event_name = 'whiteboardUpdated')
      ),
      ADD CONSTRAINT realtime_event_outbox_channel_aggregate_check CHECK (
        (channel IN ('user_canvas', 'shared_list') AND aggregate_type = 'list')
        OR (channel = 'shared_note' AND aggregate_type = 'note')
        OR (channel = 'shared_whiteboard' AND aggregate_type = 'whiteboard')
      ),
      ADD CONSTRAINT realtime_event_outbox_recipient_check CHECK (
        (channel = 'user_canvas' AND recipient_key ~ '^[1-9][0-9]*$')
        OR (
          channel IN ('shared_list', 'shared_note', 'shared_whiteboard')
          AND recipient_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
  `);
};
