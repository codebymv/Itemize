const crypto = require('node:crypto');

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

async function enqueueFormSubmissionNotifications(client, {
    form,
    submission,
}) {
    if (!form.notify_on_submit || !Array.isArray(form.notification_emails)) return [];

    const emails = [...new Set(form.notification_emails)];
    const queued = [];
    for (const email of emails) {
        const recipientHash = crypto
            .createHash('sha256')
            .update(email)
            .digest('hex')
            .slice(0, 24);
        const idempotencyKey = `form-submission-${submission.id}-notify-${recipientHash}`;
        const result = await client.query(`
            INSERT INTO workflow_side_effect_outbox (
                idempotency_key,
                organization_id,
                enrollment_run_at,
                effect_type,
                payload
            ) VALUES ($1, $2, $3, 'email', $4::jsonb)
            ON CONFLICT (idempotency_key) DO UPDATE SET
                idempotency_key = workflow_side_effect_outbox.idempotency_key
            RETURNING id, idempotency_key, status
        `, [
            idempotencyKey,
            form.organization_id,
            submission.created_at,
            JSON.stringify({
                to: email,
                subject: `New form submission: ${form.name}`,
                bodyHtml: [
                    '<p>A new submission was received for ',
                    `<strong>${escapeHtml(form.name)}</strong>.</p>`,
                    '<p>Sign in to Itemize to review it.</p>',
                ].join(''),
                bodyText: `A new submission was received for ${form.name}. Sign in to Itemize to review it.`,
                contactId: submission.contact_id || null,
                formId: form.id,
                formSubmissionId: submission.id,
            }),
        ]);
        queued.push(result.rows[0]);
    }
    return queued;
}

module.exports = { enqueueFormSubmissionNotifications };
