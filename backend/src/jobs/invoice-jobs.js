/**
 * Invoice Background Jobs
 * - Overdue invoice detection
 * - Recurring invoice generation
 * - Payment reminders
 */

const { logger } = require('../utils/logger');

/**
 * Mark overdue invoices
 * Run daily to detect invoices past due date
 */
async function runOverdueDetection(pool) {
    const client = await pool.connect();
    
    try {
        logger.info('Running overdue invoice detection...');
        
        // Find invoices that are past due and not yet marked as overdue
        const result = await client.query(`
            UPDATE invoices 
            SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
            WHERE status IN ('sent', 'viewed', 'partial')
            AND due_date < CURRENT_DATE
            AND amount_due > 0
            RETURNING id, invoice_number, organization_id
        `);

        if (result.rows.length > 0) {
            logger.info(`Marked ${result.rows.length} invoices as overdue`);
            
            // Log the overdue invoices
            result.rows.forEach(invoice => {
                logger.info(`Invoice ${invoice.invoice_number} (ID: ${invoice.id}) marked as overdue`);
            });
        } else {
            logger.info('No new overdue invoices found');
        }

        return result.rows;
    } catch (error) {
        logger.error('Error in overdue detection job:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Generate recurring invoices
 * Run daily to create invoices from recurring templates
 */
async function runRecurringInvoiceGeneration(pool) {
    const client = await pool.connect();
    
    try {
        logger.info('Running recurring invoice generation...');
        
        // Find active recurring templates due for generation
        const templatesResult = await client.query(`
            SELECT r.*, c.email as contact_email
            FROM recurring_invoice_templates r
            LEFT JOIN contacts c ON r.contact_id = c.id
            WHERE r.status = 'active'
            AND r.next_run_date <= CURRENT_DATE
            AND (r.end_date IS NULL OR r.end_date >= CURRENT_DATE)
        `);

        const generated = [];

        for (const template of templatesResult.rows) {
            try {
                await client.query('BEGIN');

                // Get next invoice number
                const settingsResult = await client.query(
                    'SELECT invoice_prefix, next_invoice_number FROM payment_settings WHERE organization_id = $1',
                    [template.organization_id]
                );

                let prefix = 'INV-';
                let nextNumber = 1;

                if (settingsResult.rows.length > 0) {
                    prefix = settingsResult.rows[0].invoice_prefix || 'INV-';
                    nextNumber = settingsResult.rows[0].next_invoice_number || 1;

                    await client.query(
                        'UPDATE payment_settings SET next_invoice_number = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2',
                        [nextNumber + 1, template.organization_id]
                    );
                } else {
                    await client.query(`
                        INSERT INTO payment_settings (organization_id, next_invoice_number)
                        VALUES ($1, 2)
                    `, [template.organization_id]);
                }

                const invoiceNumber = `${prefix}${String(nextNumber).padStart(5, '0')}`;

                // Calculate due date based on payment terms (default 30 days)
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + (template.payment_terms ? parseInt(template.payment_terms) : 30));

                // Parse items from JSON
                const items = typeof template.items === 'string' ? JSON.parse(template.items) : template.items;

                // Create the invoice
                const invoiceResult = await client.query(`
                    INSERT INTO invoices (
                        organization_id, invoice_number, contact_id,
                        customer_name, customer_email,
                        due_date, subtotal, tax_amount, discount_amount, discount_type, discount_value,
                        total, amount_due, notes, recurring_template_id, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                    RETURNING *
                `, [
                    template.organization_id,
                    invoiceNumber,
                    template.contact_id,
                    template.customer_name,
                    template.customer_email || template.contact_email,
                    dueDate.toISOString().split('T')[0],
                    template.subtotal,
                    template.tax_amount,
                    template.discount_amount,
                    template.discount_type,
                    template.discount_value,
                    template.total,
                    template.total,
                    template.notes,
                    template.id,
                    template.created_by
                ]);

                const invoiceId = invoiceResult.rows[0].id;

                // Create invoice items
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                    const itemTax = itemTotal * ((item.tax_rate || 0) / 100);

                    await client.query(`
                        INSERT INTO invoice_items (
                            invoice_id, organization_id, product_id, name, description,
                            quantity, unit_price, tax_rate, tax_amount, total, sort_order
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    `, [
                        invoiceId,
                        template.organization_id,
                        item.product_id || null,
                        item.name,
                        item.description || null,
                        item.quantity || 1,
                        item.unit_price || 0,
                        item.tax_rate || 0,
                        itemTax,
                        itemTotal + itemTax,
                        i
                    ]);
                }

                // Calculate next run date
                const nextRunDate = calculateNextRunDate(template.next_run_date, template.frequency);

                // Check if completed
                const isCompleted = template.end_date && new Date(nextRunDate) > new Date(template.end_date);

                // Update template
                await client.query(`
                    UPDATE recurring_invoice_templates 
                    SET 
                        next_run_date = $1, 
                        last_generated_at = CURRENT_TIMESTAMP,
                        status = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [
                    isCompleted ? template.end_date : nextRunDate,
                    isCompleted ? 'completed' : 'active',
                    template.id
                ]);

                await client.query('COMMIT');

                generated.push({
                    template_id: template.id,
                    template_name: template.template_name,
                    invoice_id: invoiceId,
                    invoice_number: invoiceNumber
                });

                logger.info(`Generated invoice ${invoiceNumber} from recurring template ${template.template_name}`);
            } catch (templateError) {
                await client.query('ROLLBACK');
                logger.error(`Error generating invoice from template ${template.id}:`, templateError);
            }
        }

        logger.info(`Generated ${generated.length} invoices from recurring templates`);
        return generated;
    } catch (error) {
        logger.error('Error in recurring invoice generation job:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Calculate next run date based on frequency
 */
function calculateNextRunDate(currentDate, frequency) {
    const date = new Date(currentDate);

    switch (frequency) {
        case 'weekly':
            date.setDate(date.getDate() + 7);
            break;
        case 'monthly':
            date.setMonth(date.getMonth() + 1);
            break;
        case 'quarterly':
            date.setMonth(date.getMonth() + 3);
            break;
        case 'yearly':
            date.setFullYear(date.getFullYear() + 1);
            break;
    }

    return date.toISOString().split('T')[0];
}

/**
 * Find invoices needing payment reminders
 * Returns invoices that are due soon or overdue
 */
async function findInvoicesNeedingReminders(pool) {
    const client = await pool.connect();
    
    try {
        logger.info('Finding invoices needing payment reminders...');
        
        const today = new Date();
        const threeDaysFromNow = new Date(today);
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

        // Find invoices due within 3 days or overdue (up to 30 days)
        const result = await client.query(`
            SELECT i.*, 
                c.email as contact_email,
                ps.business_name, ps.business_email
            FROM invoices i
            LEFT JOIN contacts c ON i.contact_id = c.id
            LEFT JOIN payment_settings ps ON i.organization_id = ps.organization_id
            WHERE i.status IN ('sent', 'viewed', 'partial', 'overdue')
            AND i.amount_due > 0
            AND (i.customer_email IS NOT NULL OR c.email IS NOT NULL)
            AND (
                -- Due within 3 days
                (i.due_date BETWEEN CURRENT_DATE AND $1::date AND i.status NOT IN ('overdue'))
                OR
                -- Overdue but not more than 30 days (send weekly reminders)
                (i.status = 'overdue' AND i.due_date > CURRENT_DATE - INTERVAL '30 days')
            )
            ORDER BY i.due_date ASC
        `, [threeDaysFromNow.toISOString().split('T')[0]]);

        logger.info(`Found ${result.rows.length} invoices needing reminders`);
        return result.rows;
    } catch (error) {
        logger.error('Error finding invoices needing reminders:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Check estimate expiry
 * Mark estimates as expired if past valid_until date
 */
async function runEstimateExpiryCheck(pool) {
    const client = await pool.connect();
    
    try {
        logger.info('Running estimate expiry check...');
        
        const result = await client.query(`
            UPDATE estimates 
            SET status = 'expired', updated_at = CURRENT_TIMESTAMP
            WHERE status = 'sent'
            AND valid_until < CURRENT_DATE
            RETURNING id, estimate_number, organization_id
        `);

        if (result.rows.length > 0) {
            logger.info(`Marked ${result.rows.length} estimates as expired`);
        } else {
            logger.info('No expired estimates found');
        }

        return result.rows;
    } catch (error) {
        logger.error('Error in estimate expiry check:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Run all invoice jobs
 * Called by cron scheduler
 */
async function runAllInvoiceJobs(pool) {
    logger.info('Starting invoice background jobs...');
    
    try {
        // Run all jobs in sequence
        await runOverdueDetection(pool);
        await runRecurringInvoiceGeneration(pool);
        await runEstimateExpiryCheck(pool);
        
        // Note: Payment reminder sending would be done here with the email service
        // const invoicesNeedingReminders = await findInvoicesNeedingReminders(pool);
        
        logger.info('Invoice background jobs completed');
    } catch (error) {
        logger.error('Error in invoice background jobs:', error);
    }
}

module.exports = {
    runOverdueDetection,
    runRecurringInvoiceGeneration,
    findInvoicesNeedingReminders,
    runEstimateExpiryCheck,
    runAllInvoiceJobs
};
