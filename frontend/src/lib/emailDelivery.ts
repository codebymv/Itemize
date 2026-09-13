export function hasPendingEmailOutcome(record: { updated_at?: string; email_delivery_status?: string | null }) {
    const age = Date.now() - new Date(record.updated_at || '').getTime();
    return age >= 0 && age < 600_000 && (!record.email_delivery_status || ['sent', 'delivery_delayed'].includes(record.email_delivery_status));
}
