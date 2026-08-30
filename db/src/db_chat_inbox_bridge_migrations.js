/** Keep live-chat transport records bound to the canonical Inbox model. */
async function runChatInboxBridgeMigration(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS inbox_message_id INTEGER
        REFERENCES messages(id) ON DELETE SET NULL
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sessions_inbox_conversation
      ON chat_sessions(conversation_id)
      WHERE conversation_id IS NOT NULL
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_inbox_message
      ON chat_messages(inbox_message_id)
      WHERE inbox_message_id IS NOT NULL
    `);

    const sessions = await client.query(`
      SELECT session.id, session.organization_id, session.contact_id,
             session.conversation_id, session.visitor_name,
             session.visitor_email, session.visitor_phone, session.status,
             session.created_at, widget.default_assigned_to
      FROM chat_sessions session
      JOIN chat_widgets widget
        ON widget.id=session.widget_id
       AND widget.organization_id=session.organization_id
      WHERE EXISTS (
        SELECT 1 FROM chat_messages message
        WHERE message.organization_id=session.organization_id
          AND message.session_id=session.id
      )
      ORDER BY session.id
      FOR UPDATE OF session
    `);

    for (const session of sessions.rows) {
      let conversationId = session.conversation_id;
      const subject = session.visitor_name
        || session.visitor_email
        || session.visitor_phone
        || 'Website visitor';
      if (conversationId) {
        const owned = await client.query(
          `SELECT 1 FROM conversations WHERE organization_id=$1 AND id=$2`,
          [session.organization_id, conversationId],
        );
        if (!owned.rows[0]) conversationId = null;
      }
      if (!conversationId) {
        const inserted = await client.query(
          `INSERT INTO conversations (
             organization_id, contact_id, assigned_to, status, channel,
             subject, created_at, updated_at
           ) VALUES (
             $1,$2,$3,CASE WHEN $4='active' THEN 'open' ELSE 'closed' END,
             'chat',$5,$6,CURRENT_TIMESTAMP
           ) RETURNING id`,
          [
            session.organization_id,
            session.contact_id,
            session.default_assigned_to,
            session.status,
            subject,
            session.created_at,
          ],
        );
        conversationId = inserted.rows[0].id;
        await client.query(
          `UPDATE chat_sessions SET conversation_id=$2 WHERE id=$1`,
          [session.id, conversationId],
        );
      } else {
        await client.query(
          `UPDATE conversations
           SET contact_id=COALESCE(contact_id,$3), channel='chat', subject=$4,
               updated_at=CURRENT_TIMESTAMP
           WHERE organization_id=$1 AND id=$2`,
          [session.organization_id, conversationId, session.contact_id, subject],
        );
      }

      const chatMessages = await client.query(`
        SELECT message.*
        FROM chat_messages message
        WHERE message.organization_id=$1 AND message.session_id=$2
        ORDER BY message.created_at, message.id
        FOR UPDATE
      `, [session.organization_id, session.id]);
      for (const message of chatMessages.rows) {
        if (message.inbox_message_id) continue;
        const senderType = message.sender_type === 'visitor'
          ? 'contact'
          : message.sender_type === 'agent' ? 'user' : 'system';
        const existing = await client.query(
          `SELECT inbox.id
           FROM messages inbox
           WHERE inbox.organization_id=$1
             AND inbox.conversation_id=$2
             AND inbox.channel='chat'
             AND inbox.sender_type=$3
             AND inbox.content=$4
             AND inbox.created_at=$5
             AND NOT EXISTS (
               SELECT 1 FROM chat_messages bound
               WHERE bound.inbox_message_id=inbox.id
             )
           ORDER BY inbox.id
           LIMIT 1`,
          [
            session.organization_id,
            conversationId,
            senderType,
            message.content,
            message.created_at,
          ],
        );
        let inboxMessageId = existing.rows[0]?.id;
        const metadata = {
          source: 'chat_widget',
          chat_session_id: session.id,
          chat_message_id: message.id,
          content_type: message.content_type,
          attachment_url: message.attachment_url,
          attachment_name: message.attachment_name,
          attachment_size: message.attachment_size,
        };
        if (inboxMessageId) {
          await client.query(
            `UPDATE messages
             SET metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb
             WHERE id=$1`,
            [inboxMessageId, JSON.stringify(metadata)],
          );
        } else {
          const inserted = await client.query(
            `INSERT INTO messages (
               conversation_id, organization_id, sender_type, sender_user_id,
               sender_contact_id, channel, content, metadata, is_read, created_at
             ) VALUES ($1,$2,$3,$4,$5,'chat',$6,$7::jsonb,$8,$9)
             RETURNING id`,
            [
              conversationId,
              session.organization_id,
              senderType,
              message.sender_type === 'agent' ? message.sender_user_id : null,
              message.sender_type === 'visitor' ? session.contact_id : null,
              message.content,
              JSON.stringify(metadata),
              message.sender_type !== 'visitor' || message.is_read,
              message.created_at,
            ],
          );
          inboxMessageId = inserted.rows[0].id;
        }
        await client.query(
          `UPDATE chat_messages SET inbox_message_id=$2 WHERE id=$1`,
          [message.id, inboxMessageId],
        );
      }

      await client.query(
        `UPDATE conversations conversation
         SET last_message_at=summary.created_at,
             last_message_preview=LEFT(summary.content,200),
             unread_count=summary.unread_count,
             updated_at=CURRENT_TIMESTAMP
         FROM (
           SELECT latest.created_at, latest.content,
                  COUNT(*) FILTER (
                    WHERE chat.sender_type='visitor' AND chat.is_read=FALSE
                  )::int AS unread_count
           FROM chat_messages chat
           JOIN LATERAL (
             SELECT content, created_at
             FROM chat_messages recent
             WHERE recent.organization_id=chat.organization_id
               AND recent.session_id=chat.session_id
             ORDER BY recent.created_at DESC, recent.id DESC
             LIMIT 1
           ) latest ON TRUE
           WHERE chat.organization_id=$1 AND chat.session_id=$2
           GROUP BY latest.created_at, latest.content
         ) summary
         WHERE conversation.organization_id=$1 AND conversation.id=$3`,
        [session.organization_id, session.id, conversationId],
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Chat Inbox bridge migration failed:', error.message);
    return false;
  } finally {
    client.release();
  }
}

module.exports = { runChatInboxBridgeMigration };
