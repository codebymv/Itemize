const DEFAULT_INVOICE_PREFIX = 'INV-';

/**
 * Atomically reserve the next organization-scoped invoice number.
 *
 * The payment_settings row is both the settings record and the sequence row.
 * INSERT ... ON CONFLICT makes first-use creation and later increments a single
 * PostgreSQL statement, so callers only need to keep their surrounding domain
 * work in the same transaction.
 */
async function allocateInvoiceNumber(client, organizationId) {
    const result = await client.query(`
        INSERT INTO payment_settings (organization_id, next_invoice_number)
        VALUES ($1, 2)
        ON CONFLICT (organization_id) DO UPDATE
        SET
            next_invoice_number = GREATEST(COALESCE(payment_settings.next_invoice_number, 1), 1) + 1,
            updated_at = CURRENT_TIMESTAMP
        RETURNING
            COALESCE(invoice_prefix, '${DEFAULT_INVOICE_PREFIX}') AS invoice_prefix,
            next_invoice_number - 1 AS allocated_number
    `, [organizationId]);

    const allocation = result.rows[0];
    if (!allocation) {
        throw new Error('Invoice number allocation returned no row');
    }

    const allocatedNumber = Number(allocation.allocated_number);
    if (!Number.isSafeInteger(allocatedNumber) || allocatedNumber < 1) {
        throw new Error('Invoice number allocation returned an invalid number');
    }

    return `${allocation.invoice_prefix || DEFAULT_INVOICE_PREFIX}${String(allocatedNumber).padStart(5, '0')}`;
}

/**
 * Estimate numbers currently have no dedicated counter column. Serialize the
 * legacy MAX+1 calculation per organization for the duration of the caller's
 * transaction. The unique constraint remains the final integrity guard.
 */
async function allocateEstimateNumber(client, organizationId) {
    await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('estimate_number'), $1::integer)",
        [organizationId]
    );

    const result = await client.query(`
        SELECT COALESCE(MAX(
            CAST(REGEXP_REPLACE(estimate_number, '[^0-9]', '', 'g') AS INTEGER)
        ), 0) + 1 AS next_num
        FROM estimates
        WHERE organization_id = $1
    `, [organizationId]);

    const nextNumber = Number(result.rows[0]?.next_num || 1);
    if (!Number.isSafeInteger(nextNumber) || nextNumber < 1) {
        throw new Error('Estimate number allocation returned an invalid number');
    }

    return `EST-${String(nextNumber).padStart(5, '0')}`;
}

module.exports = {
    allocateEstimateNumber,
    allocateInvoiceNumber,
};
