const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError } = require('../../utils/response');
const { fs, logger, multer, path, s3Service, upload } = require('./logo-upload');
const { BUSINESS_COLUMNS, selectColumns } = require('./columns');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

    // ======================
    // Businesses (Multi-Business Support)
    // ======================

    /**
     * GET /api/invoices/businesses - List all businesses for organization
     */
    router.get('/businesses', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    `SELECT ${selectColumns(BUSINESS_COLUMNS)} FROM businesses
                     WHERE organization_id = $1 AND is_active = true
                     ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
                    [req.organizationId]
                );
            });

            sendSuccess(res, result.rows);
        } catch (error) {
            console.error('Error fetching businesses:', error);
            return sendError(res, 'Failed to fetch businesses');
        }
    }));

    /**
     * GET /api/invoices/businesses/:id - Get single business
     */
    router.get('/businesses/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        try {
            const { id } = req.params;

            // Skip if id is not a number
            if (isNaN(parseInt(id))) {
                return next();
            }

            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    `SELECT ${selectColumns(BUSINESS_COLUMNS)} FROM businesses WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                );
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Business');
            }

            sendSuccess(res, result.rows[0]);
        } catch (error) {
            console.error('Error fetching business:', error);
            return sendError(res, 'Failed to fetch business');
        }
    }));

    /**
     * POST /api/invoices/businesses - Create new business
     */
    router.post('/businesses', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { name, email, phone, address, tax_id, logo_url } = req.body;

            if (!name || !name.trim()) {
                return sendBadRequest(res, 'Business name is required');
            }

            const result = await withDbClient(pool, async (client) => {
                return client.query(`
                    INSERT INTO businesses (organization_id, name, email, phone, address, tax_id, logo_url)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING ${selectColumns(BUSINESS_COLUMNS)}
                `, [
                    req.organizationId,
                    name.trim(),
                    email || null,
                    phone || null,
                    address || null,
                    tax_id || null,
                    logo_url || null
                ]);
            });

            sendCreated(res, result.rows[0]);
        } catch (error) {
            console.error('Error creating business:', error);
            return sendError(res, 'Failed to create business');
        }
    }));

    /**
     * PUT /api/invoices/businesses/:id - Update business
     */
    router.put('/businesses/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        try {
            const { id } = req.params;

            // Skip if id is not a number
            if (isNaN(parseInt(id))) {
                return next();
            }

            const { name, email, phone, address, tax_id, logo_url, is_active } = req.body;

            if (name !== undefined && (!name || !name.trim())) {
                return sendBadRequest(res, 'Business name cannot be empty');
            }

            const updateResult = await withDbClient(pool, async (client) => {
                // Check if business exists and belongs to organization
                const checkResult = await client.query(
                    'SELECT id FROM businesses WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (checkResult.rows.length === 0) {
                    return { notFound: true };
                }

                const result = await client.query(`
                    UPDATE businesses SET
                        name = COALESCE($1, name),
                        email = COALESCE($2, email),
                        phone = COALESCE($3, phone),
                        address = COALESCE($4, address),
                        tax_id = COALESCE($5, tax_id),
                        logo_url = COALESCE($6, logo_url),
                        is_active = COALESCE($7, is_active),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $8 AND organization_id = $9
                    RETURNING ${selectColumns(BUSINESS_COLUMNS)}
                `, [
                    name?.trim(),
                    email,
                    phone,
                    address,
                    tax_id,
                    logo_url,
                    is_active,
                    id,
                    req.organizationId
                ]);

                return { business: result.rows[0] };
            });

            if (updateResult.notFound) {
                return sendNotFound(res, 'Business');
            }

            sendSuccess(res, updateResult.business);
        } catch (error) {
            console.error('Error updating business:', error);
            return sendError(res, 'Failed to update business');
        }
    }));

    /**
     * DELETE /api/invoices/businesses/:id - Delete (soft) business
     */
    router.delete('/businesses/:id', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        try {
            const { id } = req.params;

            // Skip if id is not a number
            if (isNaN(parseInt(id))) {
                return next();
            }

            const deleteResult = await withDbClient(pool, async (client) => {
                // Check if business exists and belongs to organization
                const checkResult = await client.query(
                    'SELECT id FROM businesses WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (checkResult.rows.length === 0) {
                    return { notFound: true };
                }

                // Soft delete by setting is_active = false
                await client.query(
                    'UPDATE businesses SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [id]
                );

                return { success: true };
            });

            if (deleteResult.notFound) {
                return sendNotFound(res, 'Business');
            }

            sendSuccess(res, { success: true, message: 'Business deleted' });
        } catch (error) {
            console.error('Error deleting business:', error);
            return sendError(res, 'Failed to delete business');
        }
    }));

    /**
     * POST /api/invoices/businesses/:id/logo - Upload business logo
     */
    router.post('/businesses/:id/logo', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        if (!upload) {
            return sendError(res, 'File upload not available', 503, 'SERVICE_UNAVAILABLE');
        }

        const { id } = req.params;
        if (isNaN(parseInt(id))) {
            return next();
        }

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
                const uploadResult = await withDbClient(pool, async (client) => {
                    // Check if business exists
                    const checkResult = await client.query(
                        'SELECT logo_url FROM businesses WHERE id = $1 AND organization_id = $2',
                        [id, req.organizationId]
                    );

                    if (checkResult.rows.length === 0) {
                        return { notFound: true };
                    }

                    // Delete old logo file if exists
                    if (checkResult.rows[0].logo_url) {
                        const oldUrl = checkResult.rows[0].logo_url;
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
                            const oldFilename = oldUrl.split('/uploads/logos/')[1];
                            const oldFilePath = path.join(__dirname, '../../../uploads/logos', oldFilename);
                            if (fs.existsSync(oldFilePath)) {
                                fs.unlinkSync(oldFilePath);
                            }
                        }
                    }

                    // Upload to S3 or use local storage
                    let logoUrl;
                    if (s3Service && process.env.AWS_ACCESS_KEY_ID) {
                        // Upload to S3
                        const key = `logos/logo-${req.organizationId}-${id}-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
                        logoUrl = await s3Service.uploadFile(req.file.buffer, key, req.file.mimetype);
                        // Delete local file after S3 upload
                        if (req.file.path && fs.existsSync(req.file.path)) {
                            fs.unlinkSync(req.file.path);
                        }
                    } else {
                        // Fallback to local storage
                        logoUrl = `/uploads/logos/${req.file.filename}`;
                    }

                    // Update business with logo URL
                    await client.query(
                        'UPDATE businesses SET logo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [logoUrl, id]
                    );

                    return { logoUrl };
                });

                if (uploadResult.notFound) {
                    return sendNotFound(res, 'Business');
                }

                sendSuccess(res, { logo_url: uploadResult.logoUrl });
            } catch (error) {
                console.error('Error uploading business logo:', error);
                return sendError(res, 'Failed to upload logo');
            }
        });
    }));

    /**
     * DELETE /api/invoices/businesses/:id/logo - Remove business logo
     */
    router.delete('/businesses/:id/logo', authenticateJWT, requireOrganization, asyncHandler(async (req, res, next) => {
        try {
            const { id } = req.params;
            if (isNaN(parseInt(id))) {
                return next();
            }

            const deleteResult = await withDbClient(pool, async (client) => {
                // Get current logo
                const result = await client.query(
                    'SELECT logo_url FROM businesses WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (result.rows.length === 0) {
                    return { notFound: true };
                }

                if (result.rows[0].logo_url) {
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
                        const oldFilename = oldUrl.split('/uploads/logos/')[1];
                        const oldFilePath = path.join(__dirname, '../../../uploads/logos', oldFilename);
                        if (fs.existsSync(oldFilePath)) {
                            fs.unlinkSync(oldFilePath);
                        }
                    }
                }

                // Clear logo_url
                await client.query(
                    'UPDATE businesses SET logo_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [id]
                );

                return { success: true };
            });

            if (deleteResult.notFound) {
                return sendNotFound(res, 'Business');
            }

            sendSuccess(res, { success: true });
        } catch (error) {
            console.error('Error removing business logo:', error);
            return sendError(res, 'Failed to remove logo');
        }
    }));

    return router;
};
