const emailLogColumnNames = [
    'id',
    'organization_id',
    'contact_id',
    'template_id',
    'workflow_enrollment_id',
    'to_email',
    'from_email',
    'subject',
    'body_html',
    'status',
    'external_id',
    'metadata',
    'error_message',
    'queued_at',
    'sent_at',
    'delivered_at',
    'opened_at',
    'clicked_at',
    'recipient_name',
    'recipient_id',
    'sent_by',
    'created_at',
    'recipient_email'
];

const qualify = (columns, alias) => columns.map(column => alias ? `${alias}.${column}` : column).join(', ');

const emailLogColumns = (alias) => qualify(emailLogColumnNames, alias);

module.exports = {
    emailLogColumns,
    emailLogColumnNames
};
