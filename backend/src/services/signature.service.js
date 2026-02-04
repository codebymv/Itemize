/**
 * Signature Service
 * Core business logic for signature documents
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const { withDbClient, withTransaction } = require('../utils/db');

let s3Service = null;
try {
    s3Service = require('./s3.service');
} catch (e) {
    logger.info('S3 service not available - signature uploads will use local storage');
}

let pdfSignatureService = null;
try {
    pdfSignatureService = require('./pdf-signature.service');
} catch (e) {
    logger.info('PDF signature service not available');
}

let signatureEmailService = null;
try {
    signatureEmailService = require('./signature-email.service');
} catch (e) {
    logger.info('Signature email service not available');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

async function computeSha256FromFile(file) {
    if (file?.buffer) {
        return crypto.createHash('sha256').update(file.buffer).digest('hex');
    }
    if (file?.path) {
        const buffer = await fs.promises.readFile(file.path);
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }
    return null;
}

function buildUploadKey(organizationId, documentId, originalname) {
    const ext = path.extname(originalname || '');
    const base = path.basename(originalname || 'document', ext).replace(/[^a-zA-Z0-9-_]/g, '');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    return `signatures/${organizationId}/${documentId}/${base || 'document'}-${uniqueSuffix}${ext || '.pdf'}`;
}

function getLocalFilePath(fileUrl) {
    if (!fileUrl || !fileUrl.startsWith('/uploads/')) return null;
    const relativePath = fileUrl.replace('/uploads/', '');
    return path.join(__dirname, '../uploads', relativePath);
}

function getS3KeyFromUrl(fileUrl) {
    if (!fileUrl || !s3Service) return null;
    try {
        const url = new URL(fileUrl);
        const bucket = process.env.AWS_S3_BUCKET || 'itemize-uploads';
        if (!url.hostname.startsWith(`${bucket}.s3.`)) return null;
        return url.pathname.replace(/^\//, '');
    } catch (error) {
        return null;
    }
}

async function createDocument(pool, organizationId, userId, data) {
    return withDbClient(pool, async (client) => {
        const result = await client.query(`
            INSERT INTO signature_documents (
                organization_id,
                title,
                document_number,
                description,
                message,
                expiration_days,
                sender_name,
                sender_email,
                timezone,
                locale,
                routing_mode,
                template_id,
                created_by
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            )
            RETURNING *
        `, [
            organizationId,
            data.title,
            data.document_number || null,
            data.description || null,
            data.message || null,
            data.expiration_days || 30,
            data.sender_name || null,
            data.sender_email || null,
            data.timezone || null,
            data.locale || null,
            data.routing_mode || 'parallel',
            data.template_id || null,
            userId
        ]);

        return result.rows[0];
    });
}

async function updateDocument(pool, organizationId, documentId, data) {
    return withDbClient(pool, async (client) => {
        const result = await client.query(`
            UPDATE signature_documents SET
                title = COALESCE($1, title),
                document_number = COALESCE($2, document_number),
                description = COALESCE($3, description),
                message = COALESCE($4, message),
                expiration_days = COALESCE($5, expiration_days),
                sender_name = COALESCE($6, sender_name),
                sender_email = COALESCE($7, sender_email),
                timezone = COALESCE($8, timezone),
                locale = COALESCE($9, locale),
                routing_mode = COALESCE($10, routing_mode),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $11 AND organization_id = $12
            RETURNING *
        `, [
            data.title || null,
            data.document_number || null,
            data.description || null,
            data.message || null,
            data.expiration_days || null,
            data.sender_name || null,
            data.sender_email || null,
            data.timezone || null,
            data.locale || null,
            data.routing_mode || null,
            documentId,
            organizationId
        ]);

        return result.rows[0] || null;
    });
}

async function uploadDocument(pool, organizationId, documentId, file) {
    return withTransaction(pool, async (client) => {
        const sha256 = await computeSha256FromFile(file);
        let fileUrl = null;

        if (file?.buffer && s3Service && process.env.AWS_ACCESS_KEY_ID) {
            const key = buildUploadKey(organizationId, documentId, file.originalname);
            fileUrl = await s3Service.uploadFile(file.buffer, key, file.mimetype);
        } else if (file?.filename) {
            fileUrl = `/uploads/signatures/${file.filename}`;
        } else if (file?.path) {
            fileUrl = `/uploads/signatures/${path.basename(file.path)}`;
        }

        const updateResult = await client.query(`
            UPDATE signature_documents SET
                file_url = $1,
                file_name = $2,
                file_size = $3,
                file_type = $4,
                original_sha256 = $5,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6 AND organization_id = $7
            RETURNING *
        `, [
            fileUrl,
            file.originalname || file.filename || 'document.pdf',
            file.size || null,
            file.mimetype || 'application/pdf',
            sha256,
            documentId,
            organizationId
        ]);

        if (updateResult.rows.length > 0) {
            await client.query(`
                INSERT INTO signature_document_versions (
                    document_id,
                    version_number,
                    file_url,
                    file_name,
                    file_size,
                    file_type,
                    original_sha256,
                    created_at
                ) VALUES ($1, 1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                ON CONFLICT (document_id, version_number) DO NOTHING
            `, [
                documentId,
                fileUrl,
                file.originalname || file.filename || 'document.pdf',
                file.size || null,
                file.mimetype || 'application/pdf',
                sha256
            ]);
        }

        return updateResult.rows[0] || null;
    });
}

async function removeDocumentFile(pool, organizationId, documentId) {
    return withTransaction(pool, async (client) => {
        const docResult = await client.query(
            'SELECT file_url FROM signature_documents WHERE id = $1 AND organization_id = $2',
            [documentId, organizationId]
        );
        if (docResult.rows.length === 0) return null;

        const fileUrl = docResult.rows[0].file_url;

        if (fileUrl) {
            try {
                if (fileUrl.startsWith('/uploads/')) {
                    const relativePath = fileUrl.replace('/uploads/', '');
                    const fullPath = path.join(__dirname, '../uploads', relativePath);
                    await fs.promises.unlink(fullPath).catch(() => null);
                } else if (fileUrl.includes('.s3.') && s3Service) {
                    const parsed = new URL(fileUrl.startsWith('http') ? fileUrl : `https://${fileUrl}`);
                    const key = parsed.pathname.replace(/^\//, '');
                    await s3Service.deleteFile(key);
                }
            } catch (error) {
                logger.warn('Failed to delete signature document file', { error: error.message });
            }
        }

        const updateResult = await client.query(`
            UPDATE signature_documents SET
                file_url = NULL,
                file_name = NULL,
                file_size = NULL,
                file_type = NULL,
                original_sha256 = NULL,
                signed_file_url = NULL,
                signed_sha256 = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND organization_id = $2
            RETURNING *
        `, [documentId, organizationId]);

        await client.query(`
            INSERT INTO signature_audit_log (document_id, event_type, description, created_at)
            VALUES ($1, 'file_removed', 'Document file removed', CURRENT_TIMESTAMP)
        `, [documentId]);

        return updateResult.rows[0] || null;
    });
}

async function deleteDocumentFile(pool, organizationId, documentId) {
    return withTransaction(pool, async (client) => {
        const current = await client.query(
            'SELECT file_url FROM signature_documents WHERE id = $1 AND organization_id = $2',
            [documentId, organizationId]
        );
        if (current.rows.length === 0) return null;

        const fileUrl = current.rows[0].file_url;
        if (fileUrl) {
            if (s3Service && process.env.AWS_ACCESS_KEY_ID) {
                const key = getS3KeyFromUrl(fileUrl);
                if (key) {
                    try {
                        await s3Service.deleteFile(key);
                    } catch (error) {
                        logger.warn('Failed to delete signature file from S3', { error: error.message, key });
                    }
                }
            } else {
                const localPath = getLocalFilePath(fileUrl);
                if (localPath) {
                    try {
                        await fs.promises.unlink(localPath);
                    } catch (error) {
                        logger.warn('Failed to delete signature file from disk', { error: error.message, localPath });
                    }
                }
            }
        }

        await client.query(
            'DELETE FROM signature_document_versions WHERE document_id = $1',
            [documentId]
        );

        const updated = await client.query(`
            UPDATE signature_documents SET
                file_url = NULL,
                file_name = NULL,
                file_size = NULL,
                file_type = NULL,
                original_sha256 = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND organization_id = $2
            RETURNING *
        `, [documentId, organizationId]);

        return updated.rows[0] || null;
    });
}

async function replaceRecipients(pool, organizationId, documentId, recipients) {
    return withTransaction(pool, async (client) => {
        await client.query(
            'DELETE FROM signature_recipients WHERE document_id = $1 AND organization_id = $2',
            [documentId, organizationId]
        );

        const inserted = [];
        for (const recipient of recipients) {
            const result = await client.query(`
                INSERT INTO signature_recipients (
                    document_id,
                    organization_id,
                    contact_id,
                    name,
                    email,
                    signing_order,
                    identity_method,
                    role_name,
                    routing_status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [
                documentId,
                organizationId,
                recipient.contact_id || null,
                recipient.name || null,
                recipient.email,
                recipient.signing_order || 1,
                recipient.identity_method || 'none',
                recipient.role_name || null,
                recipient.routing_status || 'locked'
            ]);
            inserted.push(result.rows[0]);
        }

        // Map fields to recipients by role name if present
        const roleMap = new Map(inserted.map((rec) => [rec.role_name, rec.id]).filter(([role]) => role));
        for (const [roleName, recipientId] of roleMap.entries()) {
            await client.query(`
                UPDATE signature_fields
                SET recipient_id = $1
                WHERE document_id = $2 AND role_name = $3
            `, [recipientId, documentId, roleName]);
        }

        return inserted;
    });
}

async function replaceFields(pool, documentId, fields) {
    return withTransaction(pool, async (client) => {
        await client.query(
            'DELETE FROM signature_fields WHERE document_id = $1',
            [documentId]
        );

        const inserted = [];
        for (const field of fields) {
            const result = await client.query(`
                INSERT INTO signature_fields (
                    document_id,
                    recipient_id,
                    role_name,
                    field_type,
                    page_number,
                    x_position,
                    y_position,
                    width,
                    height,
                    label,
                    is_required,
                    value,
                    font_size,
                    font_family,
                    text_align,
                    locked
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8,
                    $9, $10, $11, $12, $13, $14, $15, $16
                )
                RETURNING *
            `, [
                documentId,
                field.recipient_id || null,
                field.role_name || null,
                field.field_type,
                field.page_number || 1,
                field.x_position,
                field.y_position,
                field.width,
                field.height,
                field.label || null,
                field.is_required !== undefined ? field.is_required : true,
                field.value || null,
                field.font_size || null,
                field.font_family || null,
                field.text_align || null,
                field.locked || false
            ]);
            inserted.push(result.rows[0]);
        }

        return inserted;
    });
}

async function listDocuments(pool, organizationId, filters = {}, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const values = [organizationId];
    const conditions = ['organization_id = $1'];
    let index = 2;

    if (filters.status) {
        conditions.push(`status = $${index}`);
        values.push(filters.status);
        index += 1;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await withDbClient(pool, async (client) => {
        const result = await client.query(
            `SELECT COUNT(*) FROM signature_documents ${whereClause}`,
            values
        );
        return parseInt(result.rows[0].count, 10);
    });

    const items = await withDbClient(pool, async (client) => {
        const result = await client.query(
            `SELECT * FROM signature_documents ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${index} OFFSET $${index + 1}`,
            [...values, limit, offset]
        );
        return result.rows;
    });

    return {
        items,
        pagination: {
            page,
            limit,
            total: countResult,
            totalPages: Math.ceil(countResult / limit),
            hasNext: page * limit < countResult,
            hasPrev: page > 1
        }
    };
}

async function getDocumentDetails(pool, organizationId, documentId) {
    return withDbClient(pool, async (client) => {
        const docResult = await client.query(
            'SELECT * FROM signature_documents WHERE id = $1 AND organization_id = $2',
            [documentId, organizationId]
        );
        if (docResult.rows.length === 0) return null;

        const recipientsResult = await client.query(
            'SELECT * FROM signature_recipients WHERE document_id = $1 ORDER BY signing_order ASC',
            [documentId]
        );
        const fieldsResult = await client.query(
            'SELECT * FROM signature_fields WHERE document_id = $1 ORDER BY id ASC',
            [documentId]
        );
        const auditResult = await client.query(
            'SELECT * FROM signature_audit_log WHERE document_id = $1 ORDER BY created_at ASC',
            [documentId]
        );

        return {
            document: docResult.rows[0],
            recipients: recipientsResult.rows,
            fields: fieldsResult.rows,
            audit: auditResult.rows
        };
    });
}

async function logAuditEvent(pool, documentId, recipientId, eventType, description, metadata = {}, audit = {}) {
    return withDbClient(pool, async (client) => {
        await client.query(`
            INSERT INTO signature_audit_log (
                document_id,
                recipient_id,
                event_type,
                description,
                ip_address,
                user_agent,
                metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            documentId,
            recipientId || null,
            eventType,
            description || null,
            audit.ip_address || null,
            audit.user_agent || null,
            metadata || {}
        ]);
    });
}

async function sendForSignature(pool, emailService, documentId, organizationId, signingUrlBase) {
    return withTransaction(pool, async (client) => {
        const docResult = await client.query(
            'SELECT * FROM signature_documents WHERE id = $1 AND organization_id = $2',
            [documentId, organizationId]
        );
        if (docResult.rows.length === 0) {
            return null;
        }
        const document = docResult.rows[0];

        const recipientsResult = await client.query(
            'SELECT * FROM signature_recipients WHERE document_id = $1 ORDER BY signing_order ASC',
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
            RETURNING *
        `, [expiresAt, documentId]);

        return updateDoc.rows[0];
    });
}

async function scheduleReminders(pool, documentId, daysFromNow = 2) {
    return withTransaction(pool, async (client) => {
        const recipientsResult = await client.query(
            'SELECT id FROM signature_recipients WHERE document_id = $1 AND status IN (\'pending\', \'sent\', \'viewed\')',
            [documentId]
        );
        const scheduledAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
        for (const recipient of recipientsResult.rows) {
            await client.query(`
                INSERT INTO signature_reminders (document_id, recipient_id, scheduled_at, status)
                VALUES ($1, $2, $3, 'pending')
            `, [documentId, recipient.id, scheduledAt]);
        }
        await client.query(`
            INSERT INTO signature_audit_log (document_id, event_type, description, created_at)
            VALUES ($1, 'reminder_scheduled', 'Signature reminders scheduled', CURRENT_TIMESTAMP)
        `, [documentId]);
        return { scheduledAt };
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
            'SELECT * FROM signature_fields WHERE document_id = $1 AND (recipient_id = $2 OR recipient_id IS NULL)',
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
                    continue;
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
                SELECT * FROM signature_recipients
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
                RETURNING *
            `, [signedFileUrl, signedSha256, documentId]);

            completedDocument = updateDoc.rows[0] || null;

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

async function createTemplate(pool, organizationId, userId, data) {
    return withDbClient(pool, async (client) => {
        const result = await client.query(`
            INSERT INTO signature_templates (
                organization_id,
                title,
                description,
                message,
                created_by
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [
            organizationId,
            data.title,
            data.description || null,
            data.message || null,
            userId
        ]);
        return result.rows[0];
    });
}

async function updateTemplate(pool, organizationId, templateId, data) {
    return withDbClient(pool, async (client) => {
        const result = await client.query(`
            UPDATE signature_templates SET
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                message = COALESCE($3, message),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4 AND organization_id = $5
            RETURNING *
        `, [
            data.title || null,
            data.description || null,
            data.message || null,
            templateId,
            organizationId
        ]);
        return result.rows[0] || null;
    });
}

async function uploadTemplateFile(pool, organizationId, templateId, file) {
    return withTransaction(pool, async (client) => {
        const sha256 = await computeSha256FromFile(file);
        let fileUrl = null;

        if (file?.buffer && s3Service && process.env.AWS_ACCESS_KEY_ID) {
            const key = buildUploadKey(organizationId, `template-${templateId}`, file.originalname);
            fileUrl = await s3Service.uploadFile(file.buffer, key, file.mimetype);
        } else if (file?.filename) {
            fileUrl = `/uploads/signatures/${file.filename}`;
        } else if (file?.path) {
            fileUrl = `/uploads/signatures/${path.basename(file.path)}`;
        }

        const updateResult = await client.query(`
            UPDATE signature_templates SET
                file_url = $1,
                file_name = $2,
                file_size = $3,
                file_type = $4,
                original_sha256 = $5,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6 AND organization_id = $7
            RETURNING *
        `, [
            fileUrl,
            file.originalname || file.filename || 'template.pdf',
            file.size || null,
            file.mimetype || 'application/pdf',
            sha256,
            templateId,
            organizationId
        ]);

        return updateResult.rows[0] || null;
    });
}

async function replaceTemplateRoles(pool, templateId, roles) {
    return withTransaction(pool, async (client) => {
        await client.query('DELETE FROM signature_template_roles WHERE template_id = $1', [templateId]);
        const inserted = [];
        for (const role of roles) {
            const result = await client.query(`
                INSERT INTO signature_template_roles (
                    template_id,
                    role_name,
                    signing_order
                ) VALUES ($1, $2, $3)
                RETURNING *
            `, [
                templateId,
                role.role_name,
                role.signing_order || 1
            ]);
            inserted.push(result.rows[0]);
        }
        return inserted;
    });
}

async function replaceTemplateFields(pool, templateId, fields) {
    return withTransaction(pool, async (client) => {
        await client.query('DELETE FROM signature_template_fields WHERE template_id = $1', [templateId]);
        const inserted = [];
        for (const field of fields) {
            const result = await client.query(`
                INSERT INTO signature_template_fields (
                    template_id,
                    role_name,
                    field_type,
                    page_number,
                    x_position,
                    y_position,
                    width,
                    height,
                    label,
                    is_required,
                    font_size,
                    font_family,
                    text_align,
                    locked
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8,
                    $9, $10, $11, $12, $13, $14
                )
                RETURNING *
            `, [
                templateId,
                field.role_name || null,
                field.field_type,
                field.page_number || 1,
                field.x_position,
                field.y_position,
                field.width,
                field.height,
                field.label || null,
                field.is_required !== undefined ? field.is_required : true,
                field.font_size || null,
                field.font_family || null,
                field.text_align || null,
                field.locked || false
            ]);
            inserted.push(result.rows[0]);
        }
        return inserted;
    });
}

async function listTemplates(pool, organizationId) {
    return withDbClient(pool, async (client) => {
        const result = await client.query(
            'SELECT * FROM signature_templates WHERE organization_id = $1 ORDER BY created_at DESC',
            [organizationId]
        );
        return result.rows;
    });
}

async function getTemplate(pool, organizationId, templateId) {
    return withDbClient(pool, async (client) => {
        const templateResult = await client.query(
            'SELECT * FROM signature_templates WHERE id = $1 AND organization_id = $2',
            [templateId, organizationId]
        );
        if (templateResult.rows.length === 0) return null;

        const rolesResult = await client.query(
            'SELECT * FROM signature_template_roles WHERE template_id = $1 ORDER BY signing_order ASC',
            [templateId]
        );
        const fieldsResult = await client.query(
            'SELECT * FROM signature_template_fields WHERE template_id = $1 ORDER BY id ASC',
            [templateId]
        );

        return {
            template: templateResult.rows[0],
            roles: rolesResult.rows,
            fields: fieldsResult.rows
        };
    });
}

async function instantiateTemplate(pool, organizationId, userId, templateId, data) {
    return withTransaction(pool, async (client) => {
        const templateResult = await client.query(
            'SELECT * FROM signature_templates WHERE id = $1 AND organization_id = $2',
            [templateId, organizationId]
        );
        if (templateResult.rows.length === 0) return null;
        const template = templateResult.rows[0];

        const rolesResult = await client.query(
            'SELECT * FROM signature_template_roles WHERE template_id = $1 ORDER BY signing_order ASC',
            [templateId]
        );
        const roleOrderMap = new Map(rolesResult.rows.map((role) => [role.role_name, role.signing_order]));

        const documentResult = await client.query(`
            INSERT INTO signature_documents (
                organization_id,
                title,
                description,
                message,
                file_url,
                file_name,
                file_size,
                file_type,
                original_sha256,
                template_id,
                routing_mode,
                created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            organizationId,
            data.title || template.title,
            data.description || template.description,
            data.message || template.message,
            template.file_url,
            template.file_name,
            template.file_size,
            template.file_type,
            template.original_sha256,
            template.id,
            data.routing_mode || 'parallel',
            userId
        ]);
        const document = documentResult.rows[0];

        const recipients = data.recipients || [];
        const recipientMap = new Map();
        for (const recipient of recipients) {
            const signingOrder = roleOrderMap.get(recipient.role_name) || recipient.signing_order || 1;
            const recipientResult = await client.query(`
                INSERT INTO signature_recipients (
                    document_id,
                    organization_id,
                    contact_id,
                    name,
                    email,
                    signing_order,
                    role_name,
                    identity_method,
                    routing_status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'locked')
                RETURNING *
            `, [
                document.id,
                organizationId,
                recipient.contact_id || null,
                recipient.name || null,
                recipient.email,
                signingOrder,
                recipient.role_name || null,
                recipient.identity_method || 'none'
            ]);
            recipientMap.set(recipient.role_name || recipient.email, recipientResult.rows[0].id);
        }

        const fieldsResult = await client.query(
            'SELECT * FROM signature_template_fields WHERE template_id = $1 ORDER BY id ASC',
            [templateId]
        );
        for (const field of fieldsResult.rows) {
            const recipientId = field.role_name ? recipientMap.get(field.role_name) || null : null;
            await client.query(`
                INSERT INTO signature_fields (
                    document_id,
                    recipient_id,
                    role_name,
                    field_type,
                    page_number,
                    x_position,
                    y_position,
                    width,
                    height,
                    label,
                    is_required,
                    font_size,
                    font_family,
                    text_align,
                    locked
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8,
                    $9, $10, $11, $12, $13, $14, $15
                )
            `, [
                document.id,
                recipientId,
                field.role_name || null,
                field.field_type,
                field.page_number,
                field.x_position,
                field.y_position,
                field.width,
                field.height,
                field.label,
                field.is_required,
                field.font_size,
                field.font_family,
                field.text_align,
                field.locked
            ]);
        }

        return document;
    });
}

module.exports = {
    createDocument,
    updateDocument,
    uploadDocument,
    deleteDocumentFile,
    replaceRecipients,
    replaceFields,
    listDocuments,
    getDocumentDetails,
    logAuditEvent,
    sendForSignature,
    scheduleReminders,
    getDocumentForSigning,
    submitSignature,
    declineSignature,
    createTemplate,
    updateTemplate,
    uploadTemplateFile,
    replaceTemplateRoles,
    replaceTemplateFields,
    listTemplates,
    getTemplate,
    instantiateTemplate,
    generateToken,
    hashToken
};
