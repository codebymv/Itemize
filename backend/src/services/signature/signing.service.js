const { withTransaction } = require('../../utils/db');
const { WORKFLOW_TRIGGERS } = require('../../domain/workflowRegistry');
const {
    enqueueWorkflowTrigger,
    workflowTriggerEventKey,
} = require('../workflowTriggerQueue');
const { generateToken, hashToken } = require('./tokens');
const { pdfSignatureService, signatureEmailService } = require('./optional-services');
const {
    signatureDocumentColumns,
    signatureRecipientColumns,
    signatureFieldColumns
} = require('./columns');

async function sendForSignature(pool, emailService, documentId, organizationId, signingUrlBase) {
    return withTransaction(pool, async (client) => {
        const docResult = await client.query(
            `SELECT ${signatureDocumentColumns()} FROM signature_documents WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
            [documentId, organizationId]
        );
        if (docResult.rows.length === 0) {
            return null;
        }
        const document = docResult.rows[0];
        if (document.status !== 'draft') {
            throw new Error('Only draft documents can be sent');
        }

        const recipientsResult = await client.query(
            `SELECT ${signatureRecipientColumns()} FROM signature_recipients WHERE document_id = $1 ORDER BY signing_order ASC`,
            [documentId]
        );
        if (recipientsResult.rows.length === 0) {
            throw new Error('No recipients configured');
        }

        let senderName = document.sender_name || null;
        let senderEmail = document.sender_email || null;

        if (!senderName || !senderEmail) {
            const userResult = await client.query('SELECT name, email FROM users WHERE id = $1', [document.created_by]);
            if (userResult.rows.length > 0) {
                senderName = senderName || userResult.rows[0].name || null;
                senderEmail = senderEmail || userResult.rows[0].email || null;
            }
        }

        const routingMode = document.routing_mode || 'parallel';
        const now = new Date();
        const expiresAt = document.expiration_days
            ? new Date(now.getTime() + document.expiration_days * 24 * 60 * 60 * 1000)
            : null;

        for (let index = 0; index < recipientsResult.rows.length; index += 1) {
            const recipient = recipientsResult.rows[index];
            const isActive = routingMode === 'parallel' || index === 0;

            if (isActive) {
                const token = generateToken();
                const tokenHash = hashToken(token);

                await client.query(`
                    UPDATE signature_recipients SET
                        signing_token_hash = $1,
                        token_expires_at = $2,
                        status = 'sent',
                        routing_status = 'active',
                        sent_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [tokenHash, expiresAt, recipient.id]);

                if (emailService) {
                    const signingUrl = `${signingUrlBase}/${token}`;
                    await emailService.sendSignatureRequest({
                        to: recipient.email,
                        recipientName: recipient.name,
                        documentTitle: document.title,
                        senderName,
                        senderEmail,
                        message: document.message,
                        signingUrl,
                        expiresAt
                    });
                }

                await client.query(`
                    INSERT INTO signature_audit_log (document_id, recipient_id, event_type, description, created_at)
                    VALUES ($1, $2, 'sent', 'Signature request sent', CURRENT_TIMESTAMP)
                `, [documentId, recipient.id]);
            } else {
                await client.query(`
                    UPDATE signature_recipients SET
                        status = 'pending',
                        routing_status = 'locked',
                        signing_token_hash = NULL,
                        token_expires_at = $1
                    WHERE id = $2
                `, [expiresAt, recipient.id]);
            }
        }

        const updateDoc = await client.query(`
            UPDATE signature_documents SET
                status = 'sent',
                sent_at = CURRENT_TIMESTAMP,
                expires_at = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING ${signatureDocumentColumns()}
        `, [expiresAt, documentId]);

        return updateDoc.rows[0];
    });
}

