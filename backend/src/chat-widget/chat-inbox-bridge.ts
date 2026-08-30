import { PoolClient } from 'pg';

type ChatSessionBridgeRow = {
  id: number;
  organization_id: number;
  conversation_id: number | null;
  contact_id: number | null;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  status: string;
  default_assigned_to: number | null;
};

const visitorLabel = (session: ChatSessionBridgeRow): string =>
  session.visitor_name?.trim()
  || session.visitor_email?.trim()
  || session.visitor_phone?.trim()
  || 'Website visitor';

export async function ensureChatInboxConversation(
  client: PoolClient,
  organizationId: number,
  sessionId: number,
): Promise<number> {
  const result = await client.query<ChatSessionBridgeRow>(
    `SELECT session.id, session.organization_id, session.conversation_id,
            session.contact_id, session.visitor_name, session.visitor_email,
            session.visitor_phone, session.status, widget.default_assigned_to
     FROM chat_sessions session
     JOIN chat_widgets widget
       ON widget.id=session.widget_id
      AND widget.organization_id=session.organization_id
     WHERE session.organization_id=$1 AND session.id=$2
     FOR UPDATE OF session`,
    [organizationId, sessionId],
  );
  const session = result.rows[0];
  if (!session) throw new Error('Chat session disappeared');

  const status = session.status === 'active' ? 'open' : 'closed';
  let conversationId = session.conversation_id;
  if (conversationId) {
    const owned = await client.query(
      `SELECT 1 FROM conversations WHERE organization_id=$1 AND id=$2`,
      [organizationId, conversationId],
    );
    if (!owned.rows[0]) conversationId = null;
  }
  if (!conversationId) {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO conversations (
         organization_id, contact_id, assigned_to, status, channel, subject
       ) VALUES ($1,$2,$3,$4,'chat',$5)
       RETURNING id`,
      [
        organizationId,
        session.contact_id,
        session.default_assigned_to,
        status,
        visitorLabel(session),
      ],
    );
    conversationId = inserted.rows[0].id;
    await client.query(
      `UPDATE chat_sessions
       SET conversation_id=$3, updated_at=CURRENT_TIMESTAMP
       WHERE organization_id=$1 AND id=$2`,
      [organizationId, sessionId, conversationId],
    );
  } else {
    await client.query(
      `UPDATE conversations
       SET contact_id=$3,
           subject=$4,
           channel='chat',
           updated_at=CURRENT_TIMESTAMP
       WHERE organization_id=$1 AND id=$2`,
      [organizationId, conversationId, session.contact_id, visitorLabel(session)],
    );
  }
  return conversationId;
}

export async function mirrorChatMessageToInbox(
  client: PoolClient,
  organizationId: number,
  chatMessageId: number,
): Promise<{ conversationId: number; inboxMessageId: number; inbound: boolean }> {
  const result = await client.query<{
    id: number;
    session_id: number;
    inbox_message_id: number | null;
    sender_type: string;
    sender_user_id: number | null;
    content: string;
    content_type: string;
    attachment_url: string | null;
    attachment_name: string | null;
    attachment_size: number | null;
    is_read: boolean;
    created_at: Date;
    contact_id: number | null;
    widget_name: string;
  }>(
    `SELECT message.id, message.session_id, message.inbox_message_id,
            message.sender_type, message.sender_user_id, message.content,
            message.content_type, message.attachment_url,
            message.attachment_name, message.attachment_size,
            message.is_read, message.created_at, session.contact_id,
            widget.name AS widget_name
     FROM chat_messages message
     JOIN chat_sessions session
       ON session.id=message.session_id
      AND session.organization_id=message.organization_id
     JOIN chat_widgets widget
       ON widget.id=session.widget_id
      AND widget.organization_id=session.organization_id
     WHERE message.organization_id=$1 AND message.id=$2
     FOR UPDATE OF message`,
    [organizationId, chatMessageId],
  );
  const chat = result.rows[0];
  if (!chat) throw new Error('Chat message disappeared');
  const conversationId = await ensureChatInboxConversation(
    client,
    organizationId,
    chat.session_id,
  );
  if (chat.inbox_message_id) {
    return {
      conversationId,
      inboxMessageId: chat.inbox_message_id,
      inbound: chat.sender_type === 'visitor',
    };
  }

  const inbound = chat.sender_type === 'visitor';
  const metadata = {
    source: 'chat_widget',
    chat_session_id: chat.session_id,
    chat_message_id: chat.id,
    widget_name: chat.widget_name,
    content_type: chat.content_type,
    attachment_url: chat.attachment_url,
    attachment_name: chat.attachment_name,
    attachment_size: chat.attachment_size,
  };
  const inserted = await client.query<{ id: number }>(
    `INSERT INTO messages (
       conversation_id, organization_id, sender_type, sender_user_id,
       sender_contact_id, channel, content, metadata, is_read, created_at
     ) VALUES ($1,$2,$3,$4,$5,'chat',$6,$7::jsonb,$8,$9)
     RETURNING id`,
    [
      conversationId,
      organizationId,
      inbound ? 'contact' : chat.sender_type === 'agent' ? 'user' : 'system',
      chat.sender_type === 'agent' ? chat.sender_user_id : null,
      inbound ? chat.contact_id : null,
      chat.content,
      JSON.stringify(metadata),
      !inbound || chat.is_read,
      chat.created_at,
    ],
  );
  await client.query(
    `UPDATE chat_messages
     SET inbox_message_id=$3
     WHERE organization_id=$1 AND id=$2`,
    [organizationId, chatMessageId, inserted.rows[0].id],
  );
  await client.query(
    `UPDATE conversations
     SET last_message_at=$3,
         last_message_preview=$4,
         unread_count=unread_count + CASE WHEN $5 THEN 1 ELSE 0 END,
         status=CASE WHEN $5 THEN 'open' ELSE status END,
         snoozed_until=CASE WHEN $5 THEN NULL ELSE snoozed_until END,
         updated_at=CURRENT_TIMESTAMP
     WHERE organization_id=$1 AND id=$2`,
    [
      organizationId,
      conversationId,
      chat.created_at,
      chat.content.slice(0, 200),
      inbound,
    ],
  );
  return { conversationId, inboxMessageId: inserted.rows[0].id, inbound };
}
