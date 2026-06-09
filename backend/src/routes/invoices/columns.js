const PRODUCT_COLUMNS = [
    'id',
    'organization_id',
    'name',
    'description',
    'sku',
    'price',
    'currency',
    'product_type',
    'billing_period',
    'tax_rate',
    'taxable',
    'stripe_product_id',
    'stripe_price_id',
    'is_active',
    'created_by',
    'created_at',
    'updated_at'
];

const INVOICE_COLUMNS = [
    'id',
    'organization_id',
    'invoice_number',
    'contact_id',
    'business_id',
    'customer_name',
    'customer_email',
    'customer_phone',
    'customer_address',
    'issue_date',
    'due_date',
    'subtotal',
    'tax_rate',
    'tax_amount',
    'discount_amount',
    'discount_type',
    'discount_value',
    'total',
    'amount_paid',
    'amount_due',
    'currency',
    'status',
    'payment_terms',
    'payment_instructions',
    'notes',
    'terms_and_conditions',
    'stripe_invoice_id',
    'stripe_payment_intent_id',
    'stripe_hosted_invoice_url',
    'stripe_pdf_url',
    'sent_at',
    'viewed_at',
    'paid_at',
    'is_recurring',
    'recurring_interval',
    'parent_invoice_id',
    'recurring_template_id',
    'is_recurring_source',
    'custom_fields',
    'created_by',
    'created_at',
    'updated_at'
];

const INVOICE_ITEM_COLUMNS = [
    'id',
    'invoice_id',
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
    'created_at'
];

const PAYMENT_COLUMNS = [
    'id',
    'organization_id',
    'invoice_id',
    'contact_id',
    'amount',
    'currency',
    'payment_method',
    'status',
    'stripe_payment_intent_id',
    'stripe_charge_id',
    'stripe_refund_id',
    'card_last4',
    'card_brand',
    'description',
    'notes',
    'receipt_url',
    'refund_amount',
    'refunded_at',
    'refund_reason',
    'paid_at',
    'created_at',
    'updated_at'
];

const BUSINESS_COLUMNS = [
    'id',
    'organization_id',
    'name',
    'email',
    'phone',
    'address',
    'tax_id',
    'logo_url',
    'is_active',
    'last_used_at',
    'created_at',
    'updated_at'
];

const PAYMENT_SETTINGS_COLUMNS = [
    'id',
    'organization_id',
    'stripe_account_id',
    'stripe_publishable_key',
    'stripe_connected',
    'stripe_connected_at',
    'invoice_prefix',
    'next_invoice_number',
    'default_payment_terms',
    'default_notes',
    'default_terms',
    'default_tax_rate',
    'tax_id',
    'business_name',
    'business_address',
    'business_phone',
    'business_email',
    'logo_url',
    'default_currency',
    'created_at',
    'updated_at'
];

function selectColumns(columns, alias) {
    return columns.map((column) => (alias ? `${alias}.${column}` : column)).join(', ');
}

module.exports = {
    BUSINESS_COLUMNS,
    INVOICE_COLUMNS,
    INVOICE_ITEM_COLUMNS,
    PAYMENT_COLUMNS,
    PAYMENT_SETTINGS_COLUMNS,
    PRODUCT_COLUMNS,
    selectColumns
};
