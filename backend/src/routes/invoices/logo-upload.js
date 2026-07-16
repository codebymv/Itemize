const path = require('path');
const fs = require('fs');
const { logger } = require('../../utils/logger');

let s3Service = null;
try {
    s3Service = require('../../services/s3.service');
} catch (_e) {
    logger.info('S3 service not available - file uploads will use local storage');
}

let multer = null;
let upload = null;
try {
    multer = require('multer');

    const uploadsDir = path.join(__dirname, '../../../uploads/logos');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const storage = process.env.AWS_ACCESS_KEY_ID
        ? multer.memoryStorage()
        : multer.diskStorage({
            destination: (_req, _file, cb) => {
                cb(null, uploadsDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, `logo-${req.organizationId}-${uniqueSuffix}.upload`);
            }
        });

    const fileFilter = (_req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'), false);
        }
    };

    upload = multer({
        storage,
        limits: { fileSize: 2 * 1024 * 1024 },
        fileFilter
    });
} catch (_e) {
    logger.info('Multer not available - file upload disabled');
}

function detectLogoType(buffer) {
    if (!Buffer.isBuffer(buffer)) return null;
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        return { mimetype: 'image/png', extension: '.png' };
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { mimetype: 'image/jpeg', extension: '.jpg' };
    }
    const signature = buffer.subarray(0, 6).toString('ascii');
    if (signature === 'GIF87a' || signature === 'GIF89a') {
        return { mimetype: 'image/gif', extension: '.gif' };
    }
    if (buffer.length >= 12
        && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
        return { mimetype: 'image/webp', extension: '.webp' };
    }
    return null;
}

async function assertLogoUpload(file) {
    const buffer = file?.buffer || (file?.path ? await fs.promises.readFile(file.path) : null);
    const detected = detectLogoType(buffer);
    if (!detected) {
        const error = new Error('Invalid image file content');
        error.code = 'INVALID_FILE_CONTENT';
        throw error;
    }

    file.mimetype = detected.mimetype;
    if (file.path) {
        const nextPath = file.path.replace(/\.upload$/i, detected.extension);
        if (nextPath !== file.path) {
            await fs.promises.rename(file.path, nextPath);
            file.path = nextPath;
            file.filename = path.basename(nextPath);
        }
    }
    return file;
}

async function cleanupUploadedFile(file) {
    if (file?.path) await fs.promises.unlink(file.path).catch(() => null);
}

function resolveLocalLogoPath(fileUrl) {
    const match = /^\/uploads\/logos\/([a-zA-Z0-9._-]+)$/.exec(String(fileUrl || ''));
    if (!match) return null;
    return path.join(__dirname, '../../../uploads/logos', match[1]);
}

module.exports = {
    fs,
    logger,
    multer,
    path,
    s3Service,
    upload,
    assertLogoUpload,
    cleanupUploadedFile,
    detectLogoType,
    resolveLocalLogoPath,
};
