const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendBadRequest, sendError } = require('../../utils/response');
const {
    assertLogoUpload, cleanupUploadedFile, fs, logger, multer,
    resolveLocalLogoPath, s3Service, upload,
} = require('./logo-upload');
const { PAYMENT_SETTINGS_COLUMNS, selectColumns } = require('./columns');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

    // ======================
    // Payment Settings
    // ======================

    /**
     * GET /api/invoices/settings - Get payment settings
     */
    router.get('/settings', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    `SELECT ${selectColumns(PAYMENT_SETTINGS_COLUMNS)} FROM payment_settings WHERE organization_id = $1`,
                    [req.organizationId]
                );
            });

            if (result.rows.length === 0) {
                return sendSuccess(res, {
                    invoice_prefix: 'INV-',
                    next_invoice_number: 1,
                    default_payment_terms: 30,
                    default_tax_rate: 10,
                    default_currency: 'USD',
                    stripe_connected: false
                });
            }

            sendSuccess(res, result.rows[0]);
        } catch (error) {
            console.error('Error fetching payment settings:', error);
            return sendError(res, 'Failed to fetch payment settings');
        }
    }));

    /**
     * PUT /api/invoices/settings - Update payment settings
     */
    router.put('/settings', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const {
                invoice_prefix,
                default_payment_terms,
                default_notes,
                default_terms,
                default_tax_rate,
                tax_id,
                business_name,
                business_address,
                business_phone,
                business_email,
                default_currency
            } = req.body;

            const result = await withDbClient(pool, async (client) => {
                return client.query(`
                    INSERT INTO payment_settings (
                        organization_id, invoice_prefix, default_payment_terms, default_notes, default_terms,
                        default_tax_rate, tax_id, business_name, business_address, business_phone,
                        business_email, default_currency
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (organization_id) DO UPDATE SET
                        invoice_prefix = COALESCE(EXCLUDED.invoice_prefix, payment_settings.invoice_prefix),
                        default_payment_terms = COALESCE(EXCLUDED.default_payment_terms, payment_settings.default_payment_terms),
                        default_notes = EXCLUDED.default_notes,
                        default_terms = EXCLUDED.default_terms,
                        default_tax_rate = COALESCE(EXCLUDED.default_tax_rate, payment_settings.default_tax_rate),
                        tax_id = EXCLUDED.tax_id,
                        business_name = EXCLUDED.business_name,
                        business_address = EXCLUDED.business_address,
                        business_phone = EXCLUDED.business_phone,
                        business_email = EXCLUDED.business_email,
                        default_currency = COALESCE(EXCLUDED.default_currency, payment_settings.default_currency),
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING ${selectColumns(PAYMENT_SETTINGS_COLUMNS)}
                `, [
                    req.organizationId,
                    invoice_prefix || 'INV-',
                    default_payment_terms || 30,
                    default_notes || null,
                    default_terms || null,
                    default_tax_rate ?? 10,
                    tax_id || null,
                    business_name || null,
                    business_address || null,
                    business_phone || null,
                    business_email || null,
                    default_currency || 'USD'
                ]);
            });

            sendSuccess(res, result.rows[0]);
        } catch (error) {
            console.error('Error updating payment settings:', error);
            return sendError(res, 'Failed to update payment settings');
        }
    }));

    /**
     * POST /api/invoices/settings/logo - Upload business logo
     */
    router.post('/settings/logo', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        if (!upload) {
            return sendError(res, 'File upload not available. Please install multer: npm install multer', 503, 'SERVICE_UNAVAILABLE');
        }

        // Use multer middleware
        upload.single('logo')(req, res, async (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return sendBadRequest(res, 'File too large. Maximum size is 2MB.');
                    }
                }
                return sendBadRequest(res, err.message);
            }

            if (!req.file) {
                return sendBadRequest(res, 'No file uploaded');
            }

            try {
                await assertLogoUpload(req.file);
                const uploadResult = await withDbClient(pool, async (client) => {
                    // Delete old logo file if exists
                    const oldSettings = await client.query(
                        'SELECT logo_url FROM payment_settings WHERE organization_id = $1',
                        [req.organizationId]
                    );

                    if (oldSettings.rows.length > 0 && oldSettings.rows[0].logo_url) {
                        const oldUrl = oldSettings.rows[0].logo_url;
                        // Delete from S3 if it's an S3 URL
                        if (s3Service && oldUrl.includes('.s3.')) {
                            try {
                                const oldKey = oldUrl.split('.amazonaws.com/')[1];
                                if (oldKey) {
                                    await s3Service.deleteFile(oldKey);
                                }
                            } catch (s3Err) {
                                logger.warn('Failed to delete old logo from S3:', s3Err);
                            }
                        }
                        // Delete local file if it exists
                        if (oldUrl.includes('/uploads/logos/')) {
                            const oldFilePath = resolveLocalLogoPath(oldUrl);
                            if (oldFilePath && fs.existsSync(oldFilePath)) {
                                fs.unlinkSync(oldFilePath);
                            }
                        }
                    }

                    // Upload to S3 or use local storage
                    let logoUrl;
                    if (s3Service && process.env.AWS_ACCESS_KEY_ID) {
                        // Upload to S3
                        const extension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[req.file.mimetype];
                        const key = `logos/logo-${req.organizationId}-settings-${Date.now()}-${Math.round(Math.random() * 1E9)}${extension}`;
                        logoUrl = await s3Service.uploadFile(req.file.buffer, key, req.file.mimetype);
                        // Delete local file after S3 upload
                        if (req.file.path && fs.existsSync(req.file.path)) {
                            fs.unlinkSync(req.file.path);
                        }
                    } else {
                        // Fallback to local storage
                        logoUrl = `/uploads/logos/${req.file.filename}`;
                    }

                    await client.query(`
                        INSERT INTO payment_settings (organization_id, logo_url)
                        VALUES ($1, $2)
                        ON CONFLICT (organization_id) DO UPDATE SET
                            logo_url = EXCLUDED.logo_url,
                            updated_at = CURRENT_TIMESTAMP
                    `, [req.organizationId, logoUrl]);

                    return { logoUrl };
                });

                sendSuccess(res, {
                    success: true,
                    logo_url: uploadResult.logoUrl
                });
            } catch (error) {
                await cleanupUploadedFile(req.file);
                if (error.code === 'INVALID_FILE_CONTENT') {
                    return sendBadRequest(res, error.message);
                }
                console.error('Error uploading logo:', error);
                return sendError(res, 'Failed to upload logo');
            }
        });
    }));

    /**
     * DELETE /api/invoices/settings/logo - Remove business logo
     */
    router.delete('/settings/logo', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            await withDbClient(pool, async (client) => {
                // Get current logo
                const result = await client.query(
                    'SELECT logo_url FROM payment_settings WHERE organization_id = $1',
                    [req.organizationId]
                );

                if (result.rows.length > 0 && result.rows[0].logo_url) {
                    const oldUrl = result.rows[0].logo_url;
                    // Delete from S3 if it's an S3 URL
                    if (s3Service && oldUrl.includes('.s3.')) {
                        try {
                            const oldKey = oldUrl.split('.amazonaws.com/')[1];
                            if (oldKey) {
                                await s3Service.deleteFile(oldKey);
                            }
                        } catch (s3Err) {
                            logger.warn('Failed to delete old logo from S3:', s3Err);
                        }
                    }
                    // Delete local file if it exists
                    if (oldUrl.includes('/uploads/logos/')) {
                        const filePath = resolveLocalLogoPath(oldUrl);
                        if (filePath && fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    }
                }

                // Clear logo_url in settings
                await client.query(`
                    UPDATE payment_settings 
                    SET logo_url = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE organization_id = $1
                `, [req.organizationId]);
            });

            sendSuccess(res, { success: true });
        } catch (error) {
            console.error('Error removing logo:', error);
            return sendError(res, 'Failed to remove logo');
        }
    }));

    return router;
};
