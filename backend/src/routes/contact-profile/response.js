function buildContactProfileResponse({
    contact,
    invoices,
    signatures,
    payments,
    activities,
    notes,
    lists,
    communications,
    tasks,
    bookings
}) {
    return {
        contact: {
            id: contact.id.toString(),
            firstName: contact.first_name || '',
            lastName: contact.last_name || '',
            email: contact.email,
            phone: contact.phone,
            company: contact.company,
            title: contact.title,
            city: contact.city,
            state: contact.state,
            country: contact.country,
            status: contact.status || 'active',
            notes: contact.notes,
        },
        invoices: invoices.map(inv => ({
            id: inv.id.toString(),
            number: inv.invoice_number || `INV-${inv.id}`,
            status: inv.status || 'draft',
            total: inv.total || 0,
            date: inv.created_at,
            dueDate: inv.due_date,
        })),
        signatures: signatures.map(sig => ({
            id: sig.id.toString(),
            title: sig.title || 'Document',
            status: sig.status || 'draft',
            sentDate: sig.sent_at,
            signedDate: sig.signed_at,
        })),
        payments: payments.map(pay => ({
            id: pay.id?.toString() || '0',
            invoiceId: pay.invoice_id?.toString() || '0',
            invoiceNumber: pay.invoice_number || '',
            amount: pay.amount || 0,
            date: pay.date,
        })),
        communications: communications.map(row => ({
            id: row.id?.toString() || '0',
            type: row.type || 'email',
            direction: row.sender_type === 'contact' ? 'inbound' : 'outbound',
            subject: row.subject || '',
            content: row.content || '',
            date: row.date
        })),
        notes: notes.map(note => ({
            id: note.id?.toString() || '0',
            title: note.title || 'Note',
            content: note.content || '',
            createdAt: note.created_at,
        })),
        lists: lists.map(list => ({
            id: list.id?.toString() || '0',
            title: list.title || 'List',
            category: list.category,
        })),
        tasks: tasks.map(task => ({
            id: task.id?.toString() || '0',
            title: task.title || 'Task',
            description: task.description || '',
            status: task.status || 'pending',
            priority: task.priority || 'medium',
            dueDate: task.due_date,
            completedAt: task.completed_at,
        })),
        bookings: bookings.map(booking => ({
            id: booking.id?.toString() || '0',
            title: booking.title || 'Booking',
            calendarId: booking.calendar_id?.toString() || '0',
            startTime: booking.start_time,
            endTime: booking.end_time,
            status: booking.status || 'confirmed',
            source: booking.source || 'booking_page'
        })),
        timeline: activities.map(act => ({
            id: act.id?.toString() || '0',
            type: act.type || 'created',
            title: act.title,
            description: act.content,
            timestamp: act.created_at,
        })),
    };
}

module.exports = {
    buildContactProfileResponse
};
