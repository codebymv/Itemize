const { INVOICE_COLUMNS, selectColumns } = require('./invoices/columns');

const RECURRING_TEMPLATE_COLUMNS = [
    'id',
    'organization_id',
    'template_name',
    'contact_id',
    'customer_name',
    'customer_email',
    'customer_phone',
    'customer_address',
    'frequency',
    'start_date',
    'end_date',
    'next_run_date',
    'last_generated_at',
    'status',
    'items',
    'subtotal',
    'tax_amount',
    'discount_amount',
    'discount_type',
    'discount_value',
    'total',
    'currency',
    'notes',
    'payment_terms',
    'custom_fields',
    'source_invoice_id',
    'created_by',
    'created_at',
    'updated_at'
];

const recurringTemplateColumns = (alias) => selectColumns(RECURRING_TEMPLATE_COLUMNS, alias);
const invoiceColumns = (alias) => selectColumns(INVOICE_COLUMNS, alias);

module.exports = {
    invoiceColumns,
    recurringTemplateColumns
};
