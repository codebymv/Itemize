const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const CHAT_WIDGET_COLUMNS = [
    'id',
    'organization_id',
    'widget_key',
    'name',
    'primary_color',
    'text_color',
    'position',
    'icon_style',
    'custom_icon_url',
    'welcome_title',
    'welcome_message',
    'placeholder_text',
    'require_email',
    'require_name',
    'require_phone',
    'custom_fields',
    'is_active',
    'auto_open_delay',
    'show_branding',
    'notification_sound',
    'business_hours',
    'offline_message',
    'default_assigned_to',
    'auto_assign_available',
    'total_conversations',
    'total_messages',
    'allowed_domains',
    'created_at',
    'updated_at'
];

const CHAT_SESSION_COLUMNS = [
    'id',
    'organization_id',
    'widget_id',
    'session_token',
    'visitor_name',
    'visitor_email',
    'visitor_phone',
    'custom_data',
    'ip_address',
    'user_agent',
    'referrer_url',
    'current_page_url',
    'country',
    'city',
    'timezone',
    'contact_id',
    'conversation_id',
    'status',
    'is_online',
    'last_seen_at',
    'started_at',
    'ended_at',
    'created_at',
    'updated_at'
];

const CHAT_MESSAGE_COLUMNS = [
    'id',
    'session_id',
    'organization_id',
    'sender_type',
    'sender_user_id',
    'content',
    'content_type',
    'attachment_url',
    'attachment_name',
    'attachment_size',
    'is_read',
    'read_at',
    'created_at'
];

const chatWidgetColumns = (alias) => alias ? qualify(CHAT_WIDGET_COLUMNS, alias) : CHAT_WIDGET_COLUMNS.join(', ');
const chatSessionColumns = (alias) => alias ? qualify(CHAT_SESSION_COLUMNS, alias) : CHAT_SESSION_COLUMNS.join(', ');
const chatMessageColumns = (alias) => alias ? qualify(CHAT_MESSAGE_COLUMNS, alias) : CHAT_MESSAGE_COLUMNS.join(', ');

module.exports = {
    chatWidgetColumns,
    chatSessionColumns,
    chatMessageColumns
};
