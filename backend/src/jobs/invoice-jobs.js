/**
 * Invoice Background Jobs
 * - Overdue invoice detection
 * - Recurring invoice generation
 * - Payment reminders
 */

const { logger } = require('../utils/logger');
const { invoiceColumns, recurringTemplateColumns } = require('../routes/recurring-columns');
const { allocateInvoiceNumber } = require('../services/invoice-number.service');

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
            SELECT r.id
            FROM recurring_invoice_templates r
            WHERE r.status = 'active'
            AND r.next_run_date <= CURRENT_DATE
            AND (r.end_date IS NULL OR r.end_date >= CURRENT_DATE)
        `);

        const generated = [];

        for (const candidate of templatesResult.rows) {
            try {
                await client.query('BEGIN');

                // Claim and re-read the due template in this transaction. A second
                // job runner skips a locked row, and a later runner no longer
                // matches after next_run_date advances.
                const claimedResult = await client.query(`
                    SELECT ${recurringTemplateColumns('r')}, c.email as contact_email
                    FROM recurring_invoice_templates r
                    LEFT JOIN contacts c ON r.contact_id = c.id
                    WHERE r.id = $1
                    AND r.status = 'active'
                    AND r.next_run_date <= CURRENT_DATE
                    AND (r.end_date IS NULL OR r.end_date >= CURRENT_DATE)
                    FOR UPDATE OF r SKIP LOCKED
                `, [candidate.id]);

                if (claimedResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    continue;
                }

                const template = claimedResult.rows[0];
                const invoiceNumber = await allocateInvoiceNumber(client, template.organization_id);

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
                    RETURNING ${invoiceColumns()}
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
                if (items && items.length > 0) {
                    const invoiceIds = [];
                    const orgIds = [];
                    const productIds = [];
                    const names = [];
                    const descriptions = [];
                    const quantities = [];
                    const unitPrices = [];
                    const taxRates = [];
                    const taxAmounts = [];
                    const totals = [];
                    const sortOrders = [];

                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                        const itemTax = itemTotal * ((item.tax_rate || 0) / 100);

                        invoiceIds.push(invoiceId);
                        orgIds.push(template.organization_id);
                        productIds.push(item.product_id || null);
                        names.push(item.name);
                        descriptions.push(item.description || null);
                        quantities.push(item.quantity || 1);
                        unitPrices.push(item.unit_price || 0);
                        taxRates.push(item.tax_rate || 0);
                        taxAmounts.push(itemTax);
                        totals.push(itemTotal + itemTax);
                        sortOrders.push(i);
                    }

                    await client.query(`
                        INSERT INTO invoice_items (
                            invoice_id, organization_id, product_id, name, description,
                            quantity, unit_price, tax_rate, tax_amount, total, sort_order
                        )
                        SELECT
                            u.invoice_id, u.organization_id, u.product_id, u.name, u.description,
                            u.quantity, u.unit_price, u.tax_rate, u.tax_amount, u.total, u.sort_order
                        FROM UNNEST (
                            $1::int[], $2::int[], $3::int[], $4::varchar[], $5::text[],
                            $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[], $11::int[]
                        ) AS u(
                            invoice_id, organization_id, product_id, name, description,
                            quantity, unit_price, tax_rate, tax_amount, total, sort_order
                        )
                    `, [
                        invoiceIds,
                        orgIds,
                        productIds,
                        names,
                        descriptions,
                        quantities,
                        unitPrices,
                        taxRates,
                        taxAmounts,
                        totals,
                        sortOrders
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
                    WHERE id = $3 AND organization_id = $4
                `, [
                    isCompleted ? template.end_date : nextRunDate,
                    isCompleted ? 'completed' : 'active',
                    template.id,
                    template.organization_id
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
                logger.error(`Error generating invoice from template ${candidate.id}:`, templateError);
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
            SELECT ${invoiceColumns('i')},
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
