const outcomes: Record<string, string> = {
    sent: 'accepted', delivered: 'delivered', delivery_delayed: 'delivery delayed',
    bounced: 'bounced', complained: 'reported as spam', failed: 'delivery failed',
    suppressed: 'suppressed', opened: 'opened', clicked: 'link clicked',
};
const events: Record<string, string> = { confirmed: 'Confirmation', rescheduled: 'Reschedule', cancelled: 'Cancellation' };

export function EmailDeliveryStatus({ status, event }: { status?: string | null; event?: string | null }) {
    if (!status || !outcomes[status]) return null;
    const label = event && events[event] ? `${events[event]} email` : 'Email';
    return <span className="text-xs text-muted-foreground">{label} {outcomes[status]}</span>;
}
