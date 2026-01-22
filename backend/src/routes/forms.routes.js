/**
 * Forms Routes
 * CRUD operations for forms and form fields
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Import automation engine for triggers
let automationEngine = null;
try {
    const { getAutomationEngine } = require('../services/automationEngine');
    automationEngine = { getEngine: getAutomationEngine };
} catch (e) {
    console.log('Automation engine not available for forms:', e.message);
}

/**
 * Create forms routes
 */
module.exports = (pool, authenticateJWT, publicRateLimit) => {

    /**
     * Middleware to require organization context
     */
    const requireOrganization = async (req, res, next) => {
        try {
            const organizationId = req.query.organization_id || req.body.organization_id || req.headers['x-organization-id'];

            if (!organizationId) {
                const client = await pool.connect();
                const result = await client.query(
                    'SELECT default_organization_id FROM users WHERE id = $1',
                    [req.user.id]
                );
                client.release();

                if (result.rows.length === 0 || !result.rows[0].default_organization_id) {
                    return res.status(400).json({ error: 'Organization ID required.' });
                }
                req.organizationId = result.rows[0].default_organization_id;
            } else {
                req.organizationId = parseInt(organizationId);
            }

            const client = await pool.connect();
            const memberCheck = await client.query(
                'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
                [req.organizationId, req.user.id]
            );
            client.release();

            if (memberCheck.rows.length === 0) {
                return res.status(403).json({ error: 'Not a member of this organization' });
            }

            req.orgRole = memberCheck.rows[0].role;
            next();
        } catch (error) {
            console.error('Error in requireOrganization:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };

    const generateSlug = (name) => {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            + '-' + crypto.randomBytes(4).toString('hex');
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
            const client = await pool.connect();

            let query = `
        SELECT f.*,
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

            const result = await client.query(query, params);
            client.release();

            res.json({ forms: result.rows });
        } catch (error) {
            console.error('Error fetching forms:', error);
            res.status(500).json({ error: 'Failed to fetch forms' });
        }
    });

    /**
     * GET /api/forms/:id - Get form with fields
     */
    router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const formResult = await client.query(
                'SELECT * FROM forms WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (formResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Form not found' });
            }

            const fieldsResult = await client.query(
                'SELECT * FROM form_fields WHERE form_id = $1 ORDER BY field_order',
                [id]
            );

            client.release();

            const form = formResult.rows[0];
            form.fields = fieldsResult.rows;

            res.json(form);
        } catch (error) {
            console.error('Error fetching form:', error);
            res.status(500).json({ error: 'Failed to fetch form' });
        }
    });

    /**
     * POST /api/forms - Create form
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
                return res.status(400).json({ error: 'Form name is required' });
            }

            const slug = generateSlug(name);
            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                const formResult = await client.query(`
          INSERT INTO forms (
            organization_id, name, description, slug, type,
            submit_button_text, success_message, redirect_url,
            notify_on_submit, notification_emails, theme,
            create_contact, contact_tags, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *
        `, [
                    req.organizationId,
                    name.trim(),
                    description || null,
                    slug,
                    type || 'form',
                    submit_button_text || 'Submit',
                    success_message || 'Thank you for your submission!',
                    redirect_url || null,
                    notify_on_submit !== false,
                    notification_emails || [],
                    JSON.stringify(theme || { primaryColor: '#3B82F6' }),
                    create_contact !== false,
                    contact_tags || [],
                    req.user.id
                ]);

                const form = formResult.rows[0];

                // Add default fields if none provided
                if (fields && Array.isArray(fields) && fields.length > 0) {
                    for (let i = 0; i < fields.length; i++) {
                        const field = fields[i];
                        await client.query(`
              INSERT INTO form_fields (
                form_id, field_type, label, placeholder, help_text,
                is_required, validation, options, field_order, width,
                conditions, map_to_contact_field
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [
                            form.id,
                            field.field_type,
                            field.label,
                            field.placeholder || null,
                            field.help_text || null,
                            field.is_required || false,
                            JSON.stringify(field.validation || {}),
                            JSON.stringify(field.options || []),
                            i,
                            field.width || 'full',
                            JSON.stringify(field.conditions || []),
                            field.map_to_contact_field || null
                        ]);
                    }
                } else {
                    // Default name and email fields
                    await client.query(`
            INSERT INTO form_fields (form_id, field_type, label, is_required, field_order, map_to_contact_field)
            VALUES ($1, 'text', 'Name', true, 0, 'first_name')
          `, [form.id]);
                    await client.query(`
            INSERT INTO form_fields (form_id, field_type, label, is_required, field_order, map_to_contact_field)
            VALUES ($1, 'email', 'Email', true, 1, 'email')
          `, [form.id]);
                }

                await client.query('COMMIT');

                // Fetch fields
                const fieldsResult = await client.query(
                    'SELECT * FROM form_fields WHERE form_id = $1 ORDER BY field_order',
                    [form.id]
                );
                form.fields = fieldsResult.rows;

                client.release();
                res.status(201).json(form);
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            console.error('Error creating form:', error);
            res.status(500).json({ error: 'Failed to create form' });
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

            const client = await pool.connect();

            const result = await client.query(`
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
        RETURNING *
      `, [
                name?.trim(),
                description,
                type,
                status,
                submit_button_text,
                success_message,
                redirect_url,
                notify_on_submit,
                notification_emails,
                theme ? JSON.stringify(theme) : null,
                create_contact,
                contact_tags,
                id,
                req.organizationId
            ]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Form not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating form:', error);
            res.status(500).json({ error: 'Failed to update form' });
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
                return res.status(400).json({ error: 'fields must be an array' });
            }

            const client = await pool.connect();

            // Verify form exists
            const formCheck = await client.query(
                'SELECT id FROM forms WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (formCheck.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Form not found' });
            }

            try {
                await client.query('BEGIN');

                // Delete existing fields
                await client.query('DELETE FROM form_fields WHERE form_id = $1', [id]);

                // Insert new fields
                for (let i = 0; i < fields.length; i++) {
                    const field = fields[i];
                    await client.query(`
            INSERT INTO form_fields (
              form_id, field_type, label, placeholder, help_text,
              is_required, validation, options, field_order, width,
              conditions, map_to_contact_field
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
                        id,
                        field.field_type,
                        field.label,
                        field.placeholder || null,
                        field.help_text || null,
                        field.is_required || false,
                        JSON.stringify(field.validation || {}),
                        JSON.stringify(field.options || []),
                        i,
                        field.width || 'full',
                        JSON.stringify(field.conditions || []),
                        field.map_to_contact_field || null
                    ]);
                }

                await client.query('COMMIT');

                // Fetch updated fields
                const result = await client.query(
                    'SELECT * FROM form_fields WHERE form_id = $1 ORDER BY field_order',
                    [id]
                );

                client.release();
                res.json({ fields: result.rows });
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            console.error('Error updating form fields:', error);
            res.status(500).json({ error: 'Failed to update form fields' });
        }
    });

    /**
     * DELETE /api/forms/:id - Delete form
     */
    router.delete('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const result = await client.query(
                'DELETE FROM forms WHERE id = $1 AND organization_id = $2 RETURNING id',
                [id, req.organizationId]
            );

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Form not found' });
            }

            res.json({ message: 'Form deleted successfully' });
        } catch (error) {
            console.error('Error deleting form:', error);
            res.status(500).json({ error: 'Failed to delete form' });
        }
    });

    /**
     * POST /api/forms/:id/duplicate - Duplicate form
     */
    router.post('/:id/duplicate', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            // Get original form
            const formResult = await client.query(
                'SELECT * FROM forms WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (formResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Form not found' });
            }

            const original = formResult.rows[0];
            const newSlug = generateSlug(original.name + ' Copy');

            try {
                await client.query('BEGIN');

                // Create new form
                const newFormResult = await client.query(`
          INSERT INTO forms (
            organization_id, name, description, slug, type, status,
            submit_button_text, success_message, redirect_url,
            notify_on_submit, notification_emails, theme,
            create_contact, contact_tags, created_by
          ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *
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
                    'SELECT * FROM form_fields WHERE form_id = $1 ORDER BY field_order',
                    [id]
                );

                for (const field of fieldsResult.rows) {
                    await client.query(`
            INSERT INTO form_fields (
              form_id, field_type, label, placeholder, help_text,
              is_required, validation, options, field_order, width,
              conditions, map_to_contact_field
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
                        newForm.id,
                        field.field_type,
                        field.label,
                        field.placeholder,
                        field.help_text,
                        field.is_required,
                        JSON.stringify(field.validation),
                        JSON.stringify(field.options),
                        field.field_order,
                        field.width,
                        JSON.stringify(field.conditions),
                        field.map_to_contact_field
                    ]);
                }

                await client.query('COMMIT');

                // Fetch new fields
                const newFieldsResult = await client.query(
                    'SELECT * FROM form_fields WHERE form_id = $1 ORDER BY field_order',
                    [newForm.id]
                );
                newForm.fields = newFieldsResult.rows;

                client.release();
                res.status(201).json(newForm);
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            console.error('Error duplicating form:', error);
            res.status(500).json({ error: 'Failed to duplicate form' });
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

            const client = await pool.connect();

            // Verify form access
            const formCheck = await client.query(
                'SELECT id FROM forms WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (formCheck.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Form not found' });
            }

            const countResult = await client.query(
                'SELECT COUNT(*) FROM form_submissions WHERE form_id = $1',
                [id]
            );

            const result = await client.query(`
        SELECT fs.*,
               c.first_name as contact_first_name,
               c.last_name as contact_last_name,
               c.email as contact_email
        FROM form_submissions fs
        LEFT JOIN contacts c ON fs.contact_id = c.id
        WHERE fs.form_id = $1
        ORDER BY fs.created_at DESC
        LIMIT $2 OFFSET $3
      `, [id, parseInt(limit), offset]);

            client.release();

            res.json({
                submissions: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching submissions:', error);
            res.status(500).json({ error: 'Failed to fetch submissions' });
        }
    });

    /**
     * DELETE /api/forms/:id/submissions/:subId - Delete submission
     */
    router.delete('/:id/submissions/:subId', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id, subId } = req.params;
            const client = await pool.connect();

            const result = await client.query(`
        DELETE FROM form_submissions 
        WHERE id = $1 AND form_id = $2 AND organization_id = $3
        RETURNING id
      `, [subId, id, req.organizationId]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Submission not found' });
            }

            res.json({ message: 'Submission deleted' });
        } catch (error) {
            console.error('Error deleting submission:', error);
            res.status(500).json({ error: 'Failed to delete submission' });
        }
    });

    // ======================
    // Public Form Endpoints
    // ======================

    /**
     * GET /api/public/form/:slug - Get public form
     */
    router.get('/public/form/:slug', publicRateLimit, async (req, res) => {
        try {
            const { slug } = req.params;
            const client = await pool.connect();

            const formResult = await client.query(`
        SELECT f.id, f.name, f.description, f.slug, f.type,
               f.submit_button_text, f.success_message, f.redirect_url, f.theme,
               o.name as organization_name
        FROM forms f
        JOIN organizations o ON f.organization_id = o.id
        WHERE f.slug = $1 AND f.status = 'published'
      `, [slug]);

            if (formResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Form not found' });
            }

            const form = formResult.rows[0];

            const fieldsResult = await client.query(`
        SELECT id, field_type, label, placeholder, help_text,
               is_required, validation, options, field_order, width
        FROM form_fields
        WHERE form_id = $1
        ORDER BY field_order
      `, [form.id]);

            form.fields = fieldsResult.rows;
            client.release();

            res.json(form);
        } catch (error) {
            console.error('Error fetching public form:', error);
            res.status(500).json({ error: 'Failed to load form' });
        }
    });

    /**
     * POST /api/public/form/:slug - Submit form
     */
    router.post('/public/form/:slug', publicRateLimit, async (req, res) => {
        try {
            const { slug } = req.params;
            const { data } = req.body;

            if (!data || typeof data !== 'object') {
                return res.status(400).json({ error: 'Form data is required' });
            }

            const client = await pool.connect();

            // Get form
            const formResult = await client.query(`
        SELECT f.*, o.id as org_id
        FROM forms f
        JOIN organizations o ON f.organization_id = o.id
        WHERE f.slug = $1 AND f.status = 'published'
      `, [slug]);

            if (formResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Form not found' });
            }

            const form = formResult.rows[0];

            // Get fields for validation and contact mapping
            const fieldsResult = await client.query(
                'SELECT * FROM form_fields WHERE form_id = $1',
                [form.id]
            );
            const fields = fieldsResult.rows;

            // Validate required fields
            for (const field of fields) {
                if (field.is_required && !data[field.id]) {
                    client.release();
                    return res.status(400).json({ error: `${field.label} is required` });
                }
            }

            let contactId = null;

            // Create/update contact if enabled
            if (form.create_contact) {
                const contactData = { organization_id: form.organization_id };

                for (const field of fields) {
                    if (field.map_to_contact_field && data[field.id]) {
                        contactData[field.map_to_contact_field] = data[field.id];
                    }
                }

                // Check for existing contact by email
                if (contactData.email) {
                    const existingContact = await client.query(
                        'SELECT id FROM contacts WHERE organization_id = $1 AND email = $2',
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
        RETURNING *
      `, [
                form.id,
                form.organization_id,
                contactId,
                JSON.stringify(data),
                req.ip,
                req.get('user-agent'),
                req.get('referrer')
            ]);

            client.release();

            // Fire automation trigger
            if (automationEngine) {
                try {
                    const engine = automationEngine.getEngine();
                    engine.handleTrigger('form_submitted', {
                        form: { id: form.id, name: form.name, slug: form.slug },
                        submission: submissionResult.rows[0],
                        contact: contactId ? { id: contactId } : null,
                        organizationId: form.organization_id,
                        fields: data
                    }).catch(err => console.error('Form submission trigger error:', err));
                } catch (triggerError) {
                    console.log('Automation engine not initialized');
                }
            }

            res.status(201).json({
                success: true,
                message: form.success_message,
                redirect_url: form.redirect_url
            });
        } catch (error) {
            console.error('Error submitting form:', error);
            res.status(500).json({ error: 'Failed to submit form' });
        }
    });

    return router;
};
