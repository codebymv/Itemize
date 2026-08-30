import { PoolClient } from 'pg';

type SocialConversationBridgeRow = {
  id: number;
  organization_id: number;
  inbox_conversation_id: number | null;
  contact_id: number | null;
  assigned_to: number | null;
  status: string;
  participant_name: string | null;
  participant_username: string | null;
  last_message_at: Date | null;
  last_message_text: string | null;
  unread_count: number;
  channel_type: string;
};

export async function ensureInboxConversation(
  client: PoolClient,
  organizationId: number,
  socialConversationId: number,
): Promise<number> {
  const result = await client.query<SocialConversationBridgeRow>(
    `SELECT conversation.id, conversation.organization_id,
            conversation.inbox_conversation_id, conversation.contact_id,
            conversation.assigned_to, conversation.status,
            conversation.participant_name, conversation.participant_username,
            conversation.last_message_at, conversation.last_message_text,
            conversation.unread_count, channel.channel_type
     FROM social_conversations conversation
     JOIN social_channels channel
       ON channel.id=conversation.channel_id
      AND channel.organization_id=conversation.organization_id
     WHERE conversation.organization_id=$1 AND conversation.id=$2
     FOR UPDATE OF conversation`,
    [organizationId, socialConversationId],
  );
  const social = result.rows[0];
  if (!social) throw new Error('Social conversation disappeared');

  const subject = social.participant_name?.trim()
    || social.participant_username?.trim()
    || 'Social contact';
  const status = ['closed', 'spam'].includes(social.status) ? 'closed' : 'open';
  let inboxConversationId = social.inbox_conversation_id;

  if (!inboxConversationId) {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO conversations (
         organization_id, contact_id, assigned_to, status, channel, subject,
         last_message_at, last_message_preview, unread_count
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        organizationId,
        social.contact_id,
        social.assigned_to,
        status,
        social.channel_type,
        subject,
        social.last_message_at,
        social.last_message_text,
        social.unread_count,
      ],
    );
    inboxConversationId = inserted.rows[0].id;
    await client.query(
      `UPDATE social_conversations
       SET inbox_conversation_id=$3
       WHERE organization_id=$1 AND id=$2`,
      [organizationId, socialConversationId, inboxConversationId],
    );
  } else {
    await client.query(
      `UPDATE conversations
       SET contact_id=$3, assigned_to=$4, status=$5, channel=$6,
           subject=$7, last_message_at=$8, last_message_preview=$9,
           unread_count=$10, updated_at=CURRENT_TIMESTAMP
       WHERE organization_id=$1 AND id=$2`,
      [
        organizationId,
        inboxConversationId,
        social.contact_id,
        social.assigned_to,
        status,
        social.channel_type,
        subject,
        social.last_message_at,
        social.last_message_text,
        social.unread_count,
      ],
    );
  }

  return inboxConversationId;
}

export async function mirrorSocialMessageToInbox(
  client: PoolClient,
  organizationId: number,
  socialMessageId: number,
): Promise<number> {
  const messageResult = await client.query<{
    id: number;
    conversation_id: number;
    inbox_message_id: number | null;
    external_message_id: string | null;
    message_type: string;
    text_content: string | null;
    media_url: string | null;
    media_type: string | null;
    media_filename: string | null;
    direction: string;
    sent_by: number | null;
    status: string;
    error_message: string | null;
    message_timestamp: Date;
    read_at: Date | null;
    channel_type: string;
    channel_name: string;
    participant_name: string | null;
    participant_username: string | null;
    contact_id: number | null;
  }>(
    `SELECT message.id, message.conversation_id, message.inbox_message_id,
            message.external_message_id, message.message_type,
            message.text_content, message.media_url, message.media_type,
            message.media_filename, message.direction, message.sent_by,
            message.status, message.error_message, message.message_timestamp,
            message.read_at, channel.channel_type,
            channel.name AS channel_name, conversation.participant_name,
            conversation.participant_username, conversation.contact_id
     FROM social_messages message
     JOIN social_conversations conversation
       ON conversation.id=message.conversation_id
      AND conversation.organization_id=message.organization_id
     JOIN social_channels channel
       ON channel.id=message.channel_id
      AND channel.organization_id=message.organization_id
     WHERE message.organization_id=$1 AND message.id=$2
     FOR UPDATE OF message`,
    [organizationId, socialMessageId],
  );
  const social = messageResult.rows[0];
  if (!social) throw new Error('Social message disappeared');
  if (social.inbox_message_id) return social.inbox_message_id;

  const inboxConversationId = await ensureInboxConversation(
    client,
    organizationId,
    social.conversation_id,
  );
  const content = social.text_content
    || (social.media_type ? `[${social.media_type}]` : `[${social.message_type}]`);
  const metadata = {
    source: 'social',
    provider: social.channel_type,
    provider_account_name: social.channel_name,
    social_conversation_id: social.conversation_id,
    social_message_id: social.id,
    external_message_id: social.external_message_id,
    participant_name: social.participant_name,
    participant_username: social.participant_username,
    message_type: social.message_type,
    media_url: social.media_url,
    media_type: social.media_type,
    media_filename: social.media_filename,
    delivery_status: social.status,
    delivery_error: social.error_message,
  };
  const inserted = await client.query<{ id: number }>(
    `INSERT INTO messages (
       conversation_id, organization_id, sender_type, sender_user_id,
       sender_contact_id, channel, content, metadata, is_read, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
     RETURNING id`,
    [
      inboxConversationId,
      organizationId,
      social.direction === 'outbound' ? 'user' : 'contact',
      social.direction === 'outbound' ? social.sent_by : null,
      social.direction === 'inbound' ? social.contact_id : null,
      social.channel_type,
      content,
      JSON.stringify(metadata),
      social.direction === 'outbound' || social.read_at !== null,
      social.message_timestamp,
    ],
  );
  await client.query(
    `UPDATE social_messages SET inbox_message_id=$3
     WHERE organization_id=$1 AND id=$2`,
    [organizationId, socialMessageId, inserted.rows[0].id],
  );
  await client.query(
    `UPDATE conversations
     SET last_message_at=$3, last_message_preview=$4,
         status=CASE WHEN status='snoozed' THEN 'open' ELSE status END,
         snoozed_until=CASE WHEN status='snoozed' THEN NULL ELSE snoozed_until END,
         updated_at=CURRENT_TIMESTAMP
     WHERE organization_id=$1 AND id=$2`,
    [organizationId, inboxConversationId, social.message_timestamp, content.slice(0, 200)],
  );
  return inserted.rows[0].id;
}

export async function syncSocialMessageDeliveryToInbox(
  client: PoolClient,
  organizationId: number,
  socialMessageId: number,
): Promise<void> {
  await client.query(
    `UPDATE messages inbox_message
     SET metadata=jsonb_set(
       jsonb_set(
         COALESCE(inbox_message.metadata, '{}'::jsonb),
         '{delivery_status}', to_jsonb(social_message.status), TRUE
       ),
       '{delivery_error}', COALESCE(to_jsonb(social_message.error_message), 'null'::jsonb), TRUE
     )
     FROM social_messages social_message
     WHERE social_message.organization_id=$1
       AND social_message.id=$2
       AND social_message.inbox_message_id=inbox_message.id
       AND inbox_message.organization_id=social_message.organization_id`,
    [organizationId, socialMessageId],
  );
}