async function remindForSignature(pool, emailService, documentId, organizationId, signingUrlBase) {
    return withTransaction(pool, async (client) => {
        const docResult = await client.query(
            `SELECT ${signatureDocumentColumns()} FROM signature_documents
             WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
            [documentId, organizationId]
        );
        if (docResult.rows.length === 0) return null;

        const document = docResult.rows[0];
        if (!['sent', 'in_progress'].includes(document.status)) {
            throw new Error('Only active signature documents can be reminded');
        }

        const recipientsResult = await client.query(`
            SELECT ${signatureRecipientColumns()}
            FROM signature_recipients
            WHERE document_id = $1
              AND organization_id = $2
              AND status IN ('sent', 'viewed')
              AND (COALESCE($3, 'parallel') = 'parallel' OR routing_status = 'active')
            ORDER BY signing_order ASC
            FOR UPDATE
        `, [documentId, organizationId, document.routing_mode]);

        if (recipientsResult.rows.length === 0) {
            throw new Error('No active recipients to remind');
        }

        for (const recipient of recipientsResult.rows) {
            const token = generateToken();
            const tokenHash = hashToken(token);
            await client.query(`
                UPDATE signature_recipients SET
                    signing_token_hash = $1,
                    token_expires_at = $2
                WHERE id = $3
            `, [tokenHash, document.expires_at, recipient.id]);

            if (emailService) {
                await emailService.sendSignatureReminder({
                    to: recipient.email,
                    recipientName: recipient.name,
                    documentTitle: document.title,
                    senderName: document.sender_name || 'Itemize',
                    message: document.message,
                    signingUrl: `${signingUrlBase}/${token}`,
                    expiresAt: document.expires_at
                });
            }

            await client.query(`
                INSERT INTO signature_audit_log (document_id, recipient_id, event_type, description, created_at)
                VALUES ($1, $2, 'reminder_sent', 'Signature reminder sent', CURRENT_TIMESTAMP)
            `, [documentId, recipient.id]);
        }

        return document;
    });
}

async function cancelDocument(pool, documentId, organizationId) {
    return withTransaction(pool, async (client) => {
        const docResult = await client.query(
            `SELECT ${signatureDocumentColumns()} FROM signature_documents
             WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
            [documentId, organizationId]
        );
        if (docResult.rows.length === 0) return null;

        const document = docResult.rows[0];
        if (document.status === 'completed') {
            throw new Error('Completed documents cannot be cancelled');
        }
        if (document.status === 'cancelled') {
            return document;
        }

        await client.query(`
            UPDATE signature_recipients SET
                signing_token_hash = NULL,
                token_expires_at = NULL,
                routing_status = 'locked'
            WHERE document_id = $1 AND organization_id = $2
              AND status IN ('pending', 'sent', 'viewed')
        `, [documentId, organizationId]);
        await client.query(`
            UPDATE signature_reminders SET status = 'cancelled'
            WHERE document_id = $1 AND status = 'pending'
        `, [documentId]);
        await client.query(`
            INSERT INTO signature_audit_log (document_id, event_type, description, created_at)
            VALUES ($1, 'cancelled', 'Signature document cancelled', CURRENT_TIMESTAMP)
        `, [documentId]);

        const updated = await client.query(`
            UPDATE signature_documents SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND organization_id = $2
            RETURNING ${signatureDocumentColumns()}
        `, [documentId, organizationId]);
        return updated.rows[0] || null;
    });
}

async function scheduleReminders(pool, documentId, organizationId, daysFromNow = 2) {
    return withTransaction(pool, async (client) => {
        const scheduledAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);

        const document = await client.query(`
            SELECT id FROM signature_documents
            WHERE id = $1 AND organization_id = $2
              AND status IN ('sent', 'in_progress')
            FOR UPDATE
        `, [documentId, organizationId]);
        if (document.rows.length === 0) return null;

        const inserted = await client.query(`
            INSERT INTO signature_reminders (document_id, recipient_id, scheduled_at, status)
            SELECT document_id, id, $1, 'pending'
            FROM signature_recipients
            WHERE document_id = $2 AND organization_id = $3
              AND status IN ('pending', 'sent', 'viewed')
            RETURNING id
        `, [scheduledAt, documentId, organizationId]);

        if (inserted.rows.length === 0) {
            throw new Error('No active recipients to remind');
        }

        await client.query(`
            INSERT INTO signature_audit_log (document_id, event_type, description, created_at)
            VALUES ($1, 'reminder_scheduled', 'Signature reminders scheduled', CURRENT_TIMESTAMP)
        `, [documentId]);

        return { scheduledAt, reminderCount: inserted.rows.length };
    });
}

