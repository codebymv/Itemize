// Run against the deployed build. Dry run by default; --apply changes only classified webhook rows.
const { Pool } = require('pg');
const { EmailWebhooksService } = require('../dist/email-webhooks/email-webhooks.service');
const { otherAppSenders } = require('../dist/email-webhooks/other-app-email-policy');

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply')) throw new Error('Usage: node scripts/classify-other-app-email-events.cjs [--apply]');
  if (!otherAppSenders().size) throw new Error('Configure RESEND_OTHER_APP_SENDERS before classifying');
  if (!process.env.DATABASE_URL || !process.env.RESEND_API_KEY) throw new Error('Database and Resend configuration required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1,
    options: '-c statement_timeout=10000 -c lock_timeout=3000' });
  try {
    const service = new EmailWebhooksService(pool, null);
    const candidates = await pool.query(`SELECT svix_id FROM email_webhook_events
      WHERE processing_status='pending' AND reconciliation_status IN ('pending','retry','dead_letter')
      ORDER BY received_at LIMIT 100`);
    const summary = {};
    for (const row of candidates.rows) {
      try {
        const result = await service.classifyStoredOtherAppEvent(row.svix_id, args.includes('--apply'));
        const outcome = result.reason ?? 'unchanged';
        summary[outcome] = (summary[outcome] ?? 0) + 1;
      } catch {
        summary.verification_failed = (summary.verification_failed ?? 0) + 1;
        process.exitCode = 1;
      }
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'dry-run', summary }));
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
