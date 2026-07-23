/**
 * Scheduler Module
 * Handles scheduled background jobs using node-cron
 */

const cron = require('node-cron');
const { runAllInvoiceJobs } = require('./jobs/invoice-jobs');
const { runSignatureReminderJobs } = require('./jobs/signature-jobs');
const {
    runSubscriptionWebhookNotificationJobs,
    runSubscriptionWebhookReconciliationJobs,
} = require('./jobs/subscription-webhook-jobs');
const { runEmailWebhookReconciliationJobs } = require('./jobs/email-webhook-jobs');
const {
    runSocialWebhookProcessingJobs,
    runSocialWebhookReconciliationJobs,
} = require('./jobs/social-webhook-jobs');
const {
    hasEnabledWorkflowJobs,
    runWorkflowJobCycle,
    workflowJobFlags,
} = require('./jobs/workflow-rollout-jobs');
const { scheduleTrialReminderCron } = require('./jobs/trialReminderCron');
const { startRealtimeOutboxWorker } = require('./jobs/realtime-outbox-jobs');
const { runCalendarSyncJobs } = require('./jobs/calendar-sync-jobs');
const {
    legacySignatureReminderJobsEnabled,
    scheduleSignatureFileCleanupJobs,
} = require('./jobs/signature-worker-scheduler');
const { logger } = require('./utils/logger');

let schedulerInitialized = false;

/**
 * Initialize all scheduled jobs
 * @param {Object} pool - PostgreSQL connection pool
 * @param {Object} io - Socket.IO server
 * @param {Object} broadcast - Authorized Socket.IO broadcast adapter
 */
