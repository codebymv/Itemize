const { Pool } = require('pg');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL?.trim();
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');
const SEED_PREFIX = 'SAMPLE_PAYMENT_SEED:payments-ui-20260828';
const DAY_MS = 24 * 60 * 60 * 1000;

function timestampDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

const samples = [
  { amount: 1280, method: 'card', status: 'succeeded', daysAgo: 2, label: 'Website redesign deposit' },
  { amount: 760, method: 'bank_transfer', status: 'succeeded', daysAgo: 6, label: 'Monthly services payment' },
  { amount: 450, method: 'cash', status: 'succeeded', daysAgo: 13, label: 'On-site consultation' },
  { amount: 925.5, method: 'check', status: 'succeeded', daysAgo: 27, label: 'Implementation milestone' },
  { amount: 315, method: 'card', status: 'pending', daysAgo: 1, label: 'Pending card payment' },
  { amount: 640, method: 'bank_transfer', status: 'processing', daysAgo: 4, label: 'Bank transfer processing' },
  { amount: 225, method: 'card', status: 'failed', daysAgo: 3, label: 'Declined card attempt' },
  {
    amount: 500,
    method: 'card',
    status: 'refunded',
    daysAgo: 10,
    label: 'Canceled project deposit',
    refund: { amount: 500, daysAgo: 5, reason: 'Project canceled before work began' },
  },
  {
    amount: 900,
    method: 'card',
    status: 'succeeded',
    daysAgo: 20,
    label: 'Campaign production payment',
    refund: { amount: 200, daysAgo: 7, reason: 'Unused production allowance' },
  },
  { amount: 1800, method: 'other', status: 'succeeded', daysAgo: 45, label: 'Quarterly retainer' },
  { amount: 2400, method: 'cash', status: 'succeeded', daysAgo: 110, label: 'Event production payment' },
  { amount: 350, method: 'check', status: 'failed', daysAgo: 190, label: 'Returned check' },
  { amount: 3200, method: 'bank_transfer', status: 'succeeded', daysAgo: 280, label: 'Annual services deposit' },
  { amount: 4100, method: 'card', status: 'succeeded', daysAgo: 410, label: 'Prior-year project payment' },
];

async function resolveTarget(client) {
  const result = await client.query(
    `SELECT
       users.id AS user_id,
       users.email,
       organizations.id AS organization_id,
       organizations.name AS organization_name
     FROM users
     JOIN organization_members membership ON membership.user_id = users.id
     JOIN organizations ON organizations.id = membership.organization_id
     WHERE lower(users.email) = lower($1)
     ORDER BY
       (organizations.id = users.default_organization_id) DESC,
       membership.joined_at,
       organizations.id
     LIMIT 1`,
    [OWNER_EMAIL],
  );
  if (!result.rows[0]) {
    throw new Error(`No organization membership found for ${OWNER_EMAIL}`);
  }
  return result.rows[0];
}

async function existingSeedCount(client, organizationId) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM payments
     WHERE organization_id = $1 AND notes LIKE $2`,
    [organizationId, `${SEED_PREFIX}%`],
  );
  return Number(result.rows[0].count);
}

async function seed(client, target) {
  const contacts = await client.query(
    `SELECT id
     FROM contacts
     WHERE organization_id = $1
     ORDER BY created_at, id
     LIMIT 8`,
    [target.organization_id],
  );

  await client.query('BEGIN');
  try {
    await client.query(
      `DELETE FROM payments
       WHERE organization_id = $1 AND notes LIKE $2`,
      [target.organization_id, `${SEED_PREFIX}%`],
    );

    for (const [index, sample] of samples.entries()) {
      const activityAt = timestampDaysAgo(sample.daysAgo);
      const contactId = contacts.rows.length
        ? Number(contacts.rows[index % contacts.rows.length].id)
        : null;
      const refundAmount = sample.refund?.amount ?? 0;
      const refundedAt = sample.refund ? timestampDaysAgo(sample.refund.daysAgo) : null;
      const payment = await client.query(
        `INSERT INTO payments (
           organization_id, contact_id, amount, currency, payment_method,
           status, description, notes, refund_amount, refunded_at,
           refund_reason, paid_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3::numeric, 'USD', $4, $5::varchar, $6, $7,
           $8::numeric, $9::timestamptz, $10,
           CASE WHEN $5::varchar IN ('succeeded', 'refunded') THEN $11::timestamptz ELSE NULL END,
           $11::timestamptz,
           COALESCE($9::timestamptz, $11::timestamptz)
         )
         RETURNING id`,
        [
          target.organization_id,
          contactId,
          sample.amount,
          sample.method,
          sample.status,
          sample.label,
          `${SEED_PREFIX}:${index + 1}`,
          refundAmount,
          refundedAt,
          sample.refund?.reason ?? null,
          activityAt,
        ],
      );

      if (sample.refund) {
        await client.query(
          `INSERT INTO payment_refunds (
             organization_id, payment_id, idempotency_key, amount,
             currency, status, reason, created_at, updated_at, completed_at
           ) VALUES (
             $1, $2, $3, $4::numeric, 'USD', 'succeeded', $5,
             $6::timestamptz, $6::timestamptz, $6::timestamptz
           )`,
          [
            target.organization_id,
            payment.rows[0].id,
            `${SEED_PREFIX}:${index + 1}`,
            sample.refund.amount,
            sample.refund.reason,
            refundedAt,
          ],
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function cleanup(client, target) {
  const result = await client.query(
    `DELETE FROM payments
     WHERE organization_id = $1 AND notes LIKE $2
     RETURNING id`,
    [target.organization_id, `${SEED_PREFIX}%`],
  );
  return result.rowCount;
}

async function main() {
  if (!OWNER_EMAIL) throw new Error('SEED_OWNER_EMAIL is required');
  const connectionString = process.env.SEED_DATABASE_URL
    || process.env.DATABASE_PUBLIC_URL
    || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('A database connection URL is required');
  if (!DRY_RUN && !APPLY && !CLEANUP) {
    throw new Error('Choose exactly one mode: --dry-run, --apply, or --cleanup');
  }
  if ([DRY_RUN, APPLY, CLEANUP].filter(Boolean).length !== 1) {
    throw new Error('Choose exactly one mode: --dry-run, --apply, or --cleanup');
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'false'
      ? false
      : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    const target = await resolveTarget(client);
    const existing = await existingSeedCount(client, target.organization_id);
    console.log(JSON.stringify({
      mode: DRY_RUN ? 'dry-run' : APPLY ? 'apply' : 'cleanup',
      target: {
        email: target.email,
        organizationId: Number(target.organization_id),
        organizationName: target.organization_name,
      },
      existingSamplePayments: existing,
      plannedSamplePayments: APPLY || DRY_RUN ? samples.length : 0,
    }, null, 2));

    if (DRY_RUN) return;
    if (CLEANUP) {
      console.log(`Removed ${await cleanup(client, target)} sample payments.`);
      return;
    }
    await seed(client, target);
    console.log(`Seeded ${samples.length} sample payments.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
