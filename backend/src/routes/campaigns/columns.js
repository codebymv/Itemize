const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const CAMPAIGN_COLUMNS = [
    'id',
    'organization_id',
    'name',
    'subject',
    'from_name',
    'from_email',
    'reply_to',
    'template_id',
    'content_html',
    'content_text',
    'segment_type',
    'segment_filter',
    'tag_ids',
    'excluded_tag_ids',
    'status',
    'scheduled_at',
    'send_immediately',
    'timezone',
    'is_ab_test',
    'ab_variants',
    'ab_winner_criteria',
    'ab_test_duration_hours',
    'total_recipients',
    'total_sent',
    'total_delivered',
    'total_opened',
    'total_clicked',
    'total_bounced',
    'total_unsubscribed',
    'total_complained',
    'open_rate',
    'click_rate',
    'bounce_rate',
    'created_by',
    'sent_by',
    'started_at',
    'completed_at',
    'created_at',
    'updated_at'
];

const CAMPAIGN_RECIPIENT_COLUMNS = [
    'id',
    'campaign_id',
    'contact_id',
    'organization_id',
    'email',
    'first_name',
    'last_name',
    'status',
    'sent_at',
    'delivered_at',
    'opened_at',
    'clicked_at',
    'bounced_at',
    'unsubscribed_at',
    'open_count',
    'click_count',
    'clicked_links',
    'error_message',
    'bounce_type',
    'email_log_id',
    'external_message_id',
    'ab_variant',
    'created_at',
    'updated_at'
];

const CAMPAIGN_LINK_COLUMNS = [
    'id',
    'campaign_id',
    'original_url',
    'tracking_url',
    'link_text',
    'link_position',
    'total_clicks',
    'unique_clicks',
    'created_at'
];

const campaignColumns = (alias) => alias ? qualify(CAMPAIGN_COLUMNS, alias) : CAMPAIGN_COLUMNS.join(', ');
const campaignRecipientColumns = (alias) => alias ? qualify(CAMPAIGN_RECIPIENT_COLUMNS, alias) : CAMPAIGN_RECIPIENT_COLUMNS.join(', ');
const campaignLinkColumns = (alias) => alias ? qualify(CAMPAIGN_LINK_COLUMNS, alias) : CAMPAIGN_LINK_COLUMNS.join(', ');

module.exports = {
    campaignColumns,
    campaignRecipientColumns,
    campaignLinkColumns
};
