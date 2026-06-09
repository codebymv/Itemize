const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const EMAIL_TEMPLATE_COLUMNS = [
  'id',
  'organization_id',
  'name',
  'subject',
  'body_html',
  'body_text',
  'variables',
  'category',
  'is_active',
  'created_by',
  'created_at',
  'updated_at'
];

const SMS_TEMPLATE_COLUMNS = [
  'id',
  'organization_id',
  'name',
  'message',
  'variables',
  'category',
  'is_active',
  'created_by',
  'created_at',
  'updated_at'
];

const CONTACT_COLUMNS = [
  'id',
  'organization_id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'company',
  'job_title',
  'address',
  'source',
  'status',
  'custom_fields',
  'tags',
  'assigned_to',
  'created_by',
  'created_at',
  'updated_at'
];

const emailTemplateColumns = (alias) => alias ? qualify(EMAIL_TEMPLATE_COLUMNS, alias) : EMAIL_TEMPLATE_COLUMNS.join(', ');
const smsTemplateColumns = (alias) => alias ? qualify(SMS_TEMPLATE_COLUMNS, alias) : SMS_TEMPLATE_COLUMNS.join(', ');
const contactColumns = (alias) => alias ? qualify(CONTACT_COLUMNS, alias) : CONTACT_COLUMNS.join(', ');

module.exports = {
  contactColumns,
  emailTemplateColumns,
  smsTemplateColumns
};
