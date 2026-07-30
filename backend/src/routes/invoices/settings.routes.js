const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendBadRequest, sendError } = require('../../utils/response');
const {
    assertLogoUpload, cleanupUploadedFile, fs, logger, multer,
    resolveLocalLogoPath, s3Service, upload,
} = require('./logo-upload');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

    // Multipart logo upload remains an HTTP protocol. Invoice settings state,
    // including logo removal, is permanently GraphQL-owned.
    router.post('/settings/logo', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        if (!upload) {
            return sendError(res, 'File upload not available. Please install multer: npm install multer', 503, 'SERVICE_UNAVAILABLE');
        }

        upload.single('logo')(req, res, async (err) => {
            if (err) {
                if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                    return sendBadRequest(res, 'File too large. Maximum size is 2MB.');
                }
                return sendBadRequest(res, err.message);
            }

            if (!req.file) {
                return sendBadRequest(res, 'No file uploaded');
            }

            try {
                await assertLogoUpload(req.file);
                const uploadResult = await withDbClient(pool, async (client) => {
                    const oldSettings = await client.query(
                        'SELECT logo_url FROM payment_settings WHERE organization_id = $1',
                        [req.organizationId]
                    );

                    if (oldSettings.rows.length > 0 && oldSettings.rows[0].logo_url) {
                        const oldUrl = oldSettings.rows[0].logo_url;
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
                        if (oldUrl.includes('/uploads/logos/')) {
                            const oldFilePath = resolveLocalLogoPath(oldUrl);
                            if (oldFilePath && fs.existsSync(oldFilePath)) {
                                fs.unlinkSync(oldFilePath);
                            }
                        }
                    }

                    let logoUrl;
                    if (s3Service && process.env.AWS_ACCESS_KEY_ID) {
                        const extension = {
                            'image/png': '.png',
                            'image/jpeg': '.jpg',
                            'image/gif': '.gif',
                            'image/webp': '.webp',
                        }[req.file.mimetype];
                        const key = `logos/logo-${req.organizationId}-settings-${Date.now()}-${Math.round(Math.random() * 1E9)}${extension}`;
                        logoUrl = await s3Service.uploadFile(
                            req.file.buffer,
                            key,
                            req.file.mimetype
                        );
                        if (req.file.path && fs.existsSync(req.file.path)) {
                            fs.unlinkSync(req.file.path);
                        }
                    } else {
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

                return sendSuccess(res, {
                    success: true,
                    logo_url: uploadResult.logoUrl,
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

    return router;
};
