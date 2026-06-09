const { INVOICE_COLUMNS, PAYMENT_SETTINGS_COLUMNS, selectColumns } = require('./invoices/columns');

const ESTIMATE_COLUMNS = [
    'id',
    'organization_id',
    'estimate_number',
    'contact_id',
    'business_id',
    'customer_name',
    'customer_email',
    'customer_phone',
    'customer_address',
    'issue_date',
    'valid_until',
    'subtotal',
    'tax_amount',
    'discount_amount',
    'discount_type',
    'discount_value',
    'total',
    'currency',
    'status',
    'notes',
    'terms_and_conditions',
    'sent_at',
    'viewed_at',
    'accepted_at',
    'declined_at',
    'converted_invoice_id',
    'custom_fields',
    'created_by',
    'created_at',
    'updated_at'
];

const ESTIMATE_ITEM_COLUMNS = [
    'id',
    'estimate_id',
    'organization_id',
    'product_id',
    'name',
    'description',
    'quantity',
    'unit_price',
    'tax_rate',
    'tax_amount',
    'discount_amount',
    'total',
    'sort_order',
    'created_at',
    'updated_at'
];

const ESTIMATE_ITEM_UNNEST_COLUMNS = `
                            estimate_id,
                            organization_id,
                            product_id,
                            name,
                            description,
                            quantity,
                            unit_price,
                            tax_rate,
                            tax_amount,
                            total,
                            sort_order
`;

const INVOICE_ITEM_UNNEST_COLUMNS = `
                            invoice_id,
                            organization_id,
                            product_id,
                            name,
                            description,
                            quantity,
                            unit_price,
                            tax_rate,
                            tax_amount,
                            total,
                            sort_order
`;

const estimateColumns = (alias) => selectColumns(ESTIMATE_COLUMNS, alias);
const estimateItemColumns = (alias) => selectColumns(ESTIMATE_ITEM_COLUMNS, alias);
const invoiceColumns = (alias) => selectColumns(INVOICE_COLUMNS, alias);
const paymentSettingsColumns = (alias) => selectColumns(PAYMENT_SETTINGS_COLUMNS, alias);

module.exports = {
    ESTIMATE_ITEM_UNNEST_COLUMNS,
    INVOICE_ITEM_UNNEST_COLUMNS,
    estimateColumns,
    estimateItemColumns,
    invoiceColumns,
    paymentSettingsColumns
};
