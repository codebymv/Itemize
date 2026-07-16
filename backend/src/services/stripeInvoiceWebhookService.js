const { WORKFLOW_TRIGGERS } = require('../domain/workflowRegistry');
const {
    enqueueWorkflowTrigger,
    workflowTriggerEventKey,
} = require('./workflowTriggerQueue');

async function claimEvent(client, event) {
    if (!event?.id || !event?.type) {
        throw new Error('Stripe webhook event must include id and type');
    }

    const result = await client.query(`
        INSERT INTO stripe_webhook_events (event_id, event_type)
        VALUES ($1, $2)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
    `, [event.id, event.type]);

    return result.rowCount === 1;
}

async function processCompletedCheckout(client, session, logger) {
    const invoiceId = session.metadata?.invoice_id;
    if (!invoiceId || session.payment_status !== 'paid') {
        return { handled: false, reason: 'checkout_not_payable' };
    }

    const amount = Number(session.amount_total) / 100;
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('Stripe checkout session has an invalid amount_total');
    }

    const paymentReference = session.payment_intent || session.id;
    if (!paymentReference) {
        throw new Error('Stripe checkout session has no payment reference');
    }

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [String(paymentReference)]);

    const existingPayment = await client.query(
        'SELECT id FROM payments WHERE stripe_payment_intent_id = $1 LIMIT 1',
        [String(paymentReference)]
    );
    if (existingPayment.rows.length > 0) {
        return { handled: true, duplicatePayment: true };
    }

    const invoiceResult = await client.query(
        `SELECT organization_id, contact_id, total, amount_paid, status
         FROM invoices
         WHERE id = $1
         FOR UPDATE`,
        [invoiceId]
    );
    if (invoiceResult.rows.length === 0) {
        logger.warn(`Stripe checkout references missing invoice ${invoiceId}`, {
            sessionId: session.id,
        });
        return { handled: false, reason: 'invoice_not_found' };
    }

    const invoice = invoiceResult.rows[0];
    const metadataOrganizationId = session.metadata?.organization_id;
    if (
        metadataOrganizationId &&
        String(metadataOrganizationId) !== String(invoice.organization_id)
    ) {
        logger.warn(`Stripe checkout organization mismatch for invoice ${invoiceId}`, {
            sessionId: session.id,
            metadataOrganizationId,
            invoiceOrganizationId: invoice.organization_id,
        });
    }

    await client.query(`
        INSERT INTO payments (
            organization_id, invoice_id, amount, currency, payment_method, status,
            stripe_payment_intent_id, paid_at
        ) VALUES ($1, $2, $3, $4, 'stripe', 'succeeded', $5, CURRENT_TIMESTAMP)
    `, [
        invoice.organization_id,
        invoiceId,
        amount,
        (session.currency || 'usd').toUpperCase(),
        String(paymentReference),
    ]);

    const newAmountPaid = Number(invoice.amount_paid || 0) + amount;
    const newAmountDue = Number(invoice.total) - newAmountPaid;
    const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

    await client.query(`
        UPDATE invoices SET
            amount_paid = $1,
            amount_due = $2,
            status = $3::VARCHAR(20),
            paid_at = CASE WHEN $3::VARCHAR(20) = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
    `, [newAmountPaid, Math.max(0, newAmountDue), newStatus, invoiceId]);

    if (newStatus === 'paid' && invoice.status !== 'paid') {
        await enqueueWorkflowTrigger(client, {
            contactId: invoice.contact_id,
            entityId: invoiceId,
            entityType: 'invoice',
            eventKey: workflowTriggerEventKey('domain', `invoice_paid:${invoiceId}`),
            organizationId: invoice.organization_id,
            payload: {
                amount_paid: newAmountPaid,
                invoice_id: Number(invoiceId),
                payment_method: 'stripe',
                payment_reference: String(paymentReference),
                stripe_event_id: session.id,
                total: Number(invoice.total),
            },
            triggerType: WORKFLOW_TRIGGERS.INVOICE_PAID,
        });
    }

    return { handled: true, duplicatePayment: false };
}

async function processStripeInvoiceWebhook(client, event, logger) {
    const claimed = await claimEvent(client, event);
    if (!claimed) {
        return { received: true, duplicateEvent: true, handled: false };
    }

    logger.info(`Processing Stripe webhook event: ${event.type}`, { eventId: event.id });

    let outcome = { handled: false, reason: 'unhandled_event' };
    if (event.type === 'checkout.session.completed') {
        outcome = await processCompletedCheckout(client, event.data.object, logger);
    } else if (event.type === 'checkout.session.expired') {
        outcome = { handled: true };
    }

    return {
        received: true,
        duplicateEvent: false,
        ...outcome,
    };
}

module.exports = {
    claimEvent,
    processCompletedCheckout,
    processStripeInvoiceWebhook,
};
