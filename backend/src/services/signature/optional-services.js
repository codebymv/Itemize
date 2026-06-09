const { logger } = require('../../utils/logger');

let pdfSignatureService = null;
try {
    pdfSignatureService = require('../pdf-signature.service');
} catch (e) {
    logger.info('PDF signature service not available');
}

let signatureEmailService = null;
try {
    signatureEmailService = require('../signature-email.service');
} catch (e) {
    logger.info('Signature email service not available');
}

module.exports = {
    pdfSignatureService,
    signatureEmailService
};
