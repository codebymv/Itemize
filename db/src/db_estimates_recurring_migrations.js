/**
 * Database migrations for Estimates and Recurring Invoices
 */

const { logger } = require('./utils/logger');

async function runEstimatesRecurringMigrations(pool) {
    const client = await pool.connect();

    try {
        logger.info('Running estimates and recurring invoices migrations...');

        // Create estimates table
        await client.query(`
            CREATE TABLE IF NOT EXISTS estimates (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                estimate_number VARCHAR(50) NOT NULL,
                contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
                customer_name VARCHAR(255),
                customer_email VARCHAR(255),
                customer_phone VARCHAR(50),
                customer_address TEXT,
                issue_date DATE DEFAULT CURRENT_DATE,
                valid_until DATE NOT NULL,
                subtotal DECIMAL(12, 2) DEFAULT 0,
                tax_amount DECIMAL(12, 2) DEFAULT 0,
                discount_amount DECIMAL(12, 2) DEFAULT 0,
                discount_type VARCHAR(20),
                discount_value DECIMAL(12, 2) DEFAULT 0,
                total DECIMAL(12, 2) DEFAULT 0,
                currency VARCHAR(3) DEFAULT 'USD',
                status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
                notes TEXT,
                terms_and_conditions TEXT,
                sent_at TIMESTAMP,
                viewed_at TIMESTAMP,
                accepted_at TIMESTAMP,
                declined_at TIMESTAMP,
                converted_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
                custom_fields JSONB DEFAULT '{}',
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(organization_id, estimate_number)
            )
        `);
        logger.info('Created estimates table');

        // Create estimate_items table
        await client.query(`
            CREATE TABLE IF NOT EXISTS estimate_items (
                id SERIAL PRIMARY KEY,
                estimate_id INTEGER NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                quantity DECIMAL(10, 2) DEFAULT 1,
                unit_price DECIMAL(12, 2) DEFAULT 0,
                tax_rate DECIMAL(5, 2) DEFAULT 0,
                tax_amount DECIMAL(12, 2) DEFAULT 0,
                discount_amount DECIMAL(12, 2) DEFAULT 0,
                total DECIMAL(12, 2) DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        logger.info('Created estimate_items table');

        // Create recurring_invoice_templates table
        await client.query(`
            CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                template_name VARCHAR(255) NOT NULL,
                contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
                customer_name VARCHAR(255),
                customer_email VARCHAR(255),
                customer_phone VARCHAR(50),
                customer_address TEXT,
                frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
                start_date DATE NOT NULL,
                end_date DATE,
                next_run_date DATE,
                last_generated_at TIMESTAMP,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
                items JSONB NOT NULL DEFAULT '[]',
                subtotal DECIMAL(12, 2) DEFAULT 0,
                tax_amount DECIMAL(12, 2) DEFAULT 0,
                discount_amount DECIMAL(12, 2) DEFAULT 0,
                discount_type VARCHAR(20),
                discount_value DECIMAL(12, 2) DEFAULT 0,
                total DECIMAL(12, 2) DEFAULT 0,
                currency VARCHAR(3) DEFAULT 'USD',
                notes TEXT,
                payment_terms VARCHAR(50),
                custom_fields JSONB DEFAULT '{}',
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        logger.info('Created recurring_invoice_templates table');

        // Add recurring_template_id to invoices table if not exists
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'invoices' AND column_name = 'recurring_template_id'
                ) THEN
                    ALTER TABLE invoices ADD COLUMN recurring_template_id INTEGER REFERENCES recurring_invoice_templates(id) ON DELETE SET NULL;
                END IF;
            END $$;
        `);
        logger.info('Added recurring_template_id to invoices table');

        // Add source_invoice_id to recurring_invoice_templates table
        // This tracks which invoice a template was created from (non-destructive copy)
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'recurring_invoice_templates' AND column_name = 'source_invoice_id'
                ) THEN
                    ALTER TABLE recurring_invoice_templates ADD COLUMN source_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;
                END IF;
            END $$;
        `);
        logger.info('Added source_invoice_id to recurring_invoice_templates table');

        // Add is_recurring_source to invoices table
        // This marks invoices that have been used to create recurring templates
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'invoices' AND column_name = 'is_recurring_source'
                ) THEN
                    ALTER TABLE invoices ADD COLUMN is_recurring_source BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
        `);
        logger.info('Added is_recurring_source to invoices table');

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_estimates_organization ON estimates(organization_id);
            CREATE INDEX IF NOT EXISTS idx_estimates_contact ON estimates(contact_id);
            CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);
            CREATE INDEX IF NOT EXISTS idx_estimates_valid_until ON estimates(valid_until);
            
            CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate ON estimate_items(estimate_id);
            CREATE INDEX IF NOT EXISTS idx_estimate_items_organization ON estimate_items(organization_id);
            
            CREATE INDEX IF NOT EXISTS idx_recurring_templates_organization ON recurring_invoice_templates(organization_id);
            CREATE INDEX IF NOT EXISTS idx_recurring_templates_contact ON recurring_invoice_templates(contact_id);
            CREATE INDEX IF NOT EXISTS idx_recurring_templates_status ON recurring_invoice_templates(status);
            CREATE INDEX IF NOT EXISTS idx_recurring_templates_next_run ON recurring_invoice_templates(next_run_date);
            
            CREATE INDEX IF NOT EXISTS idx_invoices_recurring_template ON invoices(recurring_template_id);
            CREATE INDEX IF NOT EXISTS idx_recurring_templates_source_invoice ON recurring_invoice_templates(source_invoice_id);
            CREATE INDEX IF NOT EXISTS idx_invoices_recurring_source ON invoices(is_recurring_source) WHERE is_recurring_source = true;
        `);
        logger.info('Created indexes for estimates and recurring tables');

        logger.info('Estimates and recurring invoices migrations completed successfully');
    } catch (error) {
        logger.error('Error running estimates and recurring migrations:', error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { runEstimatesRecurringMigrations };
