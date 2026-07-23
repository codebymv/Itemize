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
const { assertPdfUpload, cleanupUploadedFile } = require('../services/signature/storage');
const { sendSignatureFile } = require('../services/signature/file-delivery');
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

    // Keep bytes in memory until a durable cleanup receipt exists. The 5 MiB
    // transport limit bounds memory and prevents a crash between Multer's disk
    // write and database registration from leaving an untracked file.
    const storage = multer.memoryStorage();

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
} catch {
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
        if (!Array.isArray(recipients) || recipients.length > 50) {
            return 'Recipients must be an array with at most 50 entries';
        }
        const emails = new Set();
        for (const recipient of recipients) {
            if (typeof recipient.email !== 'string' || !recipient.email.trim()) {
                return 'Recipient email is required';
            }
            const normalizedEmail = recipient.email.trim().toLowerCase();
            if (emails.has(normalizedEmail)) {
                return 'Recipient emails must be unique';
            }
            emails.add(normalizedEmail);
            if (recipient.identity_method && recipient.identity_method !== 'none') {
                return 'Additional signer verification is not enabled';
            }
            if (recipient.signing_order !== undefined
                && (!Number.isInteger(Number(recipient.signing_order)) || Number(recipient.signing_order) < 1)) {
                return 'Signing order must be a positive integer';
            }
        }
        return null;
    }

    function validateFields(fields = []) {
        const allowedTypes = new Set(['signature', 'initials', 'text', 'date', 'checkbox']);
        if (!Array.isArray(fields) || fields.length > 500) {
            return 'Fields must be an array with at most 500 entries';
        }
        for (const field of fields) {
            if (!allowedTypes.has(field.field_type)) {
                return 'Invalid signature field type';
            }
            const coords = [field.x_position, field.y_position, field.width, field.height];
            if (coords.some((value) => value === undefined || Number.isNaN(Number(value)))) {
                return 'Invalid field coordinates';
            }
            if (coords.some((value) => Number(value) < 0 || Number(value) > 100)) {
                return 'Field coordinates must be between 0 and 100';
            }
            if (Number(field.width) <= 0 || Number(field.height) <= 0
                || Number(field.x_position) + Number(field.width) > 100
                || Number(field.y_position) + Number(field.height) > 100) {
                return 'Field bounds must fit within the page';
            }
            if (!Number.isInteger(Number(field.page_number || 1)) || Number(field.page_number || 1) < 1) {
                return 'Page number must be >= 1';
            }
        }
        return null;
    }

    function validateRoles(roles = []) {
        if (!Array.isArray(roles) || roles.length > 50) return 'Roles must be an array with at most 50 entries';
        const names = new Set();
        for (const role of roles) {
            if (typeof role.role_name !== 'string' || !role.role_name.trim()) return 'Role name is required';
            const name = role.role_name.trim().toLowerCase();
            if (names.has(name)) return 'Role names must be unique';
            names.add(name);
            if (role.signing_order !== undefined
                && (!Number.isInteger(Number(role.signing_order)) || Number(role.signing_order) < 1)) {
                return 'Role signing order must be a positive integer';
            }
        }
        return null;
    }

    function validateDocumentSettings(data = {}) {
        if (data.expiration_days !== undefined
            && (!Number.isInteger(Number(data.expiration_days)) || Number(data.expiration_days) < 1 || Number(data.expiration_days) > 3650)) {
            return 'Expiration days must be an integer between 1 and 3650';
        }
        if (data.routing_mode !== undefined && !['parallel', 'sequential'].includes(data.routing_mode)) {
            return 'Invalid routing mode';
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
        if (Array.isArray(req.body?.roles)) {
            const error = validateRoles(req.body.roles);
            if (error) return sendBadRequest(res, error);
        }
        if (Array.isArray(req.body?.fields)) {
            const error = validateFields(req.body.fields);
            if (error) return sendBadRequest(res, error);
        }

        const updated = await signatureService.updateTemplate(pool, req.organizationId, templateId, req.body || {});
        if (!updated) return sendNotFound(res, 'Template not found');

        if (Array.isArray(req.body?.roles)) {
            await signatureService.replaceTemplateRoles(pool, templateId, req.body.roles);
        }
        if (Array.isArray(req.body?.fields)) {
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
                await cleanupUploadedFile(req.file);
                return sendBadRequest(res, 'Template ID and file are required');
            }
            try {
                await assertPdfUpload(req.file);
                const updated = await signatureService.uploadTemplateFile(pool, req.organizationId, templateId, req.file);
                if (!updated) {
                    await cleanupUploadedFile(req.file);
                    return sendNotFound(res, 'Template not found');
                }
                return sendSuccess(res, updated);
            } catch (error) {
                await cleanupUploadedFile(req.file);
                if (error.code === 'INVALID_FILE_CONTENT') {
                    return sendError(res, error.message, 400, 'UPLOAD_ERROR');
                }
                console.error('Signature template upload failed:', error);
                return sendError(res, 'Failed to upload template file');
            }
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

    router.get('/signatures/templates/:id/file', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const templateId = parseInt(req.params.id, 10);
        if (!templateId) return sendBadRequest(res, 'Invalid template id');
        const data = await signatureService.getTemplate(pool, req.organizationId, templateId);
        const template = data?.template || data;
        if (!template?.file_url) return sendNotFound(res, 'File not found');
        const sent = await sendSignatureFile(res, template.file_url, {
            filename: template.file_name || 'template.pdf',
            sha256: template.original_sha256,
            range: req.headers.range,
            ifRange: req.headers['if-range'],
            ifNoneMatch: req.headers['if-none-match'],
        });
        if (!sent) return sendNotFound(res, 'File not found');
        return undefined;
    }));

    router.post('/signatures/templates/:id/instantiate', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const templateId = parseInt(req.params.id, 10);
        const settingsError = validateDocumentSettings(req.body || {});
        if (settingsError) return sendBadRequest(res, settingsError);
        if (Array.isArray(req.body?.recipients)) {
            const error = validateRecipients(req.body.recipients);
            if (error) return sendBadRequest(res, error);
        }
        let document;
        try {
            document = await signatureService.instantiateTemplate(pool, req.organizationId, req.user.id, templateId, req.body || {});
        } catch (error) {
            if (error.message.includes('active organization')) return sendBadRequest(res, error.message);
            throw error;
        }
        if (!document) return sendNotFound(res, 'Template not found');
        return sendCreated(res, document);
    }));

    router.post('/signatures/documents', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const { title } = req.body || {};
        if (!title) {
            return sendBadRequest(res, 'Title is required', 'title');
        }

        const settingsError = validateDocumentSettings(req.body || {});
        if (settingsError) return sendBadRequest(res, settingsError);

        let document;
        try {
            document = await signatureService.createDocument(pool, req.organizationId, req.user.id, req.body || {});
        } catch (error) {
            if (error.message.includes('Template')) return sendBadRequest(res, error.message);
            throw error;
        }
        return sendCreated(res, document);
    }));

    router.put('/signatures/documents/:id', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        if (!documentId) {
            return sendBadRequest(res, 'Invalid document id');
        }

        if (Array.isArray(req.body?.recipients)) {
            const error = validateRecipients(req.body.recipients);
            if (error) {
                return sendBadRequest(res, error);
            }
        }

        if (Array.isArray(req.body?.fields)) {
            const error = validateFields(req.body.fields);
            if (error) {
                return sendBadRequest(res, error);
            }
        }

        const updated = await signatureService.updateDocument(pool, req.organizationId, documentId, req.body || {});
        if (!updated) {
            return sendNotFound(res, 'Draft document not found');
        }

        try {
            if (Array.isArray(req.body?.recipients)) {
                await signatureService.replaceRecipients(pool, req.organizationId, documentId, req.body.recipients);
            }

            if (Array.isArray(req.body?.fields)) {
                await signatureService.replaceFields(pool, req.organizationId, documentId, req.body.fields);
            }
        } catch (error) {
            if (error.message.includes('active organization') || error.message.includes('belong to the document')) {
                return sendBadRequest(res, error.message);
            }
            throw error;
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
                await cleanupUploadedFile(req.file);
                return sendBadRequest(res, 'Document ID and file are required');
            }
            try {
                await assertPdfUpload(req.file);
                const updated = await signatureService.uploadDocument(pool, req.organizationId, documentId, req.file);
                if (!updated) {
                    await cleanupUploadedFile(req.file);
                    return sendNotFound(res, 'Draft document not found');
                }
                return sendSuccess(res, updated);
            } catch (error) {
                await cleanupUploadedFile(req.file);
                if (error.code === 'INVALID_FILE_CONTENT') {
                    return sendError(res, error.message, 400, 'UPLOAD_ERROR');
                }
                console.error('Signature document upload failed:', error);
                return sendError(res, 'Failed to upload document file');
            }
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

        const settingsError = validateDocumentSettings(req.body || {});
        if (settingsError) return sendBadRequest(res, settingsError);
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

        let updated;
        try {
            updated = await signatureService.sendForSignature(
                pool,
                signatureEmailService,
                documentId,
                req.organizationId,
                signingUrlBase
            );
        } catch (error) {
            return sendError(res, error.message, 409, 'CONFLICT');
        }

        if (!updated) return sendNotFound(res, 'Document not found');
        return sendSuccess(res, updated);
    }));

    router.post('/signatures/documents/:id/cancel', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        let result;
        try {
            result = await signatureService.cancelDocument(pool, documentId, req.organizationId);
        } catch (error) {
            return sendError(res, error.message, 409, 'CONFLICT');
        }
        if (!result) return sendNotFound(res, 'Document not found');
        return sendSuccess(res, result);
    }));

    router.post('/signatures/documents/:id/remind', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const signingUrlBase = `${frontendUrl}/sign`;
        let updated;
        try {
            updated = await signatureService.remindForSignature(
                pool,
                signatureEmailService,
                documentId,
                req.organizationId,
                signingUrlBase
            );
        } catch (error) {
            return sendError(res, error.message, 409, 'CONFLICT');
        }
        if (!updated) return sendNotFound(res, 'Document not found');
        return sendSuccess(res, updated);
    }));

    router.post('/signatures/documents/:id/reminders', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        const days = Number(req.body?.days ?? 2);
        if (!Number.isInteger(days) || days < 1 || days > 365) {
            return sendBadRequest(res, 'Reminder days must be an integer between 1 and 365');
        }
        let result;
        try {
            result = await signatureService.scheduleReminders(pool, documentId, req.organizationId, days);
        } catch (error) {
            return sendError(res, error.message, 409, 'CONFLICT');
        }
        if (!result) return sendNotFound(res, 'Active document not found');
        return sendSuccess(res, result);
    }));

    router.get('/signatures/documents/:id/download', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        const data = await signatureService.getDocumentDetails(pool, req.organizationId, documentId);
        if (!data) return sendNotFound(res, 'Document not found');

        if (!data.document.signed_file_url) {
            return sendError(res, 'Signed document not available', 404, 'NOT_READY');
        }

        const sent = await sendSignatureFile(res, data.document.signed_file_url, {
            filename: data.document.file_name || 'signed-document.pdf',
            disposition: 'attachment',
            sha256: data.document.signed_sha256,
            range: req.headers.range,
            ifRange: req.headers['if-range'],
            ifNoneMatch: req.headers['if-none-match'],
        });
        if (!sent) return sendNotFound(res, 'Signed file not found');
        return undefined;
    }));

    router.get('/signatures/documents/:id/file', authenticateJWT, requireOrganization, checkSignatureAccess, asyncHandler(async (req, res) => {
        const documentId = parseInt(req.params.id, 10);
        const data = await signatureService.getDocumentDetails(pool, req.organizationId, documentId);
        if (!data) return sendNotFound(res, 'Document not found');
        if (!data.document.file_url) return sendNotFound(res, 'File not found');

        const sent = await sendSignatureFile(res, data.document.file_url, {
            filename: data.document.file_name || 'document.pdf',
            sha256: data.document.original_sha256,
            range: req.headers.range,
            ifRange: req.headers['if-range'],
            ifNoneMatch: req.headers['if-none-match'],
        });
        if (!sent) return sendNotFound(res, 'File not found');
        return undefined;
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
        return sendError(res, 'Additional signer verification is not enabled. Possession of a valid signing link is the verification method for this release.', 410, 'SIGNER_VERIFICATION_NOT_ENABLED');
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
            if (message.includes('signature field')) {
                return sendBadRequest(res, message);
            }
            throw error;
        }
    }));

    router.post('/public/sign/:token/decline', publicRateLimit, asyncHandler(async (req, res) => {
        const token = req.params.token;
        if (req.body?.reason && String(req.body.reason).length > 2000) {
            return sendBadRequest(res, 'Decline reason is too long');
        }
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
        if (!data.document.file_url) return sendNotFound(res, 'File not found');
        const sent = await sendSignatureFile(res, data.document.file_url, {
            filename: data.document.file_name || 'document.pdf',
            disposition: 'attachment',
            sha256: data.document.original_sha256,
            range: req.headers.range,
            ifRange: req.headers['if-range'],
            ifNoneMatch: req.headers['if-none-match'],
            publicCapability: true,
        });
        if (!sent) return sendNotFound(res, 'File not found');
        return undefined;
    }));

    router.get('/public/sign/:token/file', publicRateLimit, asyncHandler(async (req, res) => {
        const token = req.params.token;
        const audit = {
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        };
        const data = await signatureService.getDocumentForSigning(pool, token, audit);
        if (!data) return sendNotFound(res, 'Signing link is invalid or expired');
        if (!data.document.file_url) return sendNotFound(res, 'File not found');
        const sent = await sendSignatureFile(res, data.document.file_url, {
            filename: data.document.file_name || 'document.pdf',
            sha256: data.document.original_sha256,
            range: req.headers.range,
            ifRange: req.headers['if-range'],
            ifNoneMatch: req.headers['if-none-match'],
            publicCapability: true,
        });
        if (!sent) return sendNotFound(res, 'File not found');
        return undefined;
    }));

    return router;
};
