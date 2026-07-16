/**
 * Signature Service
 * Core business logic for signature documents
 */

const { generateToken, hashToken } = require('./signature/tokens');
const { logAuditEvent } = require('./signature/audit');
const {
    sendForSignature,
    remindForSignature,
    cancelDocument,
    scheduleReminders,
    getDocumentForSigning,
    submitSignature,
    declineSignature
} = require('./signature/signing.service');
const {
    createDocument,
    updateDocument,
    uploadDocument,
    removeDocumentFile,
    deleteDocumentFile,
    deleteDocument,
    replaceRecipients,
    replaceFields,
    listDocuments,
    getDocumentDetails
} = require('./signature/documents.service');
const {
    createTemplate,
    updateTemplate,
    deleteTemplate,
    uploadTemplateFile,
    replaceTemplateRoles,
    replaceTemplateFields,
    listTemplates,
    getTemplate,
    instantiateTemplate
} = require('./signature/templates.service');

module.exports = {
    createDocument,
    updateDocument,
    uploadDocument,
    removeDocumentFile,
    deleteDocumentFile,
    replaceRecipients,
    replaceFields,
    listDocuments,
    getDocumentDetails,
    logAuditEvent,
    sendForSignature,
    remindForSignature,
    cancelDocument,
    scheduleReminders,
    getDocumentForSigning,
    submitSignature,
    declineSignature,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    uploadTemplateFile,
    replaceTemplateRoles,
    replaceTemplateFields,
    listTemplates,
    getTemplate,
    instantiateTemplate,
    deleteDocument,
    generateToken,
    hashToken
};
