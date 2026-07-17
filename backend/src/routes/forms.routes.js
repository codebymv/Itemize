/**
 * Forms Routes
 * CRUD operations for forms and form fields
 * Updated with feature gating (Subscription Phase 6)
 */

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { withDbClient, withTransaction } = require('../utils/db');
const UsageTrackingService = require('../services/usageTrackingService');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError } = require('../utils/response');
const { 
    FORM_LIMITS, 
    ERROR_CODES
} = require('../lib/subscription.constants');
const { formColumns, formFieldColumns, formSubmissionColumns, FORM_FIELD_UNNEST_COLUMNS } = require('./forms.columns');
const { WORKFLOW_TRIGGERS } = require('../domain/workflowRegistry');
const {
    enqueueWorkflowTrigger,
    workflowTriggerEventKey,
} = require('../services/workflowTriggerQueue');
const { normalizeContactEmail } = require('../utils/contactEmail');
const {
    PublicFormValidationError,
    normalizeNotificationEmails,
    normalizePublicRedirectUrl,
    validateFormDefinition,
    validatePublicFormSubmission,
} = require('../utils/publicFormContract');
const {
    enqueueFormSubmissionNotifications,
} = require('../services/formSubmissionNotifications');

/**
 * Create forms routes
 */
module.exports = (pool, authenticateJWT, publicRateLimit) => {
    const { requireOrganization } = require('../middleware/organization')(pool);
    const publicSubmissionRateLimit = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            error: {
                message: 'Too many form submissions from this IP',
                code: 'RATE_LIMIT_EXCEEDED',
            },
        },
    });
    
    // Usage tracking service
    const usageService = new UsageTrackingService(pool);

    /**
     * Helper: Check form limit for organization
     */
    async function checkFormLimit(client, organizationId) {
        const orgResult = await client.query(
            'SELECT plan, forms_limit FROM organizations WHERE id = $1',
            [organizationId]
        );
        const org = orgResult.rows[0];
        const plan = org?.plan || 'starter';
        const limit = org?.forms_limit ?? FORM_LIMITS[plan] ?? 10;
        
        const countResult = await client.query(
            'SELECT COUNT(*) FROM forms WHERE organization_id = $1',
            [organizationId]
        );
        const current = parseInt(countResult.rows[0].count);
        
        // -1 or Infinity means unlimited
        const allowed = limit === -1 || limit === Infinity || current < limit;
        
        return { allowed, limit, current, plan };
    }

    const generateSlug = (name) => {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            + '-' + crypto.randomBytes(4).toString('hex');
    };

    const sendContractError = (res, error) => {
        if (!(error instanceof PublicFormValidationError)) return false;
        sendError(
            res,
            error.message,
            400,
            error.code,
            error.fieldId === null ? null : { field_id: String(error.fieldId) }
        );
        return true;
    };

    const findPublishedForm = async (client, identifier, columns) => {
        const byPublicId = await client.query(`
            SELECT ${columns}
            FROM forms f
            JOIN organizations o ON f.organization_id = o.id
            WHERE f.public_id = $1
              AND f.status = 'published'
        `, [identifier]);
        if (byPublicId.rows.length === 1) return byPublicId.rows[0];

        const byLegacySlug = await client.query(`
            SELECT ${columns}
            FROM forms f
            JOIN organizations o ON f.organization_id = o.id
            WHERE f.slug = $1
              AND f.status = 'published'
            ORDER BY f.id
            LIMIT 2
        `, [identifier]);
        return byLegacySlug.rows.length === 1 ? byLegacySlug.rows[0] : null;
    };

    const remapInsertedFieldConditions = async (
        client,
        formId,
        sourceFields,
        insertedFields
    ) => {
        const orderedInsertedFields = [...insertedFields].sort(
            (left, right) => Number(left.field_order) - Number(right.field_order)
                || Number(left.id) - Number(right.id)
        );
        if (orderedInsertedFields.length !== sourceFields.length) {
            throw new PublicFormValidationError(
                'Unable to preserve form field conditions',
                null,
                'INVALID_FORM_CONFIGURATION'
            );
        }
        const sourceIdToInsertedId = new Map();
        sourceFields.forEach((field, index) => {
            if (field.id === undefined || field.id === null) return;
            sourceIdToInsertedId.set(String(field.id), Number(orderedInsertedFields[index].id));
        });

        const fieldIds = [];
        const remappedConditions = [];
        sourceFields.forEach((field, index) => {
            const insertedId = Number(orderedInsertedFields[index].id);
            const conditions = (field.conditions || []).map(condition => {
                const sourceId = String(condition.field_id ?? condition.fieldId ?? '');
                const mappedId = sourceIdToInsertedId.get(sourceId);
                if (!mappedId) {
                    throw new PublicFormValidationError(
                        `${field.label} has an invalid condition`,
                        field.id,
                        'INVALID_FORM_CONFIGURATION'
                    );
                }
                const { fieldId: _fieldId, ...rest } = condition;
                return { ...rest, field_id: mappedId };
            });
            fieldIds.push(insertedId);
            remappedConditions.push(JSON.stringify(conditions));
        });

        await client.query(`
            UPDATE form_fields AS field
            SET conditions = source.conditions
            FROM UNNEST($1::int[], $2::jsonb[]) AS source(id, conditions)
            WHERE field.id = source.id
              AND field.form_id = $3
        `, [fieldIds, remappedConditions, formId]);
    };

    // ======================
    // Forms CRUD
    // ======================

    /**
     * GET /api/forms - List forms
     */
    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { status } = req.query;
            const result = await withDbClient(pool, async (client) => {
                let query = `
        SELECT ${formColumns('f')},
               (SELECT COUNT(*) FROM form_submissions WHERE form_id = f.id) as submission_count,
               (SELECT COUNT(*) FROM form_fields WHERE form_id = f.id) as field_count
        FROM forms f
        WHERE f.organization_id = $1
      `;
                const params = [req.organizationId];

                if (status && status !== 'all') {
                    query += ` AND f.status = $2`;
                    params.push(status);
                }

                query += ` ORDER BY f.created_at DESC`;

                return client.query(query, params);
            });

            sendSuccess(res, { forms: result.rows });
        } catch (error) {
            console.error('Error fetching forms:', error);
            sendError(res, 'Failed to fetch forms');
        }
    });

    /**
     * GET /api/forms/:id - Get form with fields
     */
    router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const formResult = await client.query(
                    `SELECT ${formColumns()} FROM forms WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                );

                if (formResult.rows.length === 0) {
                    return null;
                }

                const fieldsResult = await client.query(
                    `SELECT ${formFieldColumns()} FROM form_fields WHERE form_id = $1 ORDER BY field_order`,
                    [id]
                );

                const form = formResult.rows[0];
                form.fields = fieldsResult.rows;
                return form;
            });

            if (!result) {
                return sendNotFound(res, 'Form');
            }

            sendSuccess(res, result);
        } catch (error) {
            console.error('Error fetching form:', error);
            sendError(res, 'Failed to fetch form');
        }
    });

    /**
     * POST /api/forms - Create form
     * Usage limited: forms count
     */
    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                name,
                description,
                type,
                submit_button_text,
                success_message,
                redirect_url,
                notify_on_submit,
                notification_emails,
                theme,
                create_contact,
                contact_tags,
                fields
            } = req.body;

            if (!name || name.trim().length === 0) {
                return sendBadRequest(res, 'Form name is required');
            }

            const safeRedirectUrl = normalizePublicRedirectUrl(redirect_url);
            const normalizedNotificationEmails = normalizeNotificationEmails(notification_emails);
            if (fields !== undefined && !Array.isArray(fields)) {
                throw new PublicFormValidationError('fields must be an array');
            }
            if (Array.isArray(fields) && fields.length > 0) {
                if (fields.some(field => Array.isArray(field.conditions) && field.conditions.length > 0)) {
                    throw new PublicFormValidationError(
                        'Create the form before configuring conditions',
                        null,
                        'INVALID_FORM_CONFIGURATION'
                    );
                }
                validateFormDefinition(fields);
            }

            const slug = generateSlug(name);
            const outcome = await withTransaction(pool, async (client) => {
                await client.query('SELECT pg_advisory_xact_lock($1)', [req.organizationId]);
                const limitCheck = await checkFormLimit(client, req.organizationId);
                if (!limitCheck.allowed) {
                    return { status: 'limit', limitCheck };
                }

                const formResult = await client.query(`
          INSERT INTO forms (
            organization_id, name, description, slug, type,
            submit_button_text, success_message, redirect_url,
            notify_on_submit, notification_emails, theme,
            create_contact, contact_tags, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING ${formColumns()}
        `, [
                    req.organizationId,
                    name.trim(),
                    description || null,
                    slug,
                    type || 'form',
                    submit_button_text || 'Submit',
                    success_message || 'Thank you for your submission!',
                    safeRedirectUrl,
                    notify_on_submit !== false,
                    normalizedNotificationEmails,
                    JSON.stringify(theme || { primaryColor: '#3B82F6' }),
                    create_contact !== false,
                    contact_tags || [],
                    req.user.id
                ]);

                const createdForm = formResult.rows[0];

                // Add default fields if none provided
                if (fields && Array.isArray(fields) && fields.length > 0) {
                    const u_form_ids = [];
                    const u_field_types = [];
                    const u_labels = [];
                    const u_placeholders = [];
                    const u_help_texts = [];
                    const u_is_requireds = [];
                    const u_validations = [];
                    const u_options = [];
                    const u_field_orders = [];
                    const u_widths = [];
                    const u_conditions = [];
                    const u_map_to_contact_fields = [];

                    for (let i = 0; i < fields.length; i++) {
                        const field = fields[i];
                        u_form_ids.push(createdForm.id);
                        u_field_types.push(field.field_type);
                        u_labels.push(field.label);
                        u_placeholders.push(field.placeholder || null);
                        u_help_texts.push(field.help_text || null);
                        u_is_requireds.push(field.is_required || false);
                        u_validations.push(JSON.stringify(field.validation || {}));
                        u_options.push(JSON.stringify(field.options || []));
                        u_field_orders.push(i);
                        u_widths.push(field.width || 'full');
                        u_conditions.push(JSON.stringify([]));
                        u_map_to_contact_fields.push(field.map_to_contact_field || null);
                    }

                    await client.query(`
                        INSERT INTO form_fields (
                            form_id, field_type, label, placeholder, help_text,
                            is_required, validation, options, field_order, width,
                            conditions, map_to_contact_field
                        ) SELECT ${FORM_FIELD_UNNEST_COLUMNS} FROM UNNEST (
                            $1::int[], $2::text[], $3::text[], $4::text[], $5::text[],
                            $6::boolean[], $7::jsonb[], $8::jsonb[], $9::int[], $10::text[],
                            $11::jsonb[], $12::text[]
                        ) AS fields(
                            form_id,
                            field_type,
                            label,
                            placeholder,
                            help_text,
                            is_required,
                            validation,
                            options,
                            field_order,
                            width,
                            conditions,
                            map_to_contact_field
                        )
                    `, [
                        u_form_ids, u_field_types, u_labels, u_placeholders, u_help_texts,
                        u_is_requireds, u_validations, u_options, u_field_orders, u_widths,
                        u_conditions, u_map_to_contact_fields
                    ]);
                } else {
                    // Default name and email fields
                    await client.query(`
            INSERT INTO form_fields (form_id, field_type, label, is_required, field_order, map_to_contact_field)
            VALUES ($1, 'text', 'Name', true, 0, 'first_name')
          `, [createdForm.id]);
                    await client.query(`
            INSERT INTO form_fields (form_id, field_type, label, is_required, field_order, map_to_contact_field)
            VALUES ($1, 'email', 'Email', true, 1, 'email')
          `, [createdForm.id]);
                }

                // Fetch fields
                const fieldsResult = await client.query(
                    `SELECT ${formFieldColumns()} FROM form_fields WHERE form_id = $1 ORDER BY field_order`,
                    [createdForm.id]
                );
                createdForm.fields = fieldsResult.rows;

                return { status: 'ok', form: createdForm };
            });

            if (outcome.status === 'limit') {
                const { limitCheck } = outcome;
                return sendError(
                    res,
                    `You've reached your form limit (${limitCheck.current}/${limitCheck.limit}). Please upgrade your plan.`,
                    403,
                    ERROR_CODES.PLAN_LIMIT_REACHED,
                    {
                        resourceType: 'forms',
                        current: limitCheck.current,
                        limit: limitCheck.limit,
                        plan: limitCheck.plan
                    }
                );
            }

            // Track usage
            await usageService.incrementUsage(req.organizationId, 'forms').catch(error => {
                console.error('Failed to record deprecated form usage counter:', error.message);
            });

            sendCreated(res, outcome.form);
        } catch (error) {
            if (sendContractError(res, error)) return;
            console.error('Error creating form:', error);
            sendError(res, 'Failed to create form');
        }
    });

    /**
     * PUT /api/forms/:id - Update form
     */
    router.put('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const {
                name,
                description,
                type,
                status,
                submit_button_text,
                success_message,
                redirect_url,
                notify_on_submit,
                notification_emails,
                theme,
                create_contact,
                contact_tags
            } = req.body;

            const safeRedirectUrl = normalizePublicRedirectUrl(redirect_url);
            const normalizedNotificationEmails = notification_emails === undefined
                ? undefined
                : normalizeNotificationEmails(notification_emails);

            const result = await withDbClient(pool, async (client) => {
                if (status === 'published') {
                    const formCheck = await client.query(
                        'SELECT id FROM forms WHERE id = $1 AND organization_id = $2',
                        [id, req.organizationId]
                    );
                    const fieldsResult = await client.query(`
                        SELECT ${formFieldColumns('field')}
                        FROM forms form
                        JOIN form_fields field ON field.form_id = form.id
                        WHERE form.id = $1
                          AND form.organization_id = $2
                        ORDER BY field.field_order, field.id
                    `, [id, req.organizationId]);
                    if (formCheck.rows.length > 0) {
                        validateFormDefinition(fieldsResult.rows);
                    }
                }
                return client.query(`
        UPDATE forms SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          type = COALESCE($3, type),
          status = COALESCE($4, status),
          submit_button_text = COALESCE($5, submit_button_text),
          success_message = COALESCE($6, success_message),
          redirect_url = $7,
          notify_on_submit = COALESCE($8, notify_on_submit),
          notification_emails = COALESCE($9, notification_emails),
          theme = COALESCE($10, theme),
          create_contact = COALESCE($11, create_contact),
          contact_tags = COALESCE($12, contact_tags),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $13 AND organization_id = $14
        RETURNING ${formColumns()}
      `, [
                name?.trim(),
                description,
                type,
                status,
                submit_button_text,
                success_message,
                safeRedirectUrl,
                notify_on_submit,
                normalizedNotificationEmails,
                theme ? JSON.stringify(theme) : null,
                create_contact,
                contact_tags,
                id,
                req.organizationId
            ]);
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Form');
            }

            sendSuccess(res, result.rows[0]);
        } catch (error) {
            if (sendContractError(res, error)) return;
            console.error('Error updating form:', error);
            sendError(res, 'Failed to update form');
        }
    });

    /**
     * PUT /api/forms/:id/fields - Update all form fields
     */
    router.put('/:id/fields', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { fields } = req.body;

            if (!Array.isArray(fields)) {
                return sendBadRequest(res, 'fields must be an array');
            }
            if (fields.length > 0) {
                validateFormDefinition(fields);
            }

            const result = await withTransaction(pool, async (client) => {
                // Verify form exists
                const formCheck = await client.query(
                    'SELECT id, status FROM forms WHERE id = $1 AND organization_id = $2 FOR UPDATE',
                    [id, req.organizationId]
                );

                if (formCheck.rows.length === 0) {
                    return { status: 'not_found' };
                }
                if (formCheck.rows[0].status === 'published') {
                    validateFormDefinition(fields);
                }

                // Delete existing fields
                await client.query('DELETE FROM form_fields WHERE form_id = $1', [id]);

                // Insert new fields
                if (fields && fields.length > 0) {
                    const u_form_ids = [];
                    const u_field_types = [];
                    const u_labels = [];
                    const u_placeholders = [];
                    const u_help_texts = [];
                    const u_is_requireds = [];
                    const u_validations = [];
                    const u_options = [];
                    const u_field_orders = [];
                    const u_widths = [];
                    const u_conditions = [];
                    const u_map_to_contact_fields = [];

                    for (let i = 0; i < fields.length; i++) {
                        const field = fields[i];
                        u_form_ids.push(id);
                        u_field_types.push(field.field_type);
                        u_labels.push(field.label);
                        u_placeholders.push(field.placeholder || null);
                        u_help_texts.push(field.help_text || null);
                        u_is_requireds.push(field.is_required || false);
                        u_validations.push(JSON.stringify(field.validation || {}));
                        u_options.push(JSON.stringify(field.options || []));
                        u_field_orders.push(i);
                        u_widths.push(field.width || 'full');
                        u_conditions.push(JSON.stringify([]));
                        u_map_to_contact_fields.push(field.map_to_contact_field || null);
                    }

                    const insertedFields = await client.query(`
                        INSERT INTO form_fields (
                            form_id, field_type, label, placeholder, help_text,
                            is_required, validation, options, field_order, width,
                            conditions, map_to_contact_field
                        ) SELECT ${FORM_FIELD_UNNEST_COLUMNS} FROM UNNEST (
                            $1::int[], $2::text[], $3::text[], $4::text[], $5::text[],
                            $6::boolean[], $7::jsonb[], $8::jsonb[], $9::int[], $10::text[],
                            $11::jsonb[], $12::text[]
                        ) AS fields(
                            form_id,
                            field_type,
                            label,
                            placeholder,
                            help_text,
                            is_required,
                            validation,
                            options,
                            field_order,
                            width,
                            conditions,
                            map_to_contact_field
                        )
                        RETURNING id, field_order
                    `, [
                        u_form_ids, u_field_types, u_labels, u_placeholders, u_help_texts,
                        u_is_requireds, u_validations, u_options, u_field_orders, u_widths,
                        u_conditions, u_map_to_contact_fields
                    ]);
                    await remapInsertedFieldConditions(
                        client,
                        Number(id),
                        fields,
                        insertedFields.rows
                    );
                }

                // Fetch updated fields
                const fieldsResult = await client.query(
                    `SELECT ${formFieldColumns()} FROM form_fields WHERE form_id = $1 ORDER BY field_order`,
                    [id]
                );

                return { status: 'ok', fields: fieldsResult.rows };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Form');
            }

            sendSuccess(res, { fields: result.fields });
        } catch (error) {
            if (sendContractError(res, error)) return;
            console.error('Error updating form fields:', error);
            sendError(res, 'Failed to update form fields');
        }
    });

    /**
     * DELETE /api/forms/:id - Delete form
     */
    router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    'DELETE FROM forms WHERE id = $1 AND organization_id = $2 RETURNING id',
                    [id, req.organizationId]
                );
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Form');
            }

            sendSuccess(res, { message: 'Form deleted successfully' });
        } catch (error) {
            console.error('Error deleting form:', error);
            sendError(res, 'Failed to delete form');
        }
    });

    /**
     * POST /api/forms/:id/duplicate - Duplicate form
     */
    router.post('/:id/duplicate', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await withTransaction(pool, async (client) => {
                // Get original form
                const formResult = await client.query(
                    `SELECT ${formColumns()} FROM forms WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                );

                if (formResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const original = formResult.rows[0];
                const newSlug = generateSlug(original.name + ' Copy');

                // Create new form
                const newFormResult = await client.query(`
          INSERT INTO forms (
            organization_id, name, description, slug, type, status,
            submit_button_text, success_message, redirect_url,
            notify_on_submit, notification_emails, theme,
            create_contact, contact_tags, created_by
          ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING ${formColumns()}
        `, [
                    req.organizationId,
                    original.name + ' (Copy)',
                    original.description,
                    newSlug,
                    original.type,
                    original.submit_button_text,
                    original.success_message,
                    original.redirect_url,
                    original.notify_on_submit,
                    original.notification_emails,
                    JSON.stringify(original.theme),
                    original.create_contact,
                    original.contact_tags,
                    req.user.id
                ]);

                const newForm = newFormResult.rows[0];

                // Copy fields
                const fieldsResult = await client.query(
                    `SELECT ${formFieldColumns()} FROM form_fields WHERE form_id = $1 ORDER BY field_order`,
                    [id]
                );

                if (fieldsResult.rows && fieldsResult.rows.length > 0) {
                    const u_form_ids = [];
                    const u_field_types = [];
                    const u_labels = [];
                    const u_placeholders = [];
                    const u_help_texts = [];
                    const u_is_requireds = [];
                    const u_validations = [];
                    const u_options = [];
                    const u_field_orders = [];
                    const u_widths = [];
                    const u_conditions = [];
                    const u_map_to_contact_fields = [];

                    for (let index = 0; index < fieldsResult.rows.length; index += 1) {
                        const field = fieldsResult.rows[index];
                        u_form_ids.push(newForm.id);
                        u_field_types.push(field.field_type);
                        u_labels.push(field.label);
                        u_placeholders.push(field.placeholder);
                        u_help_texts.push(field.help_text);
                        u_is_requireds.push(field.is_required);
                        u_validations.push(JSON.stringify(field.validation));
                        u_options.push(JSON.stringify(field.options));
                        u_field_orders.push(index);
                        u_widths.push(field.width);
                        u_conditions.push(JSON.stringify([]));
                        u_map_to_contact_fields.push(field.map_to_contact_field);
                    }

                    const insertedFields = await client.query(`
                        INSERT INTO form_fields (
                            form_id, field_type, label, placeholder, help_text,
                            is_required, validation, options, field_order, width,
                            conditions, map_to_contact_field
                        ) SELECT ${FORM_FIELD_UNNEST_COLUMNS} FROM UNNEST (
                            $1::int[], $2::text[], $3::text[], $4::text[], $5::text[],
                            $6::boolean[], $7::jsonb[], $8::jsonb[], $9::int[], $10::text[],
                            $11::jsonb[], $12::text[]
                        ) AS fields(
                            form_id,
                            field_type,
                            label,
                            placeholder,
                            help_text,
                            is_required,
                            validation,
                            options,
                            field_order,
                            width,
                            conditions,
                            map_to_contact_field
                        )
                        RETURNING id, field_order
                    `, [
                        u_form_ids, u_field_types, u_labels, u_placeholders, u_help_texts,
                        u_is_requireds, u_validations, u_options, u_field_orders, u_widths,
                        u_conditions, u_map_to_contact_fields
                    ]);
                    await remapInsertedFieldConditions(
                        client,
                        newForm.id,
                        fieldsResult.rows,
                        insertedFields.rows
                    );
                }

                // Fetch new fields
                const newFieldsResult = await client.query(
                    `SELECT ${formFieldColumns()} FROM form_fields WHERE form_id = $1 ORDER BY field_order`,
                    [newForm.id]
                );
                newForm.fields = newFieldsResult.rows;

                return { status: 'ok', form: newForm };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Form');
            }

            sendCreated(res, result.form);
        } catch (error) {
            console.error('Error duplicating form:', error);
            sendError(res, 'Failed to duplicate form');
        }
    });

    // ======================
    // Submissions
    // ======================

    /**
     * GET /api/forms/:id/submissions - List submissions
     */
    router.get('/:id/submissions', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { page = 1, limit = 50 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            const result = await withDbClient(pool, async (client) => {
                // Verify form access
                const formCheck = await client.query(
                    'SELECT id FROM forms WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (formCheck.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const countResult = await client.query(
                    'SELECT COUNT(*) FROM form_submissions WHERE form_id = $1',
                    [id]
                );

                const submissionsResult = await client.query(`
        SELECT ${formSubmissionColumns('fs')},
               c.first_name as contact_first_name,
               c.last_name as contact_last_name,
               c.email as contact_email
        FROM form_submissions fs
        LEFT JOIN contacts c ON fs.contact_id = c.id
        WHERE fs.form_id = $1
        ORDER BY fs.created_at DESC
        LIMIT $2 OFFSET $3
      `, [id, parseInt(limit), offset]);

                return {
                    status: 'ok',
                    submissions: submissionsResult.rows,
                    total: parseInt(countResult.rows[0].count)
                };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Form');
            }

            sendSuccess(res, {
                submissions: result.submissions,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: result.total,
                    totalPages: Math.ceil(result.total / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching submissions:', error);
            sendError(res, 'Failed to fetch submissions');
        }
    });

    /**
     * DELETE /api/forms/:id/submissions/:subId - Delete submission
     */
    router.delete('/:id/submissions/:subId', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id, subId } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(`
        DELETE FROM form_submissions 
        WHERE id = $1 AND form_id = $2 AND organization_id = $3
        RETURNING id
      `, [subId, id, req.organizationId]);
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Submission');
            }

            sendSuccess(res, { message: 'Submission deleted' });
        } catch (error) {
            console.error('Error deleting submission:', error);
            sendError(res, 'Failed to delete submission');
        }
    });

    // ======================
    // Public Form Endpoints
    // ======================

    /**
     * GET /api/public/form/:identifier - Get public form
     */
    router.get('/public/form/:identifier', publicRateLimit, async (req, res) => {
        try {
            const { identifier } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const form = await findPublishedForm(
                    client,
                    identifier,
                    `f.id, f.name, f.description, f.slug, f.public_id, f.type,
                     f.submit_button_text, f.success_message, f.redirect_url, f.theme,
                     o.name as organization_name`
                );
                if (!form) {
                    return { status: 'not_found' };
                }

                const fieldsResult = await client.query(`
        SELECT id, field_type, label, placeholder, help_text,
               is_required, validation, options, field_order, width, conditions
        FROM form_fields
        WHERE form_id = $1
        ORDER BY field_order, id
      `, [form.id]);

                validateFormDefinition(fieldsResult.rows);
                form.fields = fieldsResult.rows;
                return { status: 'ok', form };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Form');
            }

            res.set('Cache-Control', 'no-store');
            res.set('X-Robots-Tag', 'noindex, nofollow');
            sendSuccess(res, result.form);
        } catch (error) {
            if (sendContractError(res, error)) return;
            console.error('Error fetching public form:', error);
            sendError(res, 'Failed to load form');
        }
    });

    /**
     * POST /api/public/form/:identifier - Submit form
     */
    router.post(
        '/public/form/:identifier',
        publicRateLimit,
        publicSubmissionRateLimit,
        async (req, res) => {
        try {
            const { identifier } = req.params;
            const { data } = req.body;

            const outcome = await withTransaction(pool, async (client) => {
                // Get form
                const form = await findPublishedForm(
                    client,
                    identifier,
                    `${formColumns('f')}, o.id as org_id`
                );
                if (!form) {
                    return { status: 'not_found' };
                }

                // Get fields for validation and contact mapping
                const fieldsResult = await client.query(
                    `SELECT ${formFieldColumns()} FROM form_fields WHERE form_id = $1 ORDER BY field_order, id`,
                    [form.id]
                );
                const fields = fieldsResult.rows;
                const normalizedData = validatePublicFormSubmission(fields, data);

                let contactId = null;

                // Create/update contact if enabled
                if (form.create_contact) {
                    const contactData = { organization_id: form.organization_id };

                    for (const field of fields) {
                        const value = normalizedData[String(field.id)];
                        if (field.map_to_contact_field && value !== undefined) {
                            contactData[field.map_to_contact_field] = value;
                        }
                    }

                    // Check for an existing deterministic contact by canonical email.
                    contactData.email = normalizeContactEmail(contactData.email);
                    if (contactData.email) {
                        await client.query(
                            "SELECT pg_advisory_xact_lock(hashtext('contact-email'), hashtext($1::text || ':' || $2))",
                            [form.organization_id, contactData.email]
                        );
                        const existingContact = await client.query(
                            `SELECT id
                             FROM contacts
                             WHERE organization_id = $1 AND email = $2
                             ORDER BY id
                             LIMIT 1`,
                            [form.organization_id, contactData.email]
                        );

                        if (existingContact.rows.length > 0) {
                            contactId = existingContact.rows[0].id;
                        } else {
                            const newContact = await client.query(`
              INSERT INTO contacts (organization_id, first_name, last_name, email, phone, company, source, tags)
              VALUES ($1, $2, $3, $4, $5, $6, 'form', $7)
              RETURNING id
            `, [
                                form.organization_id,
                                contactData.first_name || null,
                                contactData.last_name || null,
                                contactData.email,
                                contactData.phone || null,
                                contactData.company || null,
                                form.contact_tags || []
                            ]);
                            contactId = newContact.rows[0].id;
                        }
                    }
                }

                // Create submission
                const submissionResult = await client.query(`
        INSERT INTO form_submissions (form_id, organization_id, contact_id, data, ip_address, user_agent, referrer)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING ${formSubmissionColumns()}
      `, [
                    form.id,
                    form.organization_id,
                    contactId,
                    JSON.stringify(normalizedData),
                    String(req.ip || '').slice(0, 50) || null,
                    String(req.get('user-agent') || '').slice(0, 2000) || null,
                    String(req.get('referrer') || '').slice(0, 500) || null
                ]);

                const submission = submissionResult.rows[0];
                await enqueueWorkflowTrigger(client, {
                    contactId,
                    entityId: submission.id,
                    entityType: 'form_submission',
                    eventKey: workflowTriggerEventKey('domain', `form_submitted:${submission.id}`),
                    organizationId: form.organization_id,
                    payload: {
                        form_id: form.id,
                        form_name: form.name,
                        form_slug: form.slug,
                        submission_id: submission.id,
                    },
                    triggerType: WORKFLOW_TRIGGERS.FORM_SUBMITTED,
                });
                await enqueueFormSubmissionNotifications(client, {
                    form,
                    submission,
                });

                return { status: 'ok', form, submission, contactId };
            });

            if (outcome.status === 'not_found') {
                return sendNotFound(res, 'Form');
            }

            res.set('Cache-Control', 'no-store');
            sendCreated(res, {
                success: true,
                message: outcome.form.success_message,
                redirect_url: outcome.form.redirect_url
            });
        } catch (error) {
            if (sendContractError(res, error)) return;
            console.error('Error submitting form:', error);
            sendError(res, 'Failed to submit form');
        }
    });

    return router;
};
