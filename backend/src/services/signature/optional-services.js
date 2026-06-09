const { logger } = require('../../utils/logger');

let pdfSignatureService = null;
try {
    pdfSignatureService = require('../pdf-signature.service');
} catch {
    logger.info('PDF signature service not available');
}

let signatureEmailService = null;
try {
    signatureEmailService = require('../signature-email.service');
} catch {
    logger.info('Signature email service not available');
}

module.exports = {
    pdfSignatureService,
    signatureEmailService
};
