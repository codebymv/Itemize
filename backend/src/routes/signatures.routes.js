/**
 * Signatures Routes
 * Handles signature document creation and public signing endpoints
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError } = require('../utils/response');
const signatureService = require('../services/signature.service');
const signatureEmailService = require('../services/signature-email.service');
const { canAccessFeature, ERROR_CODES } = require('../lib/subscription.constants');

const router = express.Router();

// Set up DOMPurify for server-side use
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Multer for file uploads (if available)
let multer = null;
let upload = null;
try {
    multer = require('multer');

    const uploadsDir = path.join(__dirname, '../../uploads/signatures');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const storage = process.env.AWS_ACCESS_KEY_ID
        ? multer.memoryStorage()
        : multer.diskStorage({
            destination: (req, file, cb) => cb(null, uploadsDir),
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname) || '.pdf';
                cb(null, `signature-${req.organizationId}-${uniqueSuffix}${ext}`);
            }
        });

    const fileFilter = (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF files are allowed.'), false);
        }
    };

upload = multer({
        storage,
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter
    });
} catch (e) {
    upload = null;
}

module.exports = (pool, authenticateJWT, publicRateLimit) => {
    const { requireOrganization } = require('../middleware/organization')(pool);

    async function checkSignatureAccess(req, res, next) {
        const orgResult = await pool.query(
            'SELECT plan FROM organizations WHERE id = $1',
            [req.organizationId]
        );
        const plan = orgResult.rows[0]?.plan || 'starter';
        if (!canAccessFeature(plan, 'SIGNATURE_DOCUMENTS')) {
            return sendError(res, 'E-Signatures require an upgrade.', 403, ERROR_CODES.FEATURE_NOT_AVAILABLE);
        }
        return next();
    }

    function validateRecipients(recipients = []) {
        for (const recipient of recipients) {
            if (!recipient.email) {
                return 'Recipient email is required';
            }
        }
        return null;
    }

    function validateFields(fields = []) {
        for (const field of fields) {
            const coords = [field.x_position, field.y_position, field.width, field.height];
            if (coords.some((value) => value === undefined || Number.isNaN(Number(value)))) {
                return 'Invalid field coordinates';
            }
            if (coords.some((value) => Number(value) < 0 || Number(value) > 100)) {
                return 'Field coordinates must be between 0 and 100';
            }
            if (field.page_number && Number(field.page_number) < 1) {
                return 'Page number must be >= 1';
            }
        }
        return null;
    }

    // =========================
    // Authenticated Endpoints
    // =========================

    // Templates
    router.post('/signatures/templates', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const { title } = req.body || {};
        if (!title) {
            return sendBadRequest(res, 'Title is required', 'title');
        }
        const template = await signatureService.createTemplate(pool, req.organizationId, req.user.id, req.body || {});
        return sendCreated(res, template);
    }));

    router.put('/signatures/templates/:id', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const templateId = parseInt(req.params.id, 10);
        if (!templateId) {
            return sendBadRequest(res, 'Invalid template id');
        }
        const updated = await signatureService.updateTemplate(pool, req.organizationId, templateId, req.body || {});
        if (!updated) {
            return sendNotFound(res, 'Template not found');
        }
        if (Array.isArray(req.body?.roles)) {
            await signatureService.replaceTemplateRoles(pool, templateId, req.body.roles);
        }
        if (Array.isArray(req.body?.fields)) {
            const error = validateFields(req.body.fields);
            if (error) {
                return sendBadRequest(res, error);
            }
            await signatureService.replaceTemplateFields(pool, templateId, req.body.fields);
        }
        return sendSuccess(res, updated);
    }));

    router.delete('/signatures/templates/:id', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const templateId = parseInt(req.params.id, 10);
        if (!templateId) {
            return sendBadRequest(res, 'Invalid template id');
        }
        const deleted = await signatureService.deleteTemplate(pool, req.organizationId, templateId);
        if (!deleted) {
            return sendNotFound(res, 'Template not found');
        }
        return sendSuccess(res, deleted);
    }));

    router.post('/signatures/templates/upload', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        if (!upload) {
            return sendError(res, 'File upload not available. Please install multer.', 503, 'SERVICE_UNAVAILABLE');
        }
        upload.single('file')(req, res, async (err) => {
            if (err) {
                return sendError(res, err.message, 400, 'UPLOAD_ERROR');
            }
            const templateId = parseInt(req.body.template_id, 10);
            if (!templateId || !req.file) {
                return sendBadRequest(res, 'Template ID and file are required');
            }
            const updated = await signatureService.uploadTemplateFile(pool, req.organizationId, templateId, req.file);
            return sendSuccess(res, updated);
        });
    }));

    router.get('/signatures/templates', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const templates = await signatureService.listTemplates(pool, req.organizationId);
        return sendSuccess(res, templates);
    }));

    router.get('/signatures/templates/:id', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const templateId = parseInt(req.params.id, 10);
        const data = await signatureService.getTemplate(pool, req.organizationId, templateId);
        if (!data) return sendNotFound(res, 'Template not found');
        return sendSuccess(res, data);
    }));

    router.post('/signatures/templates/:id/instantiate', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const templateId = parseInt(req.params.id, 10);
        const document = await signatureService.instantiateTemplate(pool, req.organizationId, req.user.id, templateId, req.body || {});
        if (!document) return sendNotFound(res, 'Template not found');
        return sendCreated(res, document);
    }));

    router.post('/signatures/documents', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const { title } = req.body || {};
        if (!title) {
            return sendBadRequest(res, 'Title is required', 'title');
        }

        const document = await signatureService.createDocument(pool, req.organizationId, req.user.id, req.body || {});
        return sendCreated(res, document);
    }));

    router.put('/signatures/documents/:id', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        if (!documentId) {
            return sendBadRequest(res, 'Invalid document id');
        }

        const updated = await signatureService.updateDocument(pool, req.organizationId, documentId, req.body || {});
        if (!updated) {
            return sendNotFound(res, 'Document not found');
        }

        if (Array.isArray(req.body?.recipients)) {
            const error = validateRecipients(req.body.recipients);
            if (error) {
                return sendBadRequest(res, error);
            }
            await signatureService.replaceRecipients(pool, req.organizationId, documentId, req.body.recipients);
        }

        if (Array.isArray(req.body?.fields)) {
            const error = validateFields(req.body.fields);
            if (error) {
                return sendBadRequest(res, error);
            }
            await signatureService.replaceFields(pool, documentId, req.body.fields);
        }

        return sendSuccess(res, updated);
    }));

    router.post('/signatures/documents/upload', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        if (!upload) {
            return sendError(res, 'File upload not available. Please install multer.', 503, 'SERVICE_UNAVAILABLE');
        }

        upload.single('file')(req, res, async (err) => {
            if (err) {
                return sendError(res, err.message, 400, 'UPLOAD_ERROR');
            }

            const documentId = parseInt(req.body.document_id, 10);
            if (!documentId || !req.file) {
                return sendBadRequest(res, 'Document ID and file are required');
            }

            const updated = await signatureService.uploadDocument(pool, req.organizationId, documentId, req.file);
            return sendSuccess(res, updated);
        });
    }));

    // =============================
    // Signature Email Preview
    // =============================
    router.post('/signatures/email/preview', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const { message, documentTitle, senderName, senderEmail, recipientName, expiresAt, baseUrl } = req.body || {};

        if (!message || !message.trim()) {
            return sendBadRequest(res, 'Message content is required');
        }

        const signingUrl = 'https://itemize.cloud/sign/preview';
        const { subject, html } = signatureEmailService.buildSignatureRequestEmail({
            recipientName,
            documentTitle,
            senderName,
            senderEmail,
            message: message.trim(),
            signingUrl,
            expiresAt,
            isPreview: true,
            baseUrl
        });

        return sendSuccess(res, { html, subject });
    }));

    router.delete('/signatures/documents/:id/file', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        if (!documentId) {
            return sendBadRequest(res, 'Invalid document id');
        }
        const updated = await signatureService.deleteDocumentFile(pool, req.organizationId, documentId);
        if (!updated) return sendNotFound(res, 'Document not found');
        return sendSuccess(res, updated);
    }));

    router.delete('/signatures/documents/:id/file', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        if (!documentId) {
            return sendBadRequest(res, 'Invalid document id');
        }
        const updated = await signatureService.removeDocumentFile(pool, req.organizationId, documentId);
        if (!updated) return sendNotFound(res, 'Document not found');
        return sendSuccess(res, updated);
    }));

    router.delete('/signatures/documents/:id', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        if (!documentId) {
            return sendBadRequest(res, 'Invalid document id');
        }
        try {
            const deleted = await signatureService.deleteDocument(pool, req.organizationId, documentId);
            if (!deleted) return sendNotFound(res, 'Document not found');
            return sendSuccess(res, deleted);
        } catch (error) {
            return sendBadRequest(res, error.message || 'Unable to delete document');
        }
    }));

    router.get('/signatures/documents', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const { status, page = 1, limit = 20 } = req.query;
        const result = await signatureService.listDocuments(pool, req.organizationId, { status }, { page: parseInt(page, 10), limit: parseInt(limit, 10) });
        return sendSuccess(res, result);
    }));

    router.get('/signatures/documents/:id', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        const data = await signatureService.getDocumentDetails(pool, req.organizationId, documentId);
        if (!data) return sendNotFound(res, 'Document not found');
        return sendSuccess(res, data);
    }));

    router.post('/signatures/documents/:id/send', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const signingUrlBase = `${frontendUrl}/sign`;

        const updated = await signatureService.sendForSignature(
            pool,
            signatureEmailService,
            documentId,
            req.organizationId,
            signingUrlBase
        );

        if (!updated) return sendNotFound(res, 'Document not found');
        return sendSuccess(res, updated);
    }));

    router.post('/signatures/documents/:id/cancel', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        const result = await signatureService.updateDocument(pool, req.organizationId, documentId, { status: 'cancelled' });
        if (!result) return sendNotFound(res, 'Document not found');
        return sendSuccess(res, result);
    }));

    router.post('/signatures/documents/:id/remind', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const signingUrlBase = `${frontendUrl}/sign`;
        const updated = await signatureService.sendForSignature(
            pool,
            signatureEmailService,
            documentId,
            req.organizationId,
            signingUrlBase
        );
        if (!updated) return sendNotFound(res, 'Document not found');
        return sendSuccess(res, updated);
    }));

    router.post('/signatures/documents/:id/reminders', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        const days = Number(req.body?.days || 2);
        const result = await signatureService.scheduleReminders(pool, documentId, days);
        return sendSuccess(res, result);
    }));

    router.get('/signatures/documents/:id/download', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        const data = await signatureService.getDocumentDetails(pool, req.organizationId, documentId);
        if (!data) return sendNotFound(res, 'Document not found');

        if (!data.document.signed_file_url) {
            return sendError(res, 'Signed document not available', 404, 'NOT_READY');
        }

        return sendSuccess(res, { url: data.document.signed_file_url });
    }));

    router.get('/signatures/documents/:id/file', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        const data = await signatureService.getDocumentDetails(pool, req.organizationId, documentId);
        if (!data) return sendNotFound(res, 'Document not found');
        if (!data.document.file_url) return sendNotFound(res, 'File not found');

        const fileUrl = data.document.file_url;
        if (fileUrl.startsWith('/uploads/')) {
            const relativePath = fileUrl.replace('/uploads/', '');
            const fullPath = path.join(__dirname, '../uploads', relativePath);
            return res.sendFile(fullPath);
        }

        if (fileUrl.includes('.s3.') && signatureService && signatureService?.constructor) {
            // Use S3 SDK if available
            const s3Service = require('../services/s3.service');
            const parsed = new URL(fileUrl.startsWith('http') ? fileUrl : `https://${fileUrl}`);
            const key = parsed.pathname.replace(/^\//, '');
            const s3Response = await s3Service.getFile(key);
            if (s3Response?.Body) {
                res.setHeader('Content-Type', s3Response.ContentType || 'application/pdf');
                return s3Response.Body.pipe(res);
            }
        }

        const axios = require('axios');
        const response = await axios.get(fileUrl.startsWith('http') ? fileUrl : `https://${fileUrl}`,
            { responseType: 'arraybuffer' }
        );
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/pdf');
        return res.status(200).send(Buffer.from(response.data));
    }));

    router.get('/signatures/documents/:id/audit', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        const data = await signatureService.getDocumentDetails(pool, req.organizationId, documentId);
        if (!data) return sendNotFound(res, 'Document not found');
        return sendSuccess(res, data.audit || []);
    }));

    // =========================
    // Public Endpoints
    // =========================

    router.get('/public/sign/:token', publicRateLimit, asyncHandler(async (req, res) => {
        const token = req.params.token;
        const audit = {
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        };
        const data = await signatureService.getDocumentForSigning(pool, token, audit);
        if (!data) return sendNotFound(res, 'Signing link is invalid or expired');

        // Sanitize public data
        const sanitized = {
            ...data,
            document: {
                ...data.document,
                title: purify.sanitize(data.document.title || ''),
                description: purify.sanitize(data.document.description || ''),
                message: purify.sanitize(data.document.message || '')
            }
        };

        return sendSuccess(res, sanitized);
    }));

    router.post('/public/sign/:token/verify', publicRateLimit, asyncHandler(async (req, res) => {
        // Placeholder for OTP verification
        return sendSuccess(res, { verified: true });
    }));

    router.post('/public/sign/:token', publicRateLimit, asyncHandler(async (req, res) => {
        const token = req.params.token;
        const audit = {
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        };
        if (Array.isArray(req.body?.fields)) {
            const tooLarge = req.body.fields.some((field) => String(field.value || '').length > 1000000);
            if (tooLarge) {
                return sendBadRequest(res, 'Signature payload too large');
            }
        }
        try {
            const result = await signatureService.submitSignature(pool, token, req.body || {}, audit);
            if (!result) return sendNotFound(res, 'Signing link is invalid or expired');
            return sendSuccess(res, result);
        } catch (error) {
            const message = error?.message || 'Failed to submit signature';
            if (message.includes('required')) {
                return sendBadRequest(res, message);
            }
            if (message.includes('signature data')) {
                return sendBadRequest(res, message);
            }
            throw error;
        }
    }));

    router.post('/public/sign/:token/decline', publicRateLimit, asyncHandler(async (req, res) => {
        const token = req.params.token;
        const audit = {
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        };
        const result = await signatureService.declineSignature(pool, token, req.body?.reason, audit);
        if (!result) return sendNotFound(res, 'Signing link is invalid or expired');
        return sendSuccess(res, result);
    }));

    router.get('/public/sign/:token/download', publicRateLimit, asyncHandler(async (req, res) => {
        const token = req.params.token;
        const audit = {
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        };
        const data = await signatureService.getDocumentForSigning(pool, token, audit);
        if (!data) return sendNotFound(res, 'Signing link is invalid or expired');
        return sendSuccess(res, { url: data.document.file_url });
    }));

    router.get('/public/sign/:token/file', publicRateLimit, asyncHandler(async (req, res) => {
        const token = req.params.token;
        const audit = {
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        };
        const data = await signatureService.getDocumentForSigning(pool, token, audit);
        if (!data) return sendNotFound(res, 'Signing link is invalid or expired');
        const fileUrl = data.document.file_url;
        if (!fileUrl) return sendNotFound(res, 'File not found');

        if (fileUrl.startsWith('/uploads/')) {
            const relativePath = fileUrl.replace('/uploads/', '');
            const fullPath = path.join(__dirname, '../uploads', relativePath);
            return res.sendFile(fullPath);
        }

        if (fileUrl.includes('.s3.') && signatureService && signatureService?.constructor) {
            const s3Service = require('../services/s3.service');
            const parsed = new URL(fileUrl.startsWith('http') ? fileUrl : `https://${fileUrl}`);
            const key = parsed.pathname.replace(/^\//, '');
            const s3Response = await s3Service.getFile(key);
            if (s3Response?.Body) {
                res.setHeader('Content-Type', s3Response.ContentType || 'application/pdf');
                return s3Response.Body.pipe(res);
            }
        }

        const axios = require('axios');
        const response = await axios.get(fileUrl.startsWith('http') ? fileUrl : `https://${fileUrl}`,
            { responseType: 'arraybuffer' }
        );
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/pdf');
        return res.status(200).send(Buffer.from(response.data));
    }));

    return router;
};
