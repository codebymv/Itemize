const MAX_IMPORT_ROWS = 10000;
const MAX_EXPORT_ROWS = 50000;

function protectSpreadsheetCell(value) {
    const normalized = value === null || value === undefined ? '' : String(value);
    return /^[\t\r ]*[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}

function csvCell(value) {
    return `"${protectSpreadsheetCell(value).replace(/"/g, '""')}"`;
}

function validateImportEnvelope(importData, skipDuplicates) {
    if (!Array.isArray(importData) || importData.length === 0) {
        return 'No contacts data provided';
    }
    if (importData.length > MAX_IMPORT_ROWS) {
        return `Contact imports are limited to ${MAX_IMPORT_ROWS} rows`;
    }
    if (typeof skipDuplicates !== 'boolean') {
        return 'skipDuplicates must be a boolean';
    }
    if (importData.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
        return 'Every imported contact must be an object';
    }
    return null;
}

module.exports = {
    MAX_EXPORT_ROWS,
    MAX_IMPORT_ROWS,
    csvCell,
    protectSpreadsheetCell,
    validateImportEnvelope,
};
