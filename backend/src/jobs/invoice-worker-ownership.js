const legacyInvoiceJobsEnabled = (environment = process.env) =>
    environment.LEGACY_INVOICE_JOBS_ENABLED !== 'false';

module.exports = { legacyInvoiceJobsEnabled };
