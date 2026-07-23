const {
    legacySignatureReminderJobsEnabled,
    scheduleSignatureFileCleanupJobs,
} = require('../../jobs/signature-worker-scheduler');

describe('signature worker scheduler ownership', () => {
    test('keeps legacy reminders enabled unless explicitly disabled', () => {
        expect(legacySignatureReminderJobsEnabled({})).toBe(true);
        expect(legacySignatureReminderJobsEnabled({
            LEGACY_SIGNATURE_REMINDER_JOBS_ENABLED: 'true',
        })).toBe(true);
        expect(legacySignatureReminderJobsEnabled({
            LEGACY_SIGNATURE_REMINDER_JOBS_ENABLED: 'false',
        })).toBe(false);
    });

    test('keeps cleanup unscheduled unless explicitly enabled', () => {
        const cron = { validate: jest.fn(), schedule: jest.fn() };
        expect(scheduleSignatureFileCleanupJobs({}, {
            cron,
            environment: {},
        })).toBeNull();
        expect(cron.schedule).not.toHaveBeenCalled();
    });

    test('schedules bounded cleanup and prevents overlapping cycles', async () => {
        let callback;
        const cron = {
            validate: jest.fn().mockReturnValue(true),
            schedule: jest.fn((_, run) => {
                callback = run;
                return { stop: jest.fn() };
            }),
        };
        let release;
        const service = {
            run: jest.fn(() => new Promise(resolve => {
                release = () => resolve({
                    claimed: 1,
                    deleted: 1,
                    deferred: 0,
                    retry: 0,
                    deadLetter: 0,
                });
            })),
        };
        const logger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };
        const environment = {
            SIGNATURE_FILE_CLEANUP_ENABLED: 'true',
            SIGNATURE_FILE_CLEANUP_CRON: '*/5 * * * *',
            SIGNATURE_FILE_CLEANUP_BATCH_SIZE: '10',
            SIGNATURE_FILE_CLEANUP_LEASE_SECONDS: '120',
            SIGNATURE_FILE_CLEANUP_MAX_ATTEMPTS: '4',
            TZ: 'UTC',
        };

        expect(scheduleSignatureFileCleanupJobs({}, {
            cron,
            environment,
            logger,
            service,
        })).not.toBeNull();
        expect(cron.validate).toHaveBeenCalledWith('*/5 * * * *');
        expect(cron.schedule).toHaveBeenCalledWith(
            '*/5 * * * *',
            expect.any(Function),
            { timezone: 'UTC' }
        );

        const first = callback();
        await callback();
        expect(service.run).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(
            'Skipping overlapping signature file cleanup cycle'
        );
        release();
        await first;
        expect(service.run).toHaveBeenCalledWith({
            limit: '10',
            leaseSeconds: '120',
            maxAttempts: '4',
        });
    });

    test('rejects an invalid cleanup schedule', () => {
        expect(() => scheduleSignatureFileCleanupJobs({}, {
            cron: { validate: jest.fn().mockReturnValue(false) },
            environment: {
                SIGNATURE_FILE_CLEANUP_ENABLED: 'true',
                SIGNATURE_FILE_CLEANUP_CRON: 'not a cron',
            },
        })).toThrow('SIGNATURE_FILE_CLEANUP_CRON is invalid');
    });
});
