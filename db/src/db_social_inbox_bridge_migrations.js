/**
 * Bind provider-specific social records to the canonical Inbox model.
 *
 * Social tables remain the transport ledger for Meta identifiers, delivery
 * state, and webhook evidence. Conversations/messages are the user-facing
 * source of truth.
 */
async function runSocialInboxBridgeMigration(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE social_conversations
      ADD COLUMN IF NOT EXISTS inbox_conversation_id INTEGER
        REFERENCES conversations(id) ON DELETE SET NULL
    `);
    await client.query(`
      ALTER TABLE social_messages
      ADD COLUMN IF NOT EXISTS inbox_message_id INTEGER
        REFERENCES messages(id) ON DELETE SET NULL
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_social_conversations_inbox
      ON social_conversations(inbox_conversation_id)
      WHERE inbox_conversation_id IS NOT NULL
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_social_messages_inbox
      ON social_messages(inbox_message_id)
      WHERE inbox_message_id IS NOT NULL
    `);

    const conversations = await client.query(`
      SELECT conversation.id, conversation.organization_id,
             conversation.contact_id, conversation.assigned_to,
             conversation.status, conversation.participant_name,
             conversation.participant_username,
             conversation.last_message_at, conversation.last_message_text,
             conversation.unread_count, conversation.created_at,
             channel.channel_type
      FROM social_conversations conversation
      JOIN social_channels channel ON channel.id=conversation.channel_id
      WHERE conversation.inbox_conversation_id IS NULL
      ORDER BY conversation.id
      FOR UPDATE OF conversation
    `);

    for (const conversation of conversations.rows) {
      const inserted = await client.query(
        `INSERT INTO conversations (
           organization_id, contact_id, assigned_to, status, channel, subject,
           last_message_at, last_message_preview, unread_count,
           created_at, updated_at
         ) VALUES (
           $1, $2, $3,
           CASE WHEN $4 IN ('closed', 'spam') THEN 'closed' ELSE 'open' END,
           $5, COALESCE(NULLIF($6, ''), NULLIF($7, ''), 'Social contact'),
           $8, $9, $10, $11, CURRENT_TIMESTAMP
         ) RETURNING id`,
        [
          conversation.organization_id,
          conversation.contact_id,
          conversation.assigned_to,
          conversation.status,
          conversation.channel_type,
          conversation.participant_name,
          conversation.participant_username,
          conversation.last_message_at,
          conversation.last_message_text,
          conversation.unread_count,
          conversation.created_at,
        ],
      );
      await client.query(
        `UPDATE social_conversations
         SET inbox_conversation_id=$2
         WHERE id=$1`,
        [conversation.id, inserted.rows[0].id],
      );
    }

    const messages = await client.query(`
      SELECT message.*, conversation.inbox_conversation_id,
             channel.channel_type, channel.name AS channel_name,
             conversation.participant_name,
             conversation.participant_username, conversation.contact_id
      FROM social_messages message
      JOIN social_conversations conversation ON conversation.id=message.conversation_id
      JOIN social_channels channel ON channel.id=message.channel_id
      WHERE message.inbox_message_id IS NULL
        AND conversation.inbox_conversation_id IS NOT NULL
      ORDER BY message.id
      FOR UPDATE OF message
    `);

    for (const message of messages.rows) {
      const content = message.text_content
        || (message.media_type ? `[${message.media_type}]` : `[${message.message_type}]`);
      const metadata = {
        source: 'social',
        provider: message.channel_type,
        provider_account_name: message.channel_name,
        social_conversation_id: message.conversation_id,
        social_message_id: message.id,
        external_message_id: message.external_message_id,
        participant_name: message.participant_name,
        participant_username: message.participant_username,
        message_type: message.message_type,
        media_url: message.media_url,
        media_type: message.media_type,
        media_filename: message.media_filename,
        delivery_status: message.status,
        delivery_error: message.error_message,
      };
      const inserted = await client.query(
        `INSERT INTO messages (
           conversation_id, organization_id, sender_type, sender_user_id,
           sender_contact_id, channel, content, metadata, is_read, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10
         ) RETURNING id`,
        [
          message.inbox_conversation_id,
          message.organization_id,
          message.direction === 'outbound' ? 'user' : 'contact',
          message.direction === 'outbound' ? message.sent_by : null,
          message.direction === 'inbound' ? message.contact_id : null,
          message.channel_type,
          content,
          JSON.stringify(metadata),
          message.direction === 'outbound' || message.read_at !== null,
          message.message_timestamp,
        ],
      );
      await client.query(
        `UPDATE social_messages SET inbox_message_id=$2 WHERE id=$1`,
        [message.id, inserted.rows[0].id],
      );
    }

    await client.query(`
      WITH targets AS (
        SELECT event.id AS event_id,
               conversation.id AS social_conversation_id,
               conversation.inbox_conversation_id
        FROM notification_events event
        JOIN social_conversations conversation
          ON conversation.organization_id=event.organization_id
         AND conversation.id=event.entity_id
        WHERE event.event_type='communication.message_received'
          AND event.entity_type='social_conversation'
          AND conversation.inbox_conversation_id IS NOT NULL
      ), updated_events AS (
        UPDATE notification_events event
        SET entity_type='conversation',
            entity_id=targets.inbox_conversation_id,
            payload=event.payload || jsonb_build_object(
              'conversationId', targets.inbox_conversation_id,
              'socialConversationId', targets.social_conversation_id
            )
        FROM targets
        WHERE event.id=targets.event_id
        RETURNING event.id, targets.inbox_conversation_id
      )
      UPDATE user_notifications notification
      SET href='/inbox?conversation=' || updated.inbox_conversation_id,
          updated_at=CURRENT_TIMESTAMP
      FROM updated_events updated
      WHERE notification.event_id=updated.id
    `);

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Social Inbox bridge migration failed:', error.message);
    return false;
  } finally {
    client.release();
  }
}

module.exports = { runSocialInboxBridgeMigration };
