const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const CONVERSATION_COLUMNS = [
    'id',
    'organization_id',
    'contact_id',
    'assigned_to',
    'status',
    'snoozed_until',
    'channel',
    'subject',
    'last_message_at',
    'last_message_preview',
    'unread_count',
    'created_at',
    'updated_at'
];

const MESSAGE_COLUMNS = [
    'id',
    'conversation_id',
    'organization_id',
    'sender_type',
    'sender_user_id',
    'sender_contact_id',
    'channel',
    'content',
    'content_html',
    'metadata',
    'is_read',
    'created_at'
];

const conversationColumns = (alias) => alias ? qualify(CONVERSATION_COLUMNS, alias) : CONVERSATION_COLUMNS.join(', ');
const messageColumns = (alias) => alias ? qualify(MESSAGE_COLUMNS, alias) : MESSAGE_COLUMNS.join(', ');

module.exports = {
    conversationColumns,
    messageColumns
};