async function getDocumentForSigning(pool, token, audit = {}) {
    const tokenHash = hashToken(token);
    return withTransaction(pool, async (client) => {
        const recipientResult = await client.query(`
            SELECT
                r.id AS recipient_id,
                r.document_id AS recipient_document_id,
                r.organization_id AS recipient_org_id,
                r.name AS recipient_name,
                r.email AS recipient_email,
                r.status AS recipient_status,
                r.routing_status,
                r.signing_order,
                r.identity_method,
                r.identity_verified_at,
                r.token_expires_at AS recipient_token_expires_at,
                d.id AS document_id,
                d.title,
                d.description,
                d.message,
                d.file_url,
                d.file_name,
                d.file_type,
                d.original_sha256,
                d.status AS document_status,
                d.expires_at AS document_expires_at,
                d.routing_mode,
                d.sender_name,
                d.sender_email
            FROM signature_recipients r
            JOIN signature_documents d ON d.id = r.document_id
            WHERE r.signing_token_hash = $1
            FOR UPDATE
        `, [tokenHash]);

        if (recipientResult.rows.length === 0) return null;

        const recipient = recipientResult.rows[0];
        const documentId = recipient.document_id;
        const now = new Date();

        if (!['sent', 'in_progress'].includes(recipient.document_status)) {
            return null;
        }
        if (recipient.recipient_token_expires_at && new Date(recipient.recipient_token_expires_at) < now) {
            return null;
        }
        if (recipient.document_expires_at && new Date(recipient.document_expires_at) < now) {
            return null;
        }
        if (recipient.recipient_status === 'signed' || recipient.recipient_status === 'declined') {
            return null;
        }
        if ((recipient.routing_mode || 'parallel') === 'sequential' && recipient.routing_status !== 'active') {
            return null;
        }

        if (recipient.recipient_status === 'sent' || recipient.recipient_status === 'pending') {
            await client.query(`
                UPDATE signature_recipients SET
                    status = 'viewed',
                    viewed_at = CURRENT_TIMESTAMP,
                    ip_address = $1,
                    user_agent = $2
                WHERE id = $3
            `, [audit.ip_address || null, audit.user_agent || null, recipient.recipient_id]);

            await client.query(`
                INSERT INTO signature_audit_log (document_id, recipient_id, event_type, description, ip_address, user_agent)
                VALUES ($1, $2, 'viewed', 'Recipient viewed document', $3, $4)
            `, [documentId, recipient.recipient_id, audit.ip_address || null, audit.user_agent || null]);
        }

        const fieldsResult = await client.query(
            `SELECT ${signatureFieldColumns()} FROM signature_fields WHERE document_id = $1 AND (recipient_id = $2 OR recipient_id IS NULL)`,
            [documentId, recipient.recipient_id]
        );

        return {
            document: {
                id: documentId,
                title: recipient.title,
                description: recipient.description,
                message: recipient.message,
                file_url: recipient.file_url,
                file_name: recipient.file_name,
                file_type: recipient.file_type,
                original_sha256: recipient.original_sha256,
                status: recipient.document_status,
                expires_at: recipient.document_expires_at,
                routing_mode: recipient.routing_mode
            },
            recipient: {
                id: recipient.recipient_id,
                name: recipient.recipient_name,
                email: recipient.recipient_email,
                status: recipient.recipient_status,
                routing_status: recipient.routing_status,
                identity_method: recipient.identity_method,
                identity_verified_at: recipient.identity_verified_at
            },
            fields: fieldsResult.rows
        };
    });
}

