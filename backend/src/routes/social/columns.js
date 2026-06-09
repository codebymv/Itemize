const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const SOCIAL_CHANNEL_COLUMNS = [
    'id',
    'organization_id',
    'channel_type',
    'external_id',
    'name',
    'username',
    'profile_picture_url',
    'page_id',
    'page_access_token',
    'instagram_business_account_id',
    'user_id',
    'user_access_token',
    'token_expires_at',
    'permissions',
    'is_active',
    'is_connected',
    'connection_error',
    'last_synced_at',
    'webhook_verified',
    'created_by',
    'created_at',
    'updated_at'
];

const SOCIAL_CONVERSATION_COLUMNS = [
    'id',
    'organization_id',
    'channel_id',
    'thread_id',
    'participant_id',
    'participant_name',
    'participant_username',
    'participant_profile_pic',
    'contact_id',
    'status',
    'assigned_to',
    'unread_count',
    'message_count',
    'last_message_text',
    'last_message_at',
    'last_message_from',
    'tags',
    'created_at',
    'updated_at'
];

const SOCIAL_MESSAGE_COLUMNS = [
    'id',
    'organization_id',
    'conversation_id',
    'channel_id',
    'external_message_id',
    'message_type',
    'text_content',
    'media_url',
    'media_type',
    'media_filename',
    'direction',
    'sender_id',
    'sender_name',
    'sent_by',
    'status',
    'error_message',
    'message_timestamp',
    'read_at',
    'created_at'
];

const socialChannelColumns = (alias) => alias ? qualify(SOCIAL_CHANNEL_COLUMNS, alias) : SOCIAL_CHANNEL_COLUMNS.join(', ');
const socialConversationColumns = (alias) => alias ? qualify(SOCIAL_CONVERSATION_COLUMNS, alias) : SOCIAL_CONVERSATION_COLUMNS.join(', ');
const socialMessageColumns = (alias) => alias ? qualify(SOCIAL_MESSAGE_COLUMNS, alias) : SOCIAL_MESSAGE_COLUMNS.join(', ');

module.exports = {
    socialChannelColumns,
    socialConversationColumns,
    socialMessageColumns
};
