const fs = require('fs');
const path = require('path');
const { logger } = require('../../utils/logger');
const { withDbClient, withTransaction } = require('../../utils/db');
const {
    s3Service,
    computeSha256FromFile,
    buildUploadKey,
    getLocalFilePath,
    getS3KeyFromUrl,
    getUploadedFileUrl
} = require('./storage');
const {
    signatureDocumentColumns,
    signatureRecipientColumns,
    signatureFieldColumns,
    signatureAuditLogColumns
} = require('./columns');

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
            RETURNING ${signatureDocumentColumns()}
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
            RETURNING ${signatureDocumentColumns()}
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
        } else {
            fileUrl = getUploadedFileUrl(file);
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
            RETURNING ${signatureDocumentColumns()}
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
            RETURNING ${signatureDocumentColumns()}
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
            RETURNING ${signatureDocumentColumns()}
        `, [documentId, organizationId]);

        return updated.rows[0] || null;
    });
}

async function deleteDocument(pool, organizationId, documentId) {
    return withTransaction(pool, async (client) => {
        const docResult = await client.query(
            'SELECT id, status, file_url FROM signature_documents WHERE id = $1 AND organization_id = $2',
            [documentId, organizationId]
        );
        if (docResult.rows.length === 0) return null;
        const doc = docResult.rows[0];

        if (doc.status !== 'draft') {
            throw new Error('Only draft documents can be deleted');
        }

        const fileUrl = doc.file_url;
        if (fileUrl) {
            try {
                if (fileUrl.startsWith('/uploads/')) {
                    const relativePath = fileUrl.replace('/uploads/', '');
                    const fullPath = path.join(__dirname, '../uploads', relativePath);
                    await fs.promises.unlink(fullPath).catch(() => null);
                } else if (fileUrl.includes('.s3.') && s3Service) {
                    const parsed = new URL(fileUrl.startsWith('http') ? fileUrl : `https://${fileUrl}`);
                    const key = parsed.pathname.replace(/^\//, '');
                    await s3Service.deleteFile(key).catch(() => null);
                }
            } catch (error) {
                logger.warn('Failed to delete signature document file', { error: error.message });
            }
        }

        await client.query('DELETE FROM signature_fields WHERE document_id = $1', [documentId]);
        await client.query('DELETE FROM signature_recipients WHERE document_id = $1 AND organization_id = $2', [documentId, organizationId]);
        await client.query('DELETE FROM signature_document_versions WHERE document_id = $1', [documentId]);
        await client.query('DELETE FROM signature_audit_log WHERE document_id = $1', [documentId]);
        await client.query('DELETE FROM signature_reminders WHERE document_id = $1', [documentId]);

        const deleted = await client.query(
            `DELETE FROM signature_documents WHERE id = $1 AND organization_id = $2 RETURNING ${signatureDocumentColumns()}`,
            [documentId, organizationId]
        );

        return deleted.rows[0] || null;
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
                RETURNING ${signatureRecipientColumns()}
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
        if (roleMap.size > 0) {
            const roleNames = [];
            const recipientIds = [];

            for (const [roleName, recipientId] of roleMap.entries()) {
                roleNames.push(roleName);
                recipientIds.push(recipientId);
            }

            await client.query(`
                UPDATE signature_fields
                SET recipient_id = update_data.recipient_id
                FROM (
                    SELECT unnest($1::text[]) AS role_name, unnest($2::int[]) AS recipient_id
                ) AS update_data
                WHERE signature_fields.document_id = $3
                  AND signature_fields.role_name = update_data.role_name
            `, [roleNames, recipientIds, documentId]);
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

        let inserted = [];
        if (fields && fields.length > 0) {
            const documentIds = [];
            const recipientIds = [];
            const roleNames = [];
            const fieldTypes = [];
            const pageNumbers = [];
            const xPositions = [];
            const yPositions = [];
            const widths = [];
            const heights = [];
            const labels = [];
            const isRequireds = [];
            const fieldValues = [];
            const fontSizes = [];
            const fontFamilies = [];
            const textAligns = [];
            const lockeds = [];

            for (const field of fields) {
                documentIds.push(documentId);
                recipientIds.push(field.recipient_id || null);
                roleNames.push(field.role_name || null);
                fieldTypes.push(field.field_type);
                pageNumbers.push(field.page_number || 1);
                xPositions.push(field.x_position);
                yPositions.push(field.y_position);
                widths.push(field.width);
                heights.push(field.height);
                labels.push(field.label || null);
                isRequireds.push(field.is_required !== undefined ? field.is_required : true);
                fieldValues.push(field.value || null);
                fontSizes.push(field.font_size || null);
                fontFamilies.push(field.font_family || null);
                textAligns.push(field.text_align || null);
                lockeds.push(field.locked || false);
            }

            const result = await client.query(`
                INSERT INTO signature_fields (
                    document_id, recipient_id, role_name, field_type, page_number,
                    x_position, y_position, width, height, label,
                    is_required, value, font_size, font_family, text_align, locked
                )
                SELECT
                    u.document_id, u.recipient_id, u.role_name, u.field_type, u.page_number,
                    u.x_position, u.y_position, u.width, u.height, u.label,
                    u.is_required, u.value, u.font_size, u.font_family, u.text_align, u.locked
                FROM UNNEST (
                    $1::int[], $2::int[], $3::text[], $4::text[], $5::int[],
                    $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::text[],
                    $11::boolean[], $12::text[], $13::int[], $14::text[], $15::text[], $16::boolean[]
                ) AS u(
                    document_id, recipient_id, role_name, field_type, page_number,
                    x_position, y_position, width, height, label,
                    is_required, value, font_size, font_family, text_align, locked
                )
                RETURNING ${signatureFieldColumns()}
            `, [
                documentIds, recipientIds, roleNames, fieldTypes, pageNumbers,
                xPositions, yPositions, widths, heights, labels,
                isRequireds, fieldValues, fontSizes, fontFamilies, textAligns, lockeds
            ]);
            inserted = result.rows;
        }

        return inserted;
    });
}

