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
                const ext = path.extname(file.originalname);
                cb(null, `logo-${req.organizationId}-${uniqueSuffix}${ext}`);
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

module.exports = {
    fs,
    logger,
    multer,
    path,
    s3Service,
    upload
};
