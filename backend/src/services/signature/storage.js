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
    const originalExtension = path.extname(originalname || '');
    const ext = '.pdf';
    const base = path.basename(originalname || 'document', originalExtension).replace(/[^a-zA-Z0-9-_]/g, '');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    return `signatures/${organizationId}/${documentId}/${base || 'document'}-${uniqueSuffix}${ext || '.pdf'}`;
}

function getLocalFilePath(fileUrl) {
    if (!fileUrl || !fileUrl.startsWith('/uploads/signatures/')) return null;
    const signaturesRoot = path.resolve(__dirname, '../../../uploads/signatures');
    const resolved = path.resolve(signaturesRoot, fileUrl.slice('/uploads/signatures/'.length));
    if (!resolved.startsWith(`${signaturesRoot}${path.sep}`)) return null;
    return resolved;
}

function getS3KeyFromUrl(fileUrl) {
    if (!fileUrl || !s3Service) return null;
    try {
        const url = new URL(fileUrl);
        const bucket = process.env.AWS_S3_BUCKET || 'itemize-uploads';
        const escapedBucket = bucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hostnamePattern = new RegExp(`^${escapedBucket}\\.s3(?:\\.[a-z0-9-]+)?\\.amazonaws\\.com$`, 'i');
        if (!hostnamePattern.test(url.hostname)) return null;
        const key = url.pathname.replace(/^\//, '');
        return key.startsWith('signatures/') ? key : null;
    } catch {
        return null;
    }
}

async function assertPdfUpload(file) {
    let header;
    if (file?.buffer) {
        header = file.buffer.subarray(0, 5);
    } else if (file?.path) {
        const handle = await fs.promises.open(file.path, 'r');
        try {
            header = Buffer.alloc(5);
            const { bytesRead } = await handle.read(header, 0, 5, 0);
            header = header.subarray(0, bytesRead);
        } finally {
            await handle.close();
        }
    }

    if (!header || header.toString('ascii') !== '%PDF-') {
        const error = new Error('Invalid PDF file content');
        error.code = 'INVALID_FILE_CONTENT';
        throw error;
    }
    file.mimetype = 'application/pdf';
    return file;
}

async function cleanupUploadedFile(file) {
    if (file?.path) {
        await fs.promises.unlink(file.path).catch(() => null);
    }
}

function allocateUploadedFile(organizationId, resourceId, originalname) {
    const key = buildUploadKey(organizationId, resourceId, originalname);
    if (s3Service?.isConfigured) {
        return {
            fileUrl: s3Service.getPublicUrl(key),
            key,
        };
    }
    return {
        fileUrl: `/uploads/signatures/${path.basename(key)}`,
        key: null,
    };
}

async function storeAllocatedFile(file, allocation) {
    if (!file?.buffer?.length) throw new Error('Signature upload bytes are unavailable');
    if (allocation.key) {
        await s3Service.uploadFile(file.buffer, allocation.key, 'application/pdf');
        return allocation.fileUrl;
    }
    const localPath = getLocalFilePath(allocation.fileUrl);
    if (!localPath) throw new Error('Signature file locator is not server-owned storage');
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
    await fs.promises.writeFile(localPath, file.buffer, { flag: 'wx' });
    return allocation.fileUrl;
}

async function removeUploadedFile(fileUrl) {
    const localPath = getLocalFilePath(fileUrl);
    if (localPath) {
        await fs.promises.unlink(localPath).catch(error => {
            if (error?.code !== 'ENOENT') throw error;
        });
        return;
    }
    const key = getS3KeyFromUrl(fileUrl);
    if (!key || !s3Service?.isConfigured) {
        throw new Error('Signature file locator is not server-owned storage');
    }
    await s3Service.deleteFile(key);
}

async function registerStagedFile(database, organizationId, documentId, fileUrl) {
    await database.query(
        `INSERT INTO signature_file_deletion_jobs
           (organization_id,document_id,file_url,next_attempt_at)
         VALUES ($1,$2,$3,CURRENT_TIMESTAMP+INTERVAL '1 hour')
         ON CONFLICT (organization_id,file_url) DO UPDATE SET
           document_id=EXCLUDED.document_id,status='queued',attempt_count=0,
           next_attempt_at=CURRENT_TIMESTAMP+INTERVAL '1 hour',
           lease_expires_at=NULL,claimed_by=NULL,last_error=NULL,deleted_at=NULL,
           updated_at=CURRENT_TIMESTAMP`,
        [organizationId, documentId, fileUrl]
    );
}

async function finalizeStagedFile(database, organizationId, fileUrl) {
    await database.query(
        `DELETE FROM signature_file_deletion_jobs
         WHERE organization_id=$1 AND file_url=$2`,
        [organizationId, fileUrl]
    );
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
    allocateUploadedFile,
    assertPdfUpload,
    computeSha256FromFile,
    finalizeStagedFile,
    buildUploadKey,
    cleanupUploadedFile,
    getLocalFilePath,
    getS3KeyFromUrl,
    getUploadedFileUrl,
    removeUploadedFile,
    registerStagedFile,
    storeAllocatedFile,
};
