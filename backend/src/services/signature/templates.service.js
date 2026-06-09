const { withDbClient, withTransaction } = require('../../utils/db');
const {
    s3Service,
    computeSha256FromFile,
    buildUploadKey,
    getUploadedFileUrl
} = require('./storage');

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

async function deleteTemplate(pool, organizationId, templateId) {
    return withDbClient(pool, async (client) => {
        const result = await client.query(
            'DELETE FROM signature_templates WHERE id = $1 AND organization_id = $2 RETURNING *',
            [templateId, organizationId]
        );
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
        } else {
            fileUrl = getUploadedFileUrl(file);
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

        let inserted = [];
        if (roles && roles.length > 0) {
            const templateIds = roles.map(() => templateId);
            const roleNames = roles.map(role => role.role_name);
            const signingOrders = roles.map(role => role.signing_order || 1);

            const result = await client.query(`
                INSERT INTO signature_template_roles (
                    template_id,
                    role_name,
                    signing_order
                )
                SELECT * FROM UNNEST ($1::int[], $2::varchar[], $3::int[])
                RETURNING *
            `, [templateIds, roleNames, signingOrders]);
            inserted = result.rows;
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
    createTemplate,
    updateTemplate,
    deleteTemplate,
    uploadTemplateFile,
    replaceTemplateRoles,
    replaceTemplateFields,
    listTemplates,
    getTemplate,
    instantiateTemplate
};
