const { Pool } = require('pg');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL?.trim();
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');
const SEED_SKU_PREFIX = 'SAMPLE-';

const samples = [
  {
    name: 'Strategy Discovery Workshop',
    description: 'A facilitated discovery session with goals, requirements, and a prioritized action plan.',
    sku: 'SAMPLE-STRATEGY',
    price: 1800,
    productType: 'one_time',
    taxRate: 0,
    taxable: false,
    isActive: true,
  },
  {
    name: 'Website Redesign Package',
    description: 'UX strategy, responsive design, development, and launch support for a complete website refresh.',
    sku: 'SAMPLE-WEB-REDESIGN',
    price: 6480,
    productType: 'one_time',
    taxRate: 8.25,
    taxable: true,
    isActive: true,
  },
  {
    name: 'CRM Setup & Migration',
    description: 'CRM configuration, data migration, pipeline setup, and team onboarding.',
    sku: 'SAMPLE-CRM-SETUP',
    price: 3980,
    productType: 'one_time',
    taxRate: 8.25,
    taxable: true,
    isActive: true,
  },
  {
    name: 'On-site Consultation',
    description: 'A focused on-site working session for planning, troubleshooting, or implementation support.',
    sku: 'SAMPLE-CONSULT',
    price: 450,
    productType: 'one_time',
    taxRate: 0,
    taxable: false,
    isActive: true,
  },
  {
    name: 'Monthly Growth Retainer',
    description: 'Monthly strategy, performance reporting, and ongoing growth advisory support.',
    sku: 'SAMPLE-GROWTH-MO',
    price: 3250,
    productType: 'recurring',
    billingPeriod: 'monthly',
    taxRate: 0,
    taxable: false,
    isActive: true,
  },
  {
    name: 'Weekly Content Production',
    description: 'Weekly writing, design, and distribution for one coordinated content campaign.',
    sku: 'SAMPLE-CONTENT-WK',
    price: 1200,
    productType: 'recurring',
    billingPeriod: 'weekly',
    taxRate: 0,
    taxable: false,
    isActive: true,
  },
  {
    name: 'Quarterly Growth Review',
    description: 'Quarterly research, stakeholder workshop, KPI review, and updated growth roadmap.',
    sku: 'SAMPLE-GROWTH-QTR',
    price: 4500,
    productType: 'recurring',
    billingPeriod: 'quarterly',
    taxRate: 0,
    taxable: false,
    isActive: true,
  },
  {
    name: 'Annual Support Plan',
    description: 'Priority support, maintenance, and a yearly system health review.',
    sku: 'SAMPLE-SUPPORT-YR',
    price: 9600,
    productType: 'recurring',
    billingPeriod: 'yearly',
    taxRate: 8.25,
    taxable: true,
    isActive: true,
  },
  {
    name: 'Legacy SEO Audit',
    description: 'Retired search audit package retained for historical estimates and invoices.',
    sku: 'SAMPLE-SEO-LEGACY',
    price: 900,
    productType: 'one_time',
    taxRate: 0,
    taxable: false,
    isActive: false,
  },
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

async function listSamples(client, organizationId) {
  const result = await client.query(
    `SELECT name, sku, price, product_type, billing_period, is_active
     FROM products
     WHERE organization_id = $1 AND sku LIKE $2
     ORDER BY id`,
    [organizationId, `${SEED_SKU_PREFIX}%`],
  );
  return result.rows;
}

async function removeSamples(client, organizationId) {
  const result = await client.query(
    `DELETE FROM products
     WHERE organization_id = $1 AND sku LIKE $2
     RETURNING id`,
    [organizationId, `${SEED_SKU_PREFIX}%`],
  );
  return result.rowCount || 0;
}

async function seed(client, target) {
  await client.query('BEGIN');
  try {
    await removeSamples(client, target.organization_id);
    for (const [index, sample] of samples.entries()) {
      const createdAt = new Date(Date.now() - (samples.length - index) * 86400000);
      await client.query(
        `INSERT INTO products (
           organization_id, name, description, sku, price, currency,
           product_type, billing_period, tax_rate, taxable, is_active,
           created_by, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5::numeric, 'USD', $6, $7,
           $8::numeric, $9, $10, $11, $12, $12
         )`,
        [
          target.organization_id,
          sample.name,
          sample.description,
          sample.sku,
          sample.price,
          sample.productType,
          sample.billingPeriod || null,
          sample.taxRate,
          sample.taxable,
          sample.isActive,
          target.user_id,
          createdAt,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  if ([DRY_RUN, APPLY, CLEANUP].filter(Boolean).length !== 1) {
    throw new Error('Choose exactly one mode: --dry-run, --apply, or --cleanup');
  }
  if (!OWNER_EMAIL) throw new Error('SEED_OWNER_EMAIL is required');
  const connectionString = process.env.SEED_DATABASE_URL
    || process.env.DATABASE_PUBLIC_URL
    || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('A database connection URL is required');

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'false'
      ? false
      : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    const target = await resolveTarget(client);
    const existing = await listSamples(client, target.organization_id);
    console.log(JSON.stringify({
      mode: DRY_RUN ? 'dry-run' : APPLY ? 'apply' : 'cleanup',
      target: {
        email: target.email,
        organizationId: Number(target.organization_id),
        organizationName: target.organization_name,
      },
      existingSampleProducts: existing.length,
      plannedSampleProducts: APPLY || DRY_RUN ? samples.length : 0,
    }, null, 2));

    if (DRY_RUN) return;
    if (CLEANUP) {
      console.log(`Removed ${await removeSamples(client, target.organization_id)} sample products.`);
      return;
    }

    await seed(client, target);
    const seeded = await listSamples(client, target.organization_id);
    console.log(JSON.stringify({ seededSampleProducts: seeded.length, products: seeded }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
