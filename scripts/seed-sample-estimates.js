const { Pool } = require('pg');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL?.trim() || '';
const OWNER_NAME = process.env.SEED_OWNER_NAME || '';
const DRY_RUN = process.argv.includes('--dry-run');
const CLEANUP = process.argv.includes('--cleanup');
const DAY_MS = 24 * 60 * 60 * 1000;

function dateFromNow(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

function timestampFromNow(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function money(value) {
  return Number(value.toFixed(2));
}

function calculate(items) {
  const subtotal = money(
    items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
  );
  const taxAmount = money(
    items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice * (item.taxRate / 100),
      0,
    ),
  );

  return { subtotal, taxAmount, total: money(subtotal + taxAmount) };
}

function contactDetails(contact, fallbackName, fallbackEmail) {
  if (!contact) {
    return {
      contactId: null,
      customerName: fallbackName,
      customerEmail: fallbackEmail,
      customerPhone: null,
    };
  }

  return {
    contactId: Number(contact.id),
    customerName:
      `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || fallbackName,
    customerEmail: contact.email || fallbackEmail,
    customerPhone: contact.phone || null,
  };
}

async function resolveTarget(client) {
  const result = await client.query(
    `SELECT
       u.id AS user_id,
       u.email,
       o.id AS organization_id,
       o.name AS organization_name,
       o.plan
     FROM users u
     JOIN organization_members om ON om.user_id = u.id
     JOIN organizations o ON o.id = om.organization_id
     WHERE lower(u.email) = lower($1)
        OR ($2 <> '' AND lower(u.name) = lower($2))
     ORDER BY
       (lower(u.email) = lower($1)) DESC,
       (o.id = u.default_organization_id) DESC,
       om.joined_at,
       o.id
     LIMIT 1`,
    [OWNER_EMAIL, OWNER_NAME],
  );

  if (!result.rows[0]) {
    throw new Error(
      `No organization membership found for ${OWNER_NAME || OWNER_EMAIL}`,
    );
  }

  return result.rows[0];
}

async function main() {
  if (!OWNER_EMAIL && !OWNER_NAME) {
    throw new Error('SEED_OWNER_EMAIL or SEED_OWNER_NAME is required');
  }
  const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_PUBLIC_URL or DATABASE_URL is required');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.DATABASE_SSL === 'false'
        ? false
        : { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    const target = await resolveTarget(client);
    const contactsResult = await client.query(
      `SELECT id, first_name, last_name, email, phone
       FROM contacts
       WHERE organization_id = $1
       ORDER BY id
       LIMIT 3`,
      [target.organization_id],
    );
    const businessResult = await client.query(
      `SELECT id
       FROM businesses
       WHERE organization_id = $1
       ORDER BY last_used_at DESC NULLS LAST, id
       LIMIT 1`,
      [target.organization_id],
    );

    const contacts = contactsResult.rows;
    const businessId = businessResult.rows[0]?.id
      ? Number(businessResult.rows[0].id)
      : null;

    const sampleResult = await client.query(
      `SELECT estimate_number, status, total, valid_until
       FROM estimates
       WHERE organization_id = $1
         AND custom_fields @> '{"sample": true, "seed": "estimates-ui"}'::jsonb
       ORDER BY estimate_number`,
      [target.organization_id],
    );

    console.log(JSON.stringify({
      mode: DRY_RUN ? 'dry-run' : CLEANUP ? 'cleanup' : 'seed',
      organizationId: Number(target.organization_id),
      organization: target.organization_name,
      plan: target.plan,
      contactsAvailable: contacts.length,
      businessAvailable: businessId !== null,
      existingSamples: sampleResult.rows,
    }));

    if (DRY_RUN) return;

    if (CLEANUP) {
      const removed = await client.query(
        `DELETE FROM estimates
         WHERE organization_id = $1
           AND custom_fields @> '{"sample": true, "seed": "estimates-ui"}'::jsonb`,
        [target.organization_id],
      );
      console.log(JSON.stringify({ removed: removed.rowCount || 0 }));
      return;
    }

    const definitions = [
      {
        estimateNumber: 'SAMPLE-E1001',
        contact: contactDetails(contacts[1] || contacts[0], 'Jordan Lee', 'jordan.lee@example.test'),
        issueDate: dateFromNow(-1),
        validUntil: dateFromNow(29),
        status: 'draft',
        createdAt: timestampFromNow(-1),
        notes: 'Draft proposal for the next phase of client success work.',
        items: [
          { name: 'CRM onboarding workshop', description: 'Discovery, workflow mapping, and team training', quantity: 1, unitPrice: 4000, taxRate: 8 },
        ],
      },
      {
        estimateNumber: 'SAMPLE-E1002',
        contact: contactDetails(contacts[0], 'Avery Morgan', 'avery.morgan@example.test'),
        issueDate: dateFromNow(-4),
        validUntil: dateFromNow(14),
        status: 'sent',
        sentAt: timestampFromNow(-3),
        createdAt: timestampFromNow(-4),
        notes: 'Awaiting the client’s first review.',
        items: [
          { name: 'Brand messaging sprint', description: 'Positioning, messaging system, and rollout plan', quantity: 1, unitPrice: 3000, taxRate: 8.333333 },
        ],
      },
      {
        estimateNumber: 'SAMPLE-E1003',
        contact: contactDetails(contacts[2] || contacts[0], 'Priya Shah', 'priya.shah@example.test'),
        issueDate: dateFromNow(-7),
        validUntil: dateFromNow(21),
        status: 'sent',
        sentAt: timestampFromNow(-6),
        viewedAt: timestampFromNow(-2),
        createdAt: timestampFromNow(-7),
        notes: 'The client has reviewed this estimate and has not responded yet.',
        items: [
          { name: 'Growth operations rollout', description: 'Lifecycle automation, reporting, and enablement', quantity: 1, unitPrice: 7200, taxRate: 8.25 },
        ],
      },
      {
        estimateNumber: 'SAMPLE-E1004',
        contact: contactDetails(contacts[1] || contacts[0], 'Jordan Lee', 'jordan.lee@example.test'),
        issueDate: dateFromNow(-38),
        validUntil: dateFromNow(-8),
        status: 'expired',
        sentAt: timestampFromNow(-37),
        viewedAt: timestampFromNow(-35),
        createdAt: timestampFromNow(-38),
        notes: 'This proposal expired before the client responded.',
        items: [
          { name: 'Implementation phase one', description: 'Configuration, migration, and initial rollout', quantity: 1, unitPrice: 3980, taxRate: 0 },
        ],
      },
      {
        estimateNumber: 'SAMPLE-E1005',
        contact: contactDetails(contacts[0], 'Avery Morgan', 'avery.morgan@example.test'),
        issueDate: dateFromNow(-18),
        validUntil: dateFromNow(12),
        status: 'accepted',
        sentAt: timestampFromNow(-18),
        viewedAt: timestampFromNow(-16),
        acceptedAt: timestampFromNow(-3),
        createdAt: timestampFromNow(-18),
        notes: 'Accepted discovery and roadmap engagement.',
        items: [
          { name: 'Discovery and roadmap', description: 'Stakeholder interviews, audit, and prioritized roadmap', quantity: 1, unitPrice: 2800, taxRate: 8 },
        ],
      },
      {
        estimateNumber: 'SAMPLE-E1006',
        contact: contactDetails(contacts[2] || contacts[0], 'Priya Shah', 'priya.shah@example.test'),
        issueDate: dateFromNow(-12),
        validUntil: dateFromNow(18),
        status: 'declined',
        sentAt: timestampFromNow(-11),
        viewedAt: timestampFromNow(-10),
        declinedAt: timestampFromNow(-5),
        createdAt: timestampFromNow(-12),
        notes: 'Declined after scope and timing review.',
        items: [
          { name: 'Quarterly campaign package', description: 'Campaign strategy, creative, and measurement', quantity: 1, unitPrice: 1800, taxRate: 0 },
        ],
      },
    ];

    await client.query('BEGIN');
    try {
      for (const definition of definitions) {
        const totals = calculate(definition.items);
        const estimateResult = await client.query(
          `INSERT INTO estimates (
             organization_id, estimate_number, contact_id, business_id,
             customer_name, customer_email, customer_phone,
             issue_date, valid_until, subtotal, tax_amount,
             discount_amount, discount_value, total, currency, status,
             notes, terms_and_conditions, sent_at, viewed_at,
             accepted_at, declined_at, custom_fields, created_by,
             created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             0, 0, $12, 'USD', $13, $14, $15, $16, $17, $18, $19,
             $20::jsonb, $21, $22, CURRENT_TIMESTAMP
           )
           ON CONFLICT (organization_id, estimate_number) DO UPDATE SET
             contact_id = EXCLUDED.contact_id,
             business_id = EXCLUDED.business_id,
             customer_name = EXCLUDED.customer_name,
             customer_email = EXCLUDED.customer_email,
             customer_phone = EXCLUDED.customer_phone,
             issue_date = EXCLUDED.issue_date,
             valid_until = EXCLUDED.valid_until,
             subtotal = EXCLUDED.subtotal,
             tax_amount = EXCLUDED.tax_amount,
             discount_amount = EXCLUDED.discount_amount,
             discount_value = EXCLUDED.discount_value,
             total = EXCLUDED.total,
             currency = EXCLUDED.currency,
             status = EXCLUDED.status,
             notes = EXCLUDED.notes,
             terms_and_conditions = EXCLUDED.terms_and_conditions,
             sent_at = EXCLUDED.sent_at,
             viewed_at = EXCLUDED.viewed_at,
             accepted_at = EXCLUDED.accepted_at,
             declined_at = EXCLUDED.declined_at,
             converted_invoice_id = NULL,
             custom_fields = EXCLUDED.custom_fields,
             created_by = EXCLUDED.created_by,
             created_at = EXCLUDED.created_at,
             updated_at = CURRENT_TIMESTAMP
           RETURNING id`,
          [
            target.organization_id,
            definition.estimateNumber,
            definition.contact.contactId,
            businessId,
            definition.contact.customerName,
            definition.contact.customerEmail,
            definition.contact.customerPhone,
            definition.issueDate,
            definition.validUntil,
            totals.subtotal,
            totals.taxAmount,
            totals.total,
            definition.status,
            definition.notes,
            'Estimate valid through the date shown above.',
            definition.sentAt || null,
            definition.viewedAt || null,
            definition.acceptedAt || null,
            definition.declinedAt || null,
            JSON.stringify({ sample: true, seed: 'estimates-ui' }),
            target.user_id,
            definition.createdAt,
          ],
        );

        const estimateId = Number(estimateResult.rows[0].id);
        await client.query('DELETE FROM estimate_items WHERE estimate_id = $1', [estimateId]);

        for (const [index, item] of definition.items.entries()) {
          const lineSubtotal = money(item.quantity * item.unitPrice);
          const taxAmount = money(lineSubtotal * (item.taxRate / 100));
          await client.query(
            `INSERT INTO estimate_items (
               estimate_id, organization_id, name, description, quantity,
               unit_price, tax_rate, tax_amount, discount_amount, total, sort_order
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10)`,
            [
              estimateId,
              target.organization_id,
              item.name,
              item.description,
              item.quantity,
              item.unitPrice,
              item.taxRate,
              taxAmount,
              money(lineSubtotal + taxAmount),
              index,
            ],
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    console.log(JSON.stringify({
      seeded: definitions.length,
      estimateNumbers: definitions.map(definition => definition.estimateNumber),
    }));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
