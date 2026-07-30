const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const {
    sendSuccess, sendBadRequest, sendNotFound, sendError,
} = require('../../utils/response');
const {
    assertLogoUpload, cleanupUploadedFile, fs, logger, multer,
    resolveLocalLogoPath, s3Service, upload,
} = require('./logo-upload');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

    // Multipart logo upload remains an HTTP protocol. Business profile state,
    // including logo removal, is permanently GraphQL-owned.
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
                    const checkResult = await client.query(
                        'SELECT logo_url FROM businesses WHERE id = $1 AND organization_id = $2',
                        [id, req.organizationId]
                    );

                    if (checkResult.rows.length === 0) {
                        return { notFound: true };
                    }

                    if (checkResult.rows[0].logo_url) {
                        const oldUrl = checkResult.rows[0].logo_url;
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
                        const key = `logos/logo-${req.organizationId}-${id}-${Date.now()}-${Math.round(Math.random() * 1E9)}${extension}`;
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

                    await client.query(
                        'UPDATE businesses SET logo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [logoUrl, id]
                    );

                    return { logoUrl };
                });

                if (uploadResult.notFound) {
                    await cleanupUploadedFile(req.file);
                    return sendNotFound(res, 'Business');
                }

                return sendSuccess(res, { logo_url: uploadResult.logoUrl });
            } catch (error) {
                await cleanupUploadedFile(req.file);
                if (error.code === 'INVALID_FILE_CONTENT') {
                    return sendBadRequest(res, error.message);
                }
                console.error('Error uploading business logo:', error);
                return sendError(res, 'Failed to upload logo');
            }
        });
    }));

    return router;
};
