const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { logger } = require('../../utils/logger');

let s3Service = null;
try {
    s3Service = require('../s3.service');
} catch {
    logger.info('S3 service not available - signature uploads will use local storage');
}

async function computeSha256FromFile(file) {
    if (file?.buffer) {
        return crypto.createHash('sha256').update(file.buffer).digest('hex');
    }
    if (file?.path) {
        const buffer = await fs.promises.readFile(file.path);
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }
    return null;
}

function buildUploadKey(organizationId, documentId, originalname) {
    const ext = path.extname(originalname || '');
    const base = path.basename(originalname || 'document', ext).replace(/[^a-zA-Z0-9-_]/g, '');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    return `signatures/${organizationId}/${documentId}/${base || 'document'}-${uniqueSuffix}${ext || '.pdf'}`;
}

function getLocalFilePath(fileUrl) {
    if (!fileUrl || !fileUrl.startsWith('/uploads/')) return null;
    const relativePath = fileUrl.replace('/uploads/', '');
    return path.join(__dirname, '../../uploads', relativePath);
}

function getS3KeyFromUrl(fileUrl) {
    if (!fileUrl || !s3Service) return null;
    try {
        const url = new URL(fileUrl);
        const bucket = process.env.AWS_S3_BUCKET || 'itemize-uploads';
        if (!url.hostname.startsWith(`${bucket}.s3.`)) return null;
        return url.pathname.replace(/^\//, '');
    } catch {
        return null;
    }
}

function getUploadedFileUrl(file) {
    if (file?.filename) {
        return `/uploads/signatures/${file.filename}`;
    }
    if (file?.path) {
        return `/uploads/signatures/${path.basename(file.path)}`;
    }
    return null;
}

module.exports = {
    s3Service,
    computeSha256FromFile,
    buildUploadKey,
    getLocalFilePath,
    getS3KeyFromUrl,
    getUploadedFileUrl
};