async function submitSignature(pool, token, payload, audit = {}) {
    const tokenHash = hashToken(token);
    return withTransaction(pool, async (client) => {
        const recipientResult = await client.query(`
            SELECT
                r.id AS recipient_id,
                r.document_id AS recipient_document_id,
                r.organization_id AS recipient_org_id,
                r.name AS recipient_name,
                r.email AS recipient_email,
                r.status AS recipient_status,
                r.routing_status,
                r.signing_order,
                r.identity_method,
                r.identity_verified_at,
                r.token_expires_at AS recipient_token_expires_at,
                d.id AS document_id,
                d.title,
                d.description,
                d.message,
                d.file_url,
                d.file_name,
                d.file_type,
                d.status AS document_status,
                d.expires_at AS document_expires_at,
                d.routing_mode,
                d.sender_name,
                d.sender_email
            FROM signature_recipients r
            JOIN signature_documents d ON d.id = r.document_id
            WHERE r.signing_token_hash = $1
            FOR UPDATE
        `, [tokenHash]);

        if (recipientResult.rows.length === 0) {
            return null;
        }

        const recipient = recipientResult.rows[0];
        const documentId = recipient.document_id;
        const now = new Date();

        if (!['sent', 'in_progress'].includes(recipient.document_status)) {
            return null;
        }
        if (recipient.recipient_token_expires_at && new Date(recipient.recipient_token_expires_at) < now) {
            return null;
        }
        if (recipient.document_expires_at && new Date(recipient.document_expires_at) < now) {
            return null;
        }
        if (recipient.recipient_status === 'signed' || recipient.recipient_status === 'declined') {
            return null;
        }
        if ((recipient.routing_mode || 'parallel') === 'sequential' && recipient.routing_status !== 'active') {
            return null;
        }

        // Update field values (validate allowed fields for recipient)
        const allowedFieldsResult = await client.query(
            'SELECT id, field_type FROM signature_fields WHERE document_id = $1 AND (recipient_id = $2 OR recipient_id IS NULL)',
            [documentId, recipient.recipient_id]
        );
        const allowedFields = new Map(allowedFieldsResult.rows.map((row) => [row.id, row.field_type]));

        const requiredFieldsResult = await client.query(
            'SELECT id FROM signature_fields WHERE document_id = $1 AND is_required = true AND (recipient_id = $2 OR recipient_id IS NULL)',
            [documentId, recipient.recipient_id]
        );
        const requiredFieldIds = new Set(requiredFieldsResult.rows.map((row) => row.id));
        const submittedMap = new Map((payload?.fields || []).map((field) => [field.id, field.value]));
        for (const fieldId of requiredFieldIds) {
            const value = submittedMap.get(fieldId);
            if (!value) {
                throw new Error('Missing required fields');
            }
        }

        if (payload?.fields?.length > 0) {
            for (const field of payload.fields) {
                if (!allowedFields.has(field.id)) {
                    throw new Error('Unknown signature field');
                }

                const fieldType = allowedFields.get(field.id);
                const value = field.value ?? '';
                if ((fieldType === 'signature' || fieldType === 'initials') && value) {
                    if (!String(value).startsWith('data:image/')) {
                        throw new Error('Invalid signature data');
                    }
                }

                await client.query(`
                    UPDATE signature_fields
                    SET value = $1
                    WHERE id = $2 AND document_id = $3
                `, [value, field.id, documentId]);
            }
        }

        // Update recipient status
        await client.query(`
            UPDATE signature_recipients SET
                status = 'signed',
                signed_at = CURRENT_TIMESTAMP,
                signing_token_hash = NULL,
                token_expires_at = NULL,
                ip_address = $1,
                user_agent = $2
            WHERE id = $3
        `, [audit.ip_address || null, audit.user_agent || null, recipient.recipient_id]);

        await client.query(`
            INSERT INTO signature_audit_log (document_id, recipient_id, event_type, description, ip_address, user_agent)
            VALUES ($1, $2, 'signed', 'Recipient signed document', $3, $4)
        `, [documentId, recipient.recipient_id, audit.ip_address || null, audit.user_agent || null]);

        if (signatureEmailService && recipient.sender_email) {
            await signatureEmailService.sendSignatureCompleted({
                to: recipient.sender_email,
                documentTitle: recipient.title,
                signerName: recipient.recipient_name || recipient.recipient_email
            });
        }

        // For sequential routing, activate next recipient
        if ((recipient.routing_mode || 'parallel') === 'sequential') {
            const nextRecipientResult = await client.query(`
                SELECT ${signatureRecipientColumns()} FROM signature_recipients
                WHERE document_id = $1 AND signing_order > $2 AND status = 'pending'
                ORDER BY signing_order ASC
                LIMIT 1
            `, [documentId, recipient.signing_order || 0]);

            if (nextRecipientResult.rows.length > 0) {
                const nextRecipient = nextRecipientResult.rows[0];
                const token = generateToken();
                const tokenHash = hashToken(token);
                await client.query(`
                    UPDATE signature_recipients SET
                        signing_token_hash = $1,
                        token_expires_at = $2,
                        status = 'sent',
                        routing_status = 'active',
                        sent_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [tokenHash, recipient.document_expires_at || null, nextRecipient.id]);

                if (signatureEmailService) {
                    const signingUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/sign/${token}`;
                    await signatureEmailService.sendSignatureRequest({
                        to: nextRecipient.email,
                        recipientName: nextRecipient.name,
                        documentTitle: recipient.title,
                        senderName: recipient.sender_name || null,
                        senderEmail: recipient.sender_email || null,
                        message: recipient.message,
                        signingUrl,
                        expiresAt: recipient.document_expires_at
                    });
                }

                await client.query(`
                    INSERT INTO signature_audit_log (document_id, recipient_id, event_type, description, created_at)
                    VALUES ($1, $2, 'sent', 'Signature request sent', CURRENT_TIMESTAMP)
                `, [documentId, nextRecipient.id]);
            }
        }

        // Check if all recipients have signed
        const remaining = await client.query(`
            SELECT COUNT(*) FROM signature_recipients
            WHERE document_id = $1 AND status != 'signed'
        `, [documentId]);

        let completedDocument = null;
        if (parseInt(remaining.rows[0].count, 10) === 0) {
            let signedFileUrl = null;
            let signedSha256 = null;

            if (pdfSignatureService) {
                const generated = await pdfSignatureService.generateSignedPdf({
                    pool,
                    documentId,
                    organizationId: recipient.recipient_org_id
                });
                signedFileUrl = generated?.fileUrl || null;
                signedSha256 = generated?.sha256 || null;
            }

            const updateDoc = await client.query(`
                UPDATE signature_documents SET
                    status = 'completed',
                    completed_at = CURRENT_TIMESTAMP,
                    signed_file_url = COALESCE($1, signed_file_url),
                    signed_sha256 = COALESCE($2, signed_sha256),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
                RETURNING ${signatureDocumentColumns()}
            `, [signedFileUrl, signedSha256, documentId]);

            completedDocument = updateDoc.rows[0] || null;

            if (completedDocument) {
                const contactResult = await client.query(`
                    SELECT DISTINCT contact_id
                    FROM signature_recipients
                    WHERE document_id = $1 AND contact_id IS NOT NULL
                    ORDER BY contact_id
                `, [documentId]);

                for (const row of contactResult.rows) {
                    await enqueueWorkflowTrigger(client, {
                        contactId: row.contact_id,
                        entityId: documentId,
                        entityType: 'signature_document',
                        eventKey: workflowTriggerEventKey(
                            'domain',
                            `contract_signed:${documentId}:contact:${row.contact_id}`
                        ),
                        organizationId: recipient.recipient_org_id,
                        payload: {
                            completed_at: completedDocument.completed_at,
                            document_id: documentId,
                            document_title: completedDocument.title,
                        },
                        triggerType: WORKFLOW_TRIGGERS.CONTRACT_SIGNED,
                    });
                }
            }

            if (signatureEmailService && completedDocument) {
                const recipientsResult = await client.query(
                    'SELECT email FROM signature_recipients WHERE document_id = $1',
                    [documentId]
                );
                const emails = recipientsResult.rows.map((row) => row.email).filter(Boolean);
                const downloadUrl = completedDocument.signed_file_url;
                if (completedDocument.sender_email) {
                    await signatureEmailService.sendDocumentCompleted({
                        to: completedDocument.sender_email,
                        documentTitle: completedDocument.title,
                        downloadUrl
                    });
                }
                for (const email of emails) {
                    await signatureEmailService.sendDocumentCompleted({
                        to: email,
                        documentTitle: completedDocument.title,
                        downloadUrl
                    });
                }
            }
        } else {
            await client.query(`
                UPDATE signature_documents SET
                    status = 'in_progress',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [documentId]);
        }

        return {
            recipientId: recipient.recipient_id,
            documentId,
            document: completedDocument
        };
    });
}

async function declineSignature(pool, token, reason, audit = {}) {
    const tokenHash = hashToken(token);
    return withTransaction(pool, async (client) => {
        const recipientResult = await client.query(`
            SELECT
                r.id AS recipient_id,
                r.document_id AS recipient_document_id,
                r.organization_id AS recipient_org_id,
                r.name AS recipient_name,
                r.email AS recipient_email,
                r.status AS recipient_status,
                r.identity_method,
                r.identity_verified_at,
                r.token_expires_at AS recipient_token_expires_at,
                d.id AS document_id,
                d.title,
                d.description,
                d.message,
                d.file_url,
                d.file_name,
                d.file_type,
                d.status AS document_status,
                d.expires_at AS document_expires_at,
                d.sender_name,
                d.sender_email
            FROM signature_recipients r
            JOIN signature_documents d ON d.id = r.document_id
            WHERE r.signing_token_hash = $1
            FOR UPDATE
        `, [tokenHash]);

        if (recipientResult.rows.length === 0) {
            return null;
        }

        const recipient = recipientResult.rows[0];
        const documentId = recipient.document_id;
        const now = new Date();

        if (!['sent', 'in_progress'].includes(recipient.document_status)) {
            return null;
        }
        if (recipient.recipient_token_expires_at && new Date(recipient.recipient_token_expires_at) < now) {
            return null;
        }
        if (recipient.document_expires_at && new Date(recipient.document_expires_at) < now) {
            return null;
        }
        if (recipient.recipient_status === 'signed' || recipient.recipient_status === 'declined') {
            return null;
        }

        await client.query(`
            UPDATE signature_recipients SET
                status = 'declined',
                declined_at = CURRENT_TIMESTAMP,
                decline_reason = $1,
                signing_token_hash = NULL,
                token_expires_at = NULL,
                ip_address = $2,
                user_agent = $3
            WHERE id = $4
        `, [reason || null, audit.ip_address || null, audit.user_agent || null, recipient.recipient_id]);

        await client.query(`
            UPDATE signature_documents SET
                status = 'cancelled',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [documentId]);

        await client.query(`
            INSERT INTO signature_audit_log (document_id, recipient_id, event_type, description, ip_address, user_agent)
            VALUES ($1, $2, 'declined', $3, $4, $5)
        `, [documentId, recipient.recipient_id, reason || 'Recipient declined to sign', audit.ip_address || null, audit.user_agent || null]);

        if (signatureEmailService && recipient.sender_email) {
            await signatureEmailService.sendSignatureDeclined({
                to: recipient.sender_email,
                documentTitle: recipient.title,
                recipientName: recipient.recipient_name || recipient.recipient_email,
                reason
            });
        }

        return { documentId, recipientId: recipient.recipient_id };
    });
}

module.exports = {
    sendForSignature,
    remindForSignature,
    cancelDocument,
    scheduleReminders,
    getDocumentForSigning,
    submitSignature,
    declineSignature
};
