const { legacyInvoiceJobsEnabled } = require('../../jobs/invoice-worker-ownership');

describe('invoice worker ownership', () => {
    test('legacy remains the default owner', () => {
        expect(legacyInvoiceJobsEnabled({})).toBe(true);
    });

    test('legacy ownership can be disabled before enabling Nest', () => {
        expect(legacyInvoiceJobsEnabled({ LEGACY_INVOICE_JOBS_ENABLED: 'false' })).toBe(false);
    });
});
