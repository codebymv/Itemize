const cron = require('node-cron');
const { SignatureFileCleanupService } = require('../services/signature-file-cleanup.service');
const { logger } = require('../utils/logger');

function legacySignatureReminderJobsEnabled(environment = process.env) {
    return environment.LEGACY_SIGNATURE_REMINDER_JOBS_ENABLED !== 'false';
}

function scheduleSignatureFileCleanupJobs(pool, dependencies = {}) {
    const environment = dependencies.environment || process.env;
    const scheduler = dependencies.cron || cron;
    const log = dependencies.logger || logger;
    if (environment.SIGNATURE_FILE_CLEANUP_ENABLED !== 'true') return null;

    const expression = environment.SIGNATURE_FILE_CLEANUP_CRON || '*/15 * * * *';
    if (!scheduler.validate(expression)) {
        throw new Error('SIGNATURE_FILE_CLEANUP_CRON is invalid');
    }

    const service = dependencies.service || new SignatureFileCleanupService(pool);
    let running = false;
    const task = scheduler.schedule(expression, async () => {
        if (running) {
            log.warn('Skipping overlapping signature file cleanup cycle');
            return;
        }
        running = true;
        try {
            const result = await service.run({
                limit: environment.SIGNATURE_FILE_CLEANUP_BATCH_SIZE,
                leaseSeconds: environment.SIGNATURE_FILE_CLEANUP_LEASE_SECONDS,
                maxAttempts: environment.SIGNATURE_FILE_CLEANUP_MAX_ATTEMPTS,
            });
            if (result.claimed > 0) {
                log.info('Signature file cleanup cycle completed', result);
            }
        } catch (error) {
            log.error('Signature file cleanup cycle failed', {
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            running = false;
        }
    }, {
        timezone: environment.TZ || 'America/New_York',
    });
    log.info('Signature file cleanup scheduler initialized', { expression });
    return task;
}

module.exports = {
    legacySignatureReminderJobsEnabled,
    scheduleSignatureFileCleanupJobs,
};
