const { Pool } = require('pg');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL?.trim() || '';
const OWNER_NAME = process.env.SEED_OWNER_NAME || '';
const DRY_RUN = process.argv.includes('--dry-run');
const ENABLE_STUDIO = process.argv.includes('--enable-studio');
const CLEANUP = process.argv.includes('--cleanup');
const RESTORE_FREE = process.argv.includes('--restore-free');
const DAY_MS = 24 * 60 * 60 * 1000;

const STUDIO_LIMITS = {
  emails: 10000,
  sms: 5000,
  apiCalls: 10000,
  contacts: 25000,
  users: 10,
  workflows: 25,
  landingPages: 50,
  forms: 50,
  calendars: -1,
};

function dateFromNow(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

function timestampFromNow(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function money(value) {
  return Number(value.toFixed(2));
}

function calculate(items, discountAmount = 0) {
  const subtotal = money(
    items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
  );
  const taxAmount = money(
    items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice * (item.taxRate / 100),
      0,
    ),
  );
  return {
    subtotal,
    taxAmount,
    total: money(subtotal + taxAmount - discountAmount),
  };
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

async function enableStudio(client, organizationId) {
  const planResult = await client.query(
    `SELECT id
     FROM subscription_plans
     WHERE name = 'unlimited' AND is_active = true
     LIMIT 1`,
  );
  const planId = planResult.rows[0]?.id;
  if (!planId) throw new Error('The active Studio plan was not found');

  await client.query(
    `INSERT INTO subscriptions (
       organization_id, plan_id, status, created_at, updated_at
     ) VALUES ($1, $2, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (organization_id) DO UPDATE SET
       plan_id = EXCLUDED.plan_id,
       status = 'active',
       canceled_at = NULL,
       updated_at = CURRENT_TIMESTAMP`,
    [organizationId, planId],
  );
  await client.query(
    `UPDATE organizations SET
       current_plan_id = $1,
       plan = 'unlimited',
       subscription_status = 'active',
       emails_limit = $2,
       sms_limit = $3,
       api_calls_limit = $4,
       contacts_limit = $5,
       users_limit = $6,
       workflows_limit = $7,
       landing_pages_limit = $8,
       forms_limit = $9,
       calendars_limit = $10,
       trial_ends_at = NULL,
       trial_end_acknowledged_at = NULL,
       cancel_at_period_end = FALSE,
       canceled_at = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $11`,
    [
      planId,
      STUDIO_LIMITS.emails,
      STUDIO_LIMITS.sms,
      STUDIO_LIMITS.apiCalls,
      STUDIO_LIMITS.contacts,
      STUDIO_LIMITS.users,
      STUDIO_LIMITS.workflows,
      STUDIO_LIMITS.landingPages,
      STUDIO_LIMITS.forms,
      STUDIO_LIMITS.calendars,
      organizationId,
    ],
  );
}

async function restoreFree(client, organizationId) {
  const planResult = await client.query(
    `SELECT id
     FROM subscription_plans
     WHERE name = 'free' AND is_active = true
     LIMIT 1`,
  );
  const planId = planResult.rows[0]?.id ?? null;

  await client.query(
    `UPDATE subscriptions SET
       plan_id = COALESCE($2, plan_id),
       status = 'canceled',
       canceled_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     WHERE organization_id = $1`,
    [organizationId, planId],
  );
  await client.query(
    `UPDATE organizations SET
       current_plan_id = $1,
       plan = 'free',
       subscription_status = 'canceled',
       emails_limit = 0,
       sms_limit = 0,
       api_calls_limit = 0,
       contacts_limit = 0,
       users_limit = 0,
       workflows_limit = 0,
       landing_pages_limit = 0,
       forms_limit = 0,
       calendars_limit = 0,
       trial_ends_at = NULL,
       trial_end_acknowledged_at = NULL,
       cancel_at_period_end = FALSE,
       canceled_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [planId, organizationId],
  );
}

async function main() {
  if (!OWNER_EMAIL && !OWNER_NAME) {
    throw new Error('SEED_OWNER_EMAIL or SEED_OWNER_NAME is required');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
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
    const existingResult = await client.query(
      `SELECT COUNT(*)::integer AS count
       FROM invoices
       WHERE organization_id = $1
         AND custom_fields @> '{"sample": true}'::jsonb`,
      [target.organization_id],
    );

    const contacts = contactsResult.rows;
    const businessId = businessResult.rows[0]?.id
      ? Number(businessResult.rows[0].id)
      : null;
    console.log(
      JSON.stringify({
        mode: DRY_RUN ? 'dry-run' : 'seed',
        organizationId: Number(target.organization_id),
        organization: target.organization_name,
        plan: target.plan,
        contactsAvailable: contacts.length,
        businessAvailable: businessId !== null,
        existingSampleInvoices: Number(existingResult.rows[0].count),
      }),
    );

    if (DRY_RUN) {
      const samplesResult = await client.query(
        `SELECT
           i.invoice_number,
           i.status,
           i.total,
           i.amount_paid,
           i.amount_due,
           i.due_date,
           COUNT(ii.id)::integer AS item_count
         FROM invoices i
         LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
         WHERE i.organization_id = $1
           AND i.custom_fields @> '{"sample": true}'::jsonb
         GROUP BY i.id
         ORDER BY i.invoice_number`,
        [target.organization_id],
      );
      if (samplesResult.rows.length > 0) {
        console.log(JSON.stringify({ samples: samplesResult.rows }));
      }
      return;
    }

    if (CLEANUP || RESTORE_FREE) {
      await client.query('BEGIN');
      try {
        let removed = 0;
        if (CLEANUP) {
          const cleanupResult = await client.query(
            `DELETE FROM invoices
             WHERE organization_id = $1
               AND custom_fields @> '{"sample": true}'::jsonb`,
            [target.organization_id],
          );
          removed = cleanupResult.rowCount || 0;
        }
        if (RESTORE_FREE) {
          await restoreFree(client, target.organization_id);
        }
        await client.query('COMMIT');
        console.log(
          JSON.stringify({
            removed,
            freeRestored: RESTORE_FREE,
          }),
        );
        return;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    const invoiceDefinitions = [
      {
        invoiceNumber: 'SAMPLE-1001',
        contact: contactDetails(
          contacts[1] || contacts[0],
          'Jordan Lee',
          'jordan.lee@example.test',
        ),
        issueDate: dateFromNow(-1),
        dueDate: dateFromNow(29),
        status: 'draft',
        amountPaid: 0,
        notes: 'Draft proposal for the next phase of client success work.',
        paymentTerms: 'Net 30',
        createdAt: timestampFromNow(-1),
        items: [
          {
            name: 'CRM onboarding workshop',
            description: 'Discovery, workflow mapping, and team training',
            quantity: 1,
            unitPrice: 2400,
            taxRate: 8,
          },
          {
            name: 'Success playbook',
            description: 'Custom operating guide and launch checklist',
            quantity: 1,
            unitPrice: 1600,
            taxRate: 8,
          },
        ],
      },
      {
        invoiceNumber: 'SAMPLE-1002',
        contact: contactDetails(
          contacts[0],
          'Priya Shah',
          'priya.shah@example.test',
        ),
        issueDate: dateFromNow(-2),
        dueDate: dateFromNow(12),
        status: 'sent',
        amountPaid: 0,
        notes: 'Monthly operations retainer.',
        paymentTerms: 'Due in 14 days',
        sentAt: timestampFromNow(-2),
        createdAt: timestampFromNow(-2),
        items: [
          {
            name: 'Operations strategy retainer',
            description: 'Monthly planning, reporting, and advisory support',
            quantity: 1,
            unitPrice: 3250,
            taxRate: 0,
          },
        ],
      },
      {
        invoiceNumber: 'SAMPLE-1003',
        contact: contactDetails(
          contacts[2] || contacts[0],
          'Avery Morgan',
          'avery.morgan@example.test',
        ),
        issueDate: dateFromNow(-3),
        dueDate: dateFromNow(27),
        status: 'viewed',
        amountPaid: 0,
        notes: 'Strategy sprint scheduled for September.',
        paymentTerms: 'Net 30',
        sentAt: timestampFromNow(-3),
        viewedAt: timestampFromNow(-1),
        createdAt: timestampFromNow(-3),
        items: [
          {
            name: 'Product strategy sprint',
            description: 'Five-day facilitated strategy and positioning sprint',
            quantity: 1,
            unitPrice: 7200,
            taxRate: 8.25,
          },
        ],
      },
      {
        invoiceNumber: 'SAMPLE-1004',
        contact: contactDetails(
          contacts[1] || contacts[0],
          'Jordan Lee',
          'jordan.lee@example.test',
        ),
        issueDate: dateFromNow(-38),
        dueDate: dateFromNow(-8),
        status: 'partial',
        amountPaid: 2500,
        notes: 'Partial payment received; remaining balance is overdue.',
        paymentTerms: 'Net 30',
        sentAt: timestampFromNow(-38),
        viewedAt: timestampFromNow(-35),
        createdAt: timestampFromNow(-4),
        items: [
          {
            name: 'Implementation phase one',
            description: 'Configuration, migration, and initial rollout',
            quantity: 1,
            unitPrice: 6000,
            taxRate: 8,
          },
        ],
      },
      {
        invoiceNumber: 'SAMPLE-1005',
        contact: contactDetails(
          contacts[0],
          'Priya Shah',
          'priya.shah@example.test',
        ),
        issueDate: dateFromNow(-18),
        dueDate: dateFromNow(12),
        status: 'paid',
        amountPaid: 'full',
        notes: 'Paid discovery and roadmap engagement.',
        paymentTerms: 'Net 30',
        sentAt: timestampFromNow(-18),
        viewedAt: timestampFromNow(-16),
        paidAt: timestampFromNow(-3),
        createdAt: timestampFromNow(-5),
        items: [
          {
            name: 'Discovery and roadmap',
            description: 'Stakeholder interviews, audit, and prioritized roadmap',
            quantity: 1,
            unitPrice: 2800,
            taxRate: 8,
          },
        ],
      },
    ];

    await client.query('BEGIN');
    try {
      if (ENABLE_STUDIO) {
        await enableStudio(client, target.organization_id);
      }
      for (const definition of invoiceDefinitions) {
        const totals = calculate(definition.items);
        const amountPaid =
          definition.amountPaid === 'full' ? totals.total : definition.amountPaid;
        const amountDue = money(totals.total - amountPaid);
        const taxRate = Math.max(...definition.items.map((item) => item.taxRate));
        const invoiceResult = await client.query(
          `INSERT INTO invoices (
             organization_id, invoice_number, contact_id, business_id,
             customer_name, customer_email, customer_phone,
             issue_date, due_date, subtotal, tax_rate, tax_amount,
             discount_amount, discount_value, total, amount_paid, amount_due,
             currency, status, payment_terms, notes, sent_at, viewed_at, paid_at,
             custom_fields, created_by, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, 0,
             $13, $14, $15, 'USD', $16, $17, $18, $19, $20, $21,
             $22::jsonb, $23, $24, CURRENT_TIMESTAMP
           )
           ON CONFLICT (organization_id, invoice_number) DO UPDATE SET
             contact_id = EXCLUDED.contact_id,
             business_id = EXCLUDED.business_id,
             customer_name = EXCLUDED.customer_name,
             customer_email = EXCLUDED.customer_email,
             customer_phone = EXCLUDED.customer_phone,
             issue_date = EXCLUDED.issue_date,
             due_date = EXCLUDED.due_date,
             subtotal = EXCLUDED.subtotal,
             tax_rate = EXCLUDED.tax_rate,
             tax_amount = EXCLUDED.tax_amount,
             discount_amount = EXCLUDED.discount_amount,
             discount_value = EXCLUDED.discount_value,
             total = EXCLUDED.total,
             amount_paid = EXCLUDED.amount_paid,
             amount_due = EXCLUDED.amount_due,
             currency = EXCLUDED.currency,
             status = EXCLUDED.status,
             payment_terms = EXCLUDED.payment_terms,
             notes = EXCLUDED.notes,
             sent_at = EXCLUDED.sent_at,
             viewed_at = EXCLUDED.viewed_at,
             paid_at = EXCLUDED.paid_at,
             custom_fields = EXCLUDED.custom_fields,
             created_by = EXCLUDED.created_by,
             created_at = EXCLUDED.created_at,
             updated_at = CURRENT_TIMESTAMP
           RETURNING id`,
          [
            target.organization_id,
            definition.invoiceNumber,
            definition.contact.contactId,
            businessId,
            definition.contact.customerName,
            definition.contact.customerEmail,
            definition.contact.customerPhone,
            definition.issueDate,
            definition.dueDate,
            totals.subtotal,
            taxRate,
            totals.taxAmount,
            totals.total,
            amountPaid,
            amountDue,
            definition.status,
            definition.paymentTerms,
            definition.notes,
            definition.sentAt || null,
            definition.viewedAt || null,
            definition.paidAt || null,
            JSON.stringify({ sample: true, seed: 'sales-payments-ui' }),
            target.user_id,
            definition.createdAt,
          ],
        );
        const invoiceId = Number(invoiceResult.rows[0].id);
        await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);

        for (const [index, item] of definition.items.entries()) {
          const lineSubtotal = money(item.quantity * item.unitPrice);
          const taxAmount = money(lineSubtotal * (item.taxRate / 100));
          await client.query(
            `INSERT INTO invoice_items (
               invoice_id, organization_id, name, description, quantity,
               unit_price, tax_rate, tax_amount, discount_amount, total, sort_order
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10)`,
            [
              invoiceId,
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

    console.log(
      JSON.stringify({
        seeded: invoiceDefinitions.length,
        studioEnabled: ENABLE_STUDIO,
        invoiceNumbers: invoiceDefinitions.map((invoice) => invoice.invoiceNumber),
      }),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
