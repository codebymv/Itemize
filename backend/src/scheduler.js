/**
 * Scheduler Module
 * Handles scheduled background jobs using node-cron
 */

const cron = require('node-cron');
const { runAllInvoiceJobs } = require('./jobs/invoice-jobs');
const { runSignatureReminderJobs } = require('./jobs/signature-jobs');
const { logger } = require('./utils/logger');

let schedulerInitialized = false;

/**
 * Initialize all scheduled jobs
 * @param {Object} pool - PostgreSQL connection pool
 */
function initScheduler(pool) {
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

    // Run signature reminder jobs hourly
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
