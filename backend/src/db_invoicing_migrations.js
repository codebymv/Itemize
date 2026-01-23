/**
 * Invoicing/Payments Database Migrations
 * Tables for invoices, payments, and Stripe integration
 */

/**
 * Create products table
 * Stores products/services that can be invoiced
 */
async function createProductsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Product info
                name VARCHAR(255) NOT NULL,
                description TEXT,
                sku VARCHAR(100),
                
                -- Pricing
                price DECIMAL(10,2) NOT NULL DEFAULT 0,
                currency VARCHAR(3) DEFAULT 'USD',
                
                -- Type
                product_type VARCHAR(20) DEFAULT 'one_time' CHECK (product_type IN ('one_time', 'recurring')),
                billing_period VARCHAR(20) CHECK (billing_period IN ('monthly', 'yearly', 'weekly', 'quarterly')),
                
                -- Tax
                tax_rate DECIMAL(5,2) DEFAULT 0,
                taxable BOOLEAN DEFAULT TRUE,
                
                -- Stripe
                stripe_product_id VARCHAR(100),
                stripe_price_id VARCHAR(100),
                
                -- Status
                is_active BOOLEAN DEFAULT TRUE,
                
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_products_sku ON products(organization_id, sku)
        `);

        console.log('✅ products table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create invoices table
 */
async function createInvoicesTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS invoices (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Invoice identification
                invoice_number VARCHAR(50) NOT NULL,
                
                -- Customer
                contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
                customer_name VARCHAR(255),
                customer_email VARCHAR(255),
                customer_phone VARCHAR(50),
                customer_address TEXT,
                
                -- Dates
                issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
                due_date DATE NOT NULL,
                
                -- Amounts
                subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
                tax_amount DECIMAL(10,2) DEFAULT 0,
                discount_amount DECIMAL(10,2) DEFAULT 0,
                discount_type VARCHAR(10) CHECK (discount_type IN ('fixed', 'percent')),
                discount_value DECIMAL(10,2) DEFAULT 0,
                total DECIMAL(10,2) NOT NULL DEFAULT 0,
                amount_paid DECIMAL(10,2) DEFAULT 0,
                amount_due DECIMAL(10,2) NOT NULL DEFAULT 0,
                currency VARCHAR(3) DEFAULT 'USD',
                
                -- Status
                status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'partial', 'overdue', 'cancelled', 'refunded')),
                
                -- Payment
                payment_terms TEXT,
                payment_instructions TEXT,
                
                -- Notes
                notes TEXT,
                terms_and_conditions TEXT,
                
                -- Stripe
                stripe_invoice_id VARCHAR(100),
                stripe_payment_intent_id VARCHAR(100),
                stripe_hosted_invoice_url VARCHAR(500),
                stripe_pdf_url VARCHAR(500),
                
                -- Email tracking
                sent_at TIMESTAMP WITH TIME ZONE,
                viewed_at TIMESTAMP WITH TIME ZONE,
                paid_at TIMESTAMP WITH TIME ZONE,
                
                -- Recurring
                is_recurring BOOLEAN DEFAULT FALSE,
                recurring_interval VARCHAR(20),
                parent_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
                
                -- Metadata
                custom_fields JSONB DEFAULT '{}',
                
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(organization_id, invoice_number)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_contact ON invoices(contact_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(organization_id, invoice_number)
        `);

        console.log('✅ invoices table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create invoice_items table
 */
async function createInvoiceItemsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS invoice_items (
                id SERIAL PRIMARY KEY,
                invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                
                -- Item details
                product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                
                -- Pricing
                quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
                unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
                tax_rate DECIMAL(5,2) DEFAULT 0,
                tax_amount DECIMAL(10,2) DEFAULT 0,
                discount_amount DECIMAL(10,2) DEFAULT 0,
                total DECIMAL(10,2) NOT NULL DEFAULT 0,
                
                -- Order
                sort_order INTEGER DEFAULT 0,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)
        `);

        console.log('✅ invoice_items table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create payments table
 */
async function createPaymentsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
                contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
                
                -- Payment info
                amount DECIMAL(10,2) NOT NULL,
                currency VARCHAR(3) DEFAULT 'USD',
                
                -- Method
                payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('card', 'bank_transfer', 'cash', 'check', 'other', 'stripe')),
                
                -- Status
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled')),
                
                -- Stripe
                stripe_payment_intent_id VARCHAR(100),
                stripe_charge_id VARCHAR(100),
                stripe_refund_id VARCHAR(100),
                
                -- Card details (partial, for display)
                card_last4 VARCHAR(4),
                card_brand VARCHAR(20),
                
                -- Metadata
                description TEXT,
                notes TEXT,
                receipt_url VARCHAR(500),
                
                -- Refund info
                refund_amount DECIMAL(10,2) DEFAULT 0,
                refunded_at TIMESTAMP WITH TIME ZONE,
                refund_reason TEXT,
                
                -- Timestamps
                paid_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(organization_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_contact ON payments(contact_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_stripe_pi ON payments(stripe_payment_intent_id)
        `);

        console.log('✅ payments table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Create payment_settings table
 * Stores Stripe and payment configuration per organization
 */
async function createPaymentSettingsTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS payment_settings (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
                
                -- Stripe configuration
                stripe_account_id VARCHAR(100),
                stripe_publishable_key VARCHAR(200),
                stripe_connected BOOLEAN DEFAULT FALSE,
                stripe_connected_at TIMESTAMP WITH TIME ZONE,
                
                -- Invoice settings
                invoice_prefix VARCHAR(10) DEFAULT 'INV-',
                next_invoice_number INTEGER DEFAULT 1,
                default_payment_terms INTEGER DEFAULT 30,
                default_notes TEXT,
                default_terms TEXT,
                
                -- Tax settings
                default_tax_rate DECIMAL(5,2) DEFAULT 0,
                tax_id VARCHAR(50),
                
                -- Business info (for invoices)
                business_name VARCHAR(255),
                business_address TEXT,
                business_phone VARCHAR(50),
                business_email VARCHAR(255),
                logo_url VARCHAR(500),
                
                -- Currency
                default_currency VARCHAR(3) DEFAULT 'USD',
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_payment_settings_org ON payment_settings(organization_id)
        `);

        console.log('✅ payment_settings table created/verified');
    } finally {
        client.release();
    }
}

/**
 * Run all invoicing migrations
 */
async function runAllInvoicingMigrations(pool) {
    console.log('Running invoicing migrations...');
    
    await createProductsTable(pool);
    await createInvoicesTable(pool);
    await createInvoiceItemsTable(pool);
    await createPaymentsTable(pool);
    await createPaymentSettingsTable(pool);
    
    console.log('✅ All invoicing migrations completed');
}

module.exports = {
    runAllInvoicingMigrations,
    createProductsTable,
    createInvoicesTable,
    createInvoiceItemsTable,
    createPaymentsTable,
    createPaymentSettingsTable
};
