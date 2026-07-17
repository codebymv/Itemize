const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const FORM_COLUMNS = [
    'id',
    'organization_id',
    'name',
    'description',
    'slug',
    'public_id',
    'type',
    'status',
    'submit_button_text',
    'success_message',
    'redirect_url',
    'notify_on_submit',
    'notification_emails',
    'theme',
    'create_contact',
    'contact_tags',
    'created_by',
    'created_at',
    'updated_at'
];

const FORM_FIELD_COLUMNS = [
    'id',
    'form_id',
    'field_type',
    'label',
    'placeholder',
    'help_text',
    'is_required',
    'validation',
    'options',
    'field_order',
    'width',
    'conditions',
    'map_to_contact_field',
    'created_at'
];

const FORM_SUBMISSION_COLUMNS = [
    'id',
    'form_id',
    'organization_id',
    'contact_id',
    'data',
    'ip_address',
    'user_agent',
    'referrer',
    'score',
    'created_at'
];

const formColumns = (alias) => alias ? qualify(FORM_COLUMNS, alias) : FORM_COLUMNS.join(', ');
const formFieldColumns = (alias) => alias ? qualify(FORM_FIELD_COLUMNS, alias) : FORM_FIELD_COLUMNS.join(', ');
const formSubmissionColumns = (alias) => alias ? qualify(FORM_SUBMISSION_COLUMNS, alias) : FORM_SUBMISSION_COLUMNS.join(', ');

const FORM_FIELD_UNNEST_COLUMNS = `
                            form_id,
                            field_type,
                            label,
                            placeholder,
                            help_text,
                            is_required,
                            validation,
                            options,
                            field_order,
                            width,
                            conditions,
                            map_to_contact_field
`;

module.exports = {
    formColumns,
    formFieldColumns,
    formSubmissionColumns,
    FORM_FIELD_UNNEST_COLUMNS
};
