/**
 * Trial Reminder Cron Job
 * 
 * Runs daily to send reminder emails to organizations with trials expiring in 3 days.
 * Checks for trials that have exactly 3 days remaining and sends reminder emails.
 */

const cron = require('node-cron');
const pool = require('../db');
const trialEmailService = require('../services/trialEmailService');
const { logger } = require('../utils/logger');

/**
 * Find organizations with trials expiring in exactly 3 days
 */
async function findTrialsExpiringIn3Days() {
  try {
    // Calculate the date 3 days from now
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    threeDaysFromNow.setHours(0, 0, 0, 0); // Start of day

    const threeDaysFromNowEnd = new Date(threeDaysFromNow);
    threeDaysFromNowEnd.setHours(23, 59, 59, 999); // End of day

    // Query organizations with trials expiring in 3 days
    // that haven't received a reminder email yet
    const result = await pool.query(
      `SELECT 
        o.id as organization_id,
        o.name as organization_name,
        o.trial_ends_at,
        o.plan,
        u.id as user_id,
        u.name as user_name,
        u.email as user_email
       FROM organizations o
       JOIN users u ON u.organization_id = o.id AND u.role = 'OWNER'
       WHERE o.subscription_status = 'trialing'
         AND o.trial_ends_at >= $1
         AND o.trial_ends_at <= $2
         AND NOT EXISTS (
           SELECT 1 FROM email_logs 
           WHERE organization_id = o.id 
             AND metadata->>'email_type' = 'trial_reminder'
         )
       ORDER BY o.trial_ends_at ASC`,
      [threeDaysFromNow, threeDaysFromNowEnd]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error finding trials expiring in 3 days:', error);
    return [];
  }
}

/**
 * Send reminder emails to eligible organizations
 */
async function sendTrialReminders() {
  logger.info('Starting trial reminder cron job...');

  try {
    const organizations = await findTrialsExpiringIn3Days();

    if (organizations.length === 0) {
      logger.info('No trials expiring in 3 days - no reminders to send');
      return;
    }

    logger.info(`Found ${organizations.length} trial(s) expiring in 3 days`);

    let successCount = 0;
    let failureCount = 0;

    for (const org of organizations) {
      try {
        const result = await trialEmailService.sendTrialReminderEmail({
          organizationId: org.organization_id,
          organizationName: org.organization_name,
          userEmail: org.user_email,
          userName: org.user_name,
          trialEndDate: org.trial_ends_at,
          daysRemaining: 3,
          planName: org.plan || 'trial',
          addPaymentUrl: `${process.env.FRONTEND_URL || 'https://itemize.cloud'}/settings?tab=billing`,
        });

        if (result.success) {
          successCount++;
          logger.info(`Reminder email sent to ${org.user_email} (org: ${org.organization_id})`);
        } else {
          failureCount++;
          logger.error(`Failed to send reminder to ${org.user_email}:`, result.error);
        }
      } catch (error) {
        failureCount++;
        logger.error(`Error sending reminder to ${org.user_email}:`, error);
      }
    }

    logger.info(`Trial reminder cron job completed: ${successCount} sent, ${failureCount} failed`);
  } catch (error) {
    logger.error('Error in trial reminder cron job:', error);
  }
}

/**
 * Schedule the cron job
 * Runs daily at 9:00 AM
 */
function scheduleTrialReminderCron() {
  const enabled = process.env.TRIAL_REMINDER_CRON_ENABLED !== 'false';

  if (!enabled) {
    logger.info('Trial reminder cron job is disabled (set TRIAL_REMINDER_CRON_ENABLED=true to enable)');
    return null;
  }

  // Schedule: Run daily at 9:00 AM
  // Cron format: minute hour day month weekday
  // '0 9 * * *' = At 9:00 AM every day
  const schedule = process.env.TRIAL_REMINDER_CRON_SCHEDULE || '0 9 * * *';

  const task = cron.schedule(schedule, async () => {
    await sendTrialReminders();
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'America/New_York',
  });

  logger.info(`Trial reminder cron job scheduled: ${schedule} (${process.env.TZ || 'America/New_York'})`);

  return task;
}

/**
 * Run the job immediately (for testing)
 */
async function runNow() {
  logger.info('Running trial reminder job immediately (manual trigger)...');
  await sendTrialReminders();
}

module.exports = {
  scheduleTrialReminderCron,
  sendTrialReminders,
  runNow,
};