async function listDocuments(pool, organizationId, filters = {}, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const values = [organizationId];
    const conditions = ['d.organization_id = $1'];
    let index = 2;

    if (filters.status) {
        conditions.push(`d.status = $${index}`);
        values.push(filters.status);
        index += 1;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await withDbClient(pool, async (client) => {
        const result = await client.query(
            `SELECT COUNT(*) FROM signature_documents d ${whereClause}`,
            values
        );
        return parseInt(result.rows[0].count, 10);
    });

    const items = await withDbClient(pool, async (client) => {
        const result = await client.query(
            `SELECT ${signatureDocumentColumns('d')}, COALESCE(r.recipient_count, 0) AS recipient_count
             FROM signature_documents d
             LEFT JOIN (
                 SELECT document_id, COUNT(*)::int AS recipient_count
                 FROM signature_recipients
                 GROUP BY document_id
             ) r ON r.document_id = d.id
             ${whereClause}
             ORDER BY d.created_at DESC
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
            `SELECT ${signatureDocumentColumns()} FROM signature_documents WHERE id = $1 AND organization_id = $2`,
            [documentId, organizationId]
        );
        if (docResult.rows.length === 0) return null;

        const recipientsResult = await client.query(
            `SELECT ${signatureRecipientColumns()} FROM signature_recipients WHERE document_id = $1 ORDER BY signing_order ASC`,
            [documentId]
        );
        const fieldsResult = await client.query(
            `SELECT ${signatureFieldColumns()} FROM signature_fields WHERE document_id = $1 ORDER BY id ASC`,
            [documentId]
        );
        const auditResult = await client.query(
            `SELECT ${signatureAuditLogColumns()} FROM signature_audit_log WHERE document_id = $1 ORDER BY created_at ASC`,
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

module.exports = {
    createDocument,
    updateDocument,
    uploadDocument,
    removeDocumentFile,
    deleteDocumentFile,
    deleteDocument,
    replaceRecipients,
    replaceFields,
    listDocuments,
    getDocumentDetails
};
