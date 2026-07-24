/**
 * Public forms HTTP protocol.
 *
 * Authenticated form administration is served exclusively by FormsModule
 * through GraphQL. These two anonymous endpoints remain HTTP for embeds and
 * external clients.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { withDbClient, withTransaction } = require('../utils/db');
const {
    sendSuccess,
    sendCreated,
    sendNotFound,
    sendError,
} = require('../utils/response');
const {
    formColumns,
    formFieldColumns,
    formSubmissionColumns,
} = require('./forms.columns');
const { WORKFLOW_TRIGGERS } = require('../domain/workflowRegistry');
const {
    enqueueWorkflowTrigger,
    workflowTriggerEventKey,
} = require('../services/workflowTriggerQueue');
const { normalizeContactEmail } = require('../utils/contactEmail');
const {
    PublicFormValidationError,
    validateFormDefinition,
    validatePublicFormSubmission,
} = require('../utils/publicFormContract');
const {
    enqueueFormSubmissionNotifications,
} = require('../services/formSubmissionNotifications');

module.exports = (pool, _authenticateJWT, publicRateLimit) => {
    const router = express.Router();
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

    router.get('/public/form/:identifier', publicRateLimit, async (req, res) => {
        try {
            const result = await withDbClient(pool, async (client) => {
                const form = await findPublishedForm(
                    client,
                    req.params.identifier,
                    `f.id, f.name, f.description, f.slug, f.public_id, f.type,
                     f.submit_button_text, f.success_message, f.redirect_url, f.theme,
                     o.name as organization_name`
                );
                if (!form) return { status: 'not_found' };

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

            if (result.status === 'not_found') return sendNotFound(res, 'Form');
            res.set('Cache-Control', 'no-store');
            res.set('X-Robots-Tag', 'noindex, nofollow');
            return sendSuccess(res, result.form);
        } catch (error) {
            if (sendContractError(res, error)) return;
            console.error('Error fetching public form:', error);
            return sendError(res, 'Failed to load form');
        }
    });

    router.post(
        '/public/form/:identifier',
        publicRateLimit,
        publicSubmissionRateLimit,
        async (req, res) => {
            try {
                const outcome = await withTransaction(pool, async (client) => {
                    const form = await findPublishedForm(
                        client,
                        req.params.identifier,
                        `${formColumns('f')}, o.id as org_id`
                    );
                    if (!form) return { status: 'not_found' };

                    const fieldsResult = await client.query(
                        `SELECT ${formFieldColumns()}
                         FROM form_fields
                         WHERE form_id = $1
                         ORDER BY field_order, id`,
                        [form.id]
                    );
                    const fields = fieldsResult.rows;
                    const normalizedData = validatePublicFormSubmission(
                        fields,
                        req.body.data
                    );

                    let contactId = null;
                    if (form.create_contact) {
                        const contactData = { organization_id: form.organization_id };
                        for (const field of fields) {
                            const value = normalizedData[String(field.id)];
                            if (field.map_to_contact_field && value !== undefined) {
                                contactData[field.map_to_contact_field] = value;
                            }
                        }

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
                                    INSERT INTO contacts (
                                        organization_id, first_name, last_name,
                                        email, phone, company, source, tags
                                    )
                                    VALUES ($1, $2, $3, $4, $5, $6, 'form', $7)
                                    RETURNING id
                                `, [
                                    form.organization_id,
                                    contactData.first_name || null,
                                    contactData.last_name || null,
                                    contactData.email,
                                    contactData.phone || null,
                                    contactData.company || null,
                                    form.contact_tags || [],
                                ]);
                                contactId = newContact.rows[0].id;
                            }
                        }
                    }

                    const submissionResult = await client.query(`
                        INSERT INTO form_submissions (
                            form_id, organization_id, contact_id, data,
                            ip_address, user_agent, referrer
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        RETURNING ${formSubmissionColumns()}
                    `, [
                        form.id,
                        form.organization_id,
                        contactId,
                        JSON.stringify(normalizedData),
                        String(req.ip || '').slice(0, 50) || null,
                        String(req.get('user-agent') || '').slice(0, 2000) || null,
                        String(req.get('referrer') || '').slice(0, 500) || null,
                    ]);

                    const submission = submissionResult.rows[0];
                    await enqueueWorkflowTrigger(client, {
                        contactId,
                        entityId: submission.id,
                        entityType: 'form_submission',
                        eventKey: workflowTriggerEventKey(
                            'domain',
                            `form_submitted:${submission.id}`
                        ),
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
                    return { status: 'ok', form };
                });

                if (outcome.status === 'not_found') return sendNotFound(res, 'Form');
                res.set('Cache-Control', 'no-store');
                return sendCreated(res, {
                    success: true,
                    message: outcome.form.success_message,
                    redirect_url: outcome.form.redirect_url,
                });
            } catch (error) {
                if (sendContractError(res, error)) return;
                console.error('Error submitting form:', error);
                return sendError(res, 'Failed to submit form');
            }
        }
    );

    return router;
};