function initScheduler(pool, io, broadcast) {
    if (schedulerInitialized) {
        logger.warn('Scheduler already initialized, skipping...');
        return;
    }

    // Run invoice jobs daily at 6:00 AM
    // Cron format: minute hour day-of-month month day-of-week
    cron.schedule('0 6 * * *', async () => {
        logger.info('Running scheduled invoice jobs (daily 6:00 AM)...');
        try {
            await runAllInvoiceJobs(pool);
            logger.info('Scheduled invoice jobs completed successfully');
        } catch (error) {
            logger.error('Error in scheduled invoice jobs:', error);
        }
    }, {
        timezone: 'America/New_York' // Adjust timezone as needed
    });

    if (legacySignatureReminderJobsEnabled()) {
        // Run signature reminder jobs hourly until durable NestJS delivery owns them.
        cron.schedule('0 * * * *', async () => {
            logger.info('Running signature reminder jobs (hourly)...');
            try {
                await runSignatureReminderJobs(pool);
                logger.info('Signature reminder jobs completed successfully');
            } catch (error) {
                logger.error('Error in signature reminder jobs:', error);
            }
        }, {
            timezone: 'America/New_York'
        });
    } else {
        logger.info('Legacy signature reminder scheduler disabled');
    }

    scheduleSignatureFileCleanupJobs(pool);

    // Schedule trial reminder cron job (daily at 9:00 AM)
    scheduleTrialReminderCron();

    if (process.env.REALTIME_OUTBOX_WORKER_ENABLED === 'true') {
        startRealtimeOutboxWorker(pool, broadcast, {
            batchSize: process.env.REALTIME_OUTBOX_BATCH_SIZE,
            leaseSeconds: process.env.REALTIME_OUTBOX_LEASE_SECONDS,
            maxAttempts: process.env.REALTIME_OUTBOX_MAX_ATTEMPTS,
            pollIntervalMs: process.env.REALTIME_OUTBOX_POLL_INTERVAL_MS,
        });
        logger.info('Realtime outbox worker initialized');
    }

    if (process.env.CALENDAR_SYNC_JOBS_ENABLED === 'true') {
        cron.schedule('* * * * *', async () => {
            try {
                const summary = await runCalendarSyncJobs(pool, {
                    batchSize: process.env.CALENDAR_SYNC_JOB_BATCH_SIZE,
                    leaseSeconds: process.env.CALENDAR_SYNC_JOB_LEASE_SECONDS,
                    maxAttempts: process.env.CALENDAR_SYNC_JOB_MAX_ATTEMPTS,
                });
                if (summary.claimed > 0) {
                    logger.info('Calendar sync jobs completed', summary);
                }
            } catch (error) {
                logger.error('Error in calendar sync jobs', { error: error.message });
            }
        }, {
            timezone: process.env.TZ || 'America/New_York'
        });
        logger.info('Calendar sync job worker initialized');
    }

    if (process.env.SUBSCRIPTION_WEBHOOK_JOBS_ENABLED !== 'false') {
        cron.schedule('* * * * *', async () => {
            try {
                const [notificationSummary, reconciliationSummary] = await Promise.all([
                    runSubscriptionWebhookNotificationJobs(pool),
                    runSubscriptionWebhookReconciliationJobs(pool),
                ]);
                if (notificationSummary.claimed > 0) {
                    logger.info('Subscription webhook notification jobs completed', notificationSummary);
                }
                if (reconciliationSummary.claimed > 0) {
                    logger.info('Subscription webhook reconciliation jobs completed', reconciliationSummary);
                }
            } catch (error) {
                logger.error('Error in subscription webhook notification jobs', { error: error.message });
            }
        }, {
            timezone: process.env.TZ || 'America/New_York'
        });
    }

    if (process.env.EMAIL_WEBHOOK_JOBS_ENABLED !== 'false') {
        cron.schedule('* * * * *', async () => {
            try {
                const summary = await runEmailWebhookReconciliationJobs(pool);
                if (summary.claimed > 0) {
                    logger.info('Email webhook reconciliation jobs completed', summary);
                }
            } catch (error) {
                logger.error('Error in email webhook reconciliation jobs', { error: error.message });
            }
        }, {
            timezone: process.env.TZ || 'America/New_York'
        });
    }

    if (process.env.SOCIAL_WEBHOOK_JOBS_ENABLED !== 'false') {
        cron.schedule('* * * * *', async () => {
            const onProcessed = io ? async result => {
                io.to(`org-social-${result.channel.organization_id}`).emit('social_message', {
                    conversation_id: result.conversationId,
                    message: result.message,
                    is_new_conversation: result.isNewConversation,
                });
            } : null;
            try {
                const [processingSummary, reconciliationSummary] = await Promise.all([
                    runSocialWebhookProcessingJobs(pool, { onProcessed }),
                    runSocialWebhookReconciliationJobs(pool, { onProcessed }),
                ]);
                if (processingSummary.claimed > 0) {
                    logger.info('Social webhook processing jobs completed', processingSummary);
                }
                if (reconciliationSummary.claimed > 0) {
                    logger.info('Social webhook reconciliation jobs completed', reconciliationSummary);
                }
            } catch (error) {
                logger.error('Error in social webhook jobs', { error: error.message });
            }
        }, {
            timezone: process.env.TZ || 'America/New_York'
        });
    }

    const workflowFlags = workflowJobFlags();
    if (hasEnabledWorkflowJobs(workflowFlags)) {
        cron.schedule('* * * * *', async () => {
            try {
                const summary = await runWorkflowJobCycle(pool, { flags: workflowFlags });
                if (summary.scheduled?.queued > 0) {
                    logger.info('Scheduled workflow jobs completed', summary.scheduled);
                }
                if (summary.trigger?.claimed > 0) {
                    logger.info('Workflow trigger jobs completed', summary.trigger);
                }
                if (summary.enrollment?.claimed > 0) {
                    logger.info('Workflow enrollment jobs completed', summary.enrollment);
                }
                if (summary.sideEffect?.claimed > 0
                    || summary.sideEffect?.reconciliationRequired > 0) {
                    logger.info('Workflow side-effect jobs completed', summary.sideEffect);
                }
            } catch (error) {
                logger.error('Error in workflow job cycle', { error: error.message });
            }
        }, {
            timezone: process.env.TZ || 'America/New_York'
        });
    }

    // Also run immediately on startup in development to catch any missed jobs
    if (process.env.NODE_ENV === 'development') {
        logger.info('Development mode: Running invoice jobs on startup...');
        // Delay slightly to ensure database is fully ready
        setTimeout(async () => {
            try {
                await runAllInvoiceJobs(pool);
                logger.info('Startup invoice jobs completed');
            } catch (error) {
                logger.error('Error in startup invoice jobs:', error);
            }
        }, 5000);
    }

    schedulerInitialized = true;
    logger.info('Scheduler initialized - invoice jobs will run daily at 6:00 AM');
}

/**
 * Manually trigger invoice jobs (for admin/testing purposes)
 * @param {Object} pool - PostgreSQL connection pool
 */
async function runJobsNow(pool) {
    logger.info('Manually triggering invoice jobs...');
    try {
        await runAllInvoiceJobs(pool);
        logger.info('Manual invoice jobs completed successfully');
        return { success: true, message: 'Jobs completed successfully' };
    } catch (error) {
        logger.error('Error in manual invoice jobs:', error);
        return { success: false, message: error.message };
    }
}

module.exports = { 
    initScheduler,
    runJobsNow
};
