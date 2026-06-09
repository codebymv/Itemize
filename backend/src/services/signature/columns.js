const qualify = (columns, alias) => columns.map(column => alias ? `${alias}.${column}` : column).join(', ');

const signatureDocumentColumnNames = [
    'id',
    'organization_id',
    'title',
    'document_number',
    'description',
    'message',
    'file_url',
    'file_name',
    'file_size',
    'file_type',
    'status',
    'expiration_days',
    'expires_at',
    'sender_name',
    'sender_email',
    'sent_at',
    'completed_at',
    'signed_file_url',
    'original_sha256',
    'signed_sha256',
    'timezone',
    'locale',
    'created_by',
    'created_at',
    'updated_at',
    'routing_mode',
    'template_id'
];

const signatureRecipientColumnNames = [
    'id',
    'document_id',
    'organization_id',
    'contact_id',
    'name',
    'email',
    'signing_order',
    'signing_token_hash',
    'token_expires_at',
    'status',
    'sent_at',
    'viewed_at',
    'signed_at',
    'declined_at',
    'decline_reason',
    'ip_address',
    'user_agent',
    'identity_method',
    'identity_verified_at',
    'created_at',
    'role_name',
    'routing_status'
];

const signatureFieldColumnNames = [
    'id',
    'document_id',
    'recipient_id',
    'field_type',
    'page_number',
    'x_position',
    'y_position',
    'width',
    'height',
    'label',
    'is_required',
    'value',
    'font_size',
    'font_family',
    'text_align',
    'locked',
    'created_at',
    'role_name'
];

const signatureAuditLogColumnNames = [
    'id',
    'document_id',
    'recipient_id',
    'event_type',
    'description',
    'ip_address',
    'user_agent',
    'metadata',
    'created_at'
];

const signatureTemplateColumnNames = [
    'id',
    'organization_id',
    'title',
    'description',
    'message',
    'file_url',
    'file_name',
    'file_size',
    'file_type',
    'original_sha256',
    'created_by',
    'created_at',
    'updated_at'
];

const signatureTemplateRoleColumnNames = [
    'id',
    'template_id',
    'role_name',
    'signing_order',
    'created_at'
];

const signatureTemplateFieldColumnNames = [
    'id',
    'template_id',
    'role_name',
    'field_type',
    'page_number',
    'x_position',
    'y_position',
    'width',
    'height',
    'label',
    'is_required',
    'font_size',
    'font_family',
    'text_align',
    'locked',
    'created_at'
];

const signatureDocumentColumns = (alias) => qualify(signatureDocumentColumnNames, alias);
const signatureRecipientColumns = (alias) => qualify(signatureRecipientColumnNames, alias);
const signatureFieldColumns = (alias) => qualify(signatureFieldColumnNames, alias);
const signatureAuditLogColumns = (alias) => qualify(signatureAuditLogColumnNames, alias);
const signatureTemplateColumns = (alias) => qualify(signatureTemplateColumnNames, alias);
const signatureTemplateRoleColumns = (alias) => qualify(signatureTemplateRoleColumnNames, alias);
const signatureTemplateFieldColumns = (alias) => qualify(signatureTemplateFieldColumnNames, alias);

module.exports = {
    signatureDocumentColumns,
    signatureRecipientColumns,
    signatureFieldColumns,
    signatureAuditLogColumns,
    signatureTemplateColumns,
    signatureTemplateRoleColumns,
    signatureTemplateFieldColumns,
    signatureDocumentColumnNames,
    signatureRecipientColumnNames,
    signatureFieldColumnNames,
    signatureAuditLogColumnNames,
    signatureTemplateColumnNames,
    signatureTemplateRoleColumnNames,
    signatureTemplateFieldColumnNames
};
