const { Pool } = require('pg');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL?.trim();
const DRY_RUN = process.argv.includes('--dry-run');
const CLEANUP = process.argv.includes('--cleanup');
const DAY_MS = 24 * 60 * 60 * 1000;
const SEED = 'recurring-invoices-ui';

function dateFromNow(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

function timestampFromNow(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function money(value) {
  return Number(value.toFixed(2));
}

function contactDetails(contact, fallbackName, fallbackEmail) {
  return {
    contactId: contact ? Number(contact.id) : null,
    customerName: contact
      ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || fallbackName
      : fallbackName,
    customerEmail: contact?.email || fallbackEmail,
  };
}

function totals(items) {
  const subtotal = money(items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  ));
  const taxAmount = money(items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice * item.taxRate / 100,
    0,
  ));
  return { subtotal, taxAmount, total: money(subtotal + taxAmount) };
}

async function resolveTarget(client) {
  const result = await client.query(
    `SELECT u.id AS user_id, u.email, o.id AS organization_id,
            o.name AS organization_name, o.plan
     FROM users u
     JOIN organization_members om ON om.user_id = u.id
     JOIN organizations o ON o.id = om.organization_id
     WHERE lower(u.email) = lower($1)
     ORDER BY (o.id = u.default_organization_id) DESC, om.joined_at, o.id
     LIMIT 1`,
    [OWNER_EMAIL],
  );
  if (!result.rows[0]) throw new Error(`No organization found for ${OWNER_EMAIL}`);
  return result.rows[0];
}

async function removeSamples(client, organizationId) {
  const invoices = await client.query(
    `DELETE FROM invoices
     WHERE organization_id = $1
       AND custom_fields @> $2::jsonb`,
    [organizationId, JSON.stringify({ sample: true, seed: SEED })],
  );
  const schedules = await client.query(
    `DELETE FROM recurring_invoice_templates
     WHERE organization_id = $1
       AND custom_fields @> $2::jsonb`,
    [organizationId, JSON.stringify({ sample: true, seed: SEED })],
  );
  return {
    invoices: invoices.rowCount || 0,
    schedules: schedules.rowCount || 0,
  };
}

async function main() {
  if (!OWNER_EMAIL) throw new Error('SEED_OWNER_EMAIL is required');
  const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_PUBLIC_URL or DATABASE_URL is required');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    const target = await resolveTarget(client);
    const contacts = (await client.query(
      `SELECT id, first_name, last_name, email
       FROM contacts
       WHERE organization_id = $1
       ORDER BY id
       LIMIT 3`,
      [target.organization_id],
    )).rows;
    const existing = (await client.query(
      `SELECT template_name, status, frequency, next_run_date::text
       FROM recurring_invoice_templates
       WHERE organization_id = $1
         AND custom_fields @> $2::jsonb
       ORDER BY created_at, id`,
      [target.organization_id, JSON.stringify({ sample: true, seed: SEED })],
    )).rows;

    console.log(JSON.stringify({
      mode: DRY_RUN ? 'dry-run' : CLEANUP ? 'cleanup' : 'seed',
      organizationId: Number(target.organization_id),
      organization: target.organization_name,
      plan: target.plan,
      contactsAvailable: contacts.length,
      existingSamples: existing,
    }));
    if (DRY_RUN) return;

    await client.query('BEGIN');
    try {
      const removed = await removeSamples(client, target.organization_id);
      if (CLEANUP) {
        await client.query('COMMIT');
        console.log(JSON.stringify({ removed }));
        return;
      }

      const definitions = [
        {
          name: 'Monthly Client Success Retainer',
          contact: contactDetails(contacts[0], 'Avery Morgan', 'avery@example.test'),
          frequency: 'monthly', status: 'active', start: -64, next: 4,
          notes: 'Monthly strategy, reporting, and client success support.',
          items: [{ name: 'Client success retainer', description: 'Strategy, reporting, and advisory support', quantity: 1, unitPrice: 3250, taxRate: 0 }],
          history: [{ days: -31, status: 'paid' }, { days: -3, status: 'sent' }],
        },
        {
          name: 'Weekly Content Production',
          contact: contactDetails(contacts[1] || contacts[0], 'Jordan Lee', 'jordan@example.test'),
          frequency: 'weekly', status: 'active', start: -20, next: 2,
          notes: 'Weekly production and distribution package.',
          items: [{ name: 'Content production', description: 'Writing, design, and distribution', quantity: 4, unitPrice: 300, taxRate: 0 }],
          history: [{ days: -5, status: 'paid' }],
        },
        {
          name: 'Quarterly Growth Strategy',
          contact: contactDetails(contacts[2] || contacts[0], 'Priya Shah', 'priya@example.test'),
          frequency: 'quarterly', status: 'active', start: 36, next: 36,
          notes: 'Quarterly planning, research, and growth roadmap.',
          items: [{ name: 'Growth strategy engagement', description: 'Research, workshop, and roadmap', quantity: 1, unitPrice: 4500, taxRate: 0 }],
          history: [],
        },
        {
          name: 'CRM Optimization Support',
          contact: contactDetails(contacts[1] || contacts[0], 'Jordan Lee', 'jordan@example.test'),
          frequency: 'monthly', status: 'paused', start: -45, next: 12,
          notes: 'Temporarily paused while the client reviews scope.',
          items: [{ name: 'CRM optimization', description: 'Automation maintenance and reporting', quantity: 1, unitPrice: 1800, taxRate: 8 }],
          history: [{ days: -18, status: 'paid' }],
        },
        {
          name: 'Launch Reporting Package',
          contact: contactDetails(contacts[2] || contacts[0], 'Priya Shah', 'priya@example.test'),
          frequency: 'monthly', status: 'completed', start: -100, end: -10, next: null,
          notes: 'Three-month reporting package completed successfully.',
          items: [{ name: 'Launch reporting', description: 'Performance dashboard and monthly analysis', quantity: 1, unitPrice: 950, taxRate: 0 }],
          history: [{ days: -70, status: 'paid' }, { days: -40, status: 'paid' }],
        },
      ];

      let generatedCount = 0;
      for (const [definitionIndex, definition] of definitions.entries()) {
        const amounts = totals(definition.items);
        const lastHistory = definition.history.at(-1);
        const scheduleResult = await client.query(
          `INSERT INTO recurring_invoice_templates (
             organization_id, template_name, contact_id, customer_name,
             customer_email, frequency, start_date, end_date, next_run_date,
             last_generated_at, status, items, subtotal, tax_amount,
             discount_amount, discount_value, total, currency, notes,
             payment_terms, custom_fields, created_by, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7::date, $8::date, $9::date,
             $10, $11, $12::jsonb, $13, $14, 0, 0, $15, 'USD', $16,
             'Net 14', $17::jsonb, $18, $19, CURRENT_TIMESTAMP
           ) RETURNING id`,
          [
            target.organization_id,
            definition.name,
            definition.contact.contactId,
            definition.contact.customerName,
            definition.contact.customerEmail,
            definition.frequency,
            dateFromNow(definition.start),
            definition.end === undefined ? null : dateFromNow(definition.end),
            definition.next === null ? null : dateFromNow(definition.next),
            lastHistory ? timestampFromNow(lastHistory.days) : null,
            definition.status,
            JSON.stringify(definition.items.map((item) => ({
              product_id: null,
              name: item.name,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unitPrice,
              tax_rate: item.taxRate,
            }))),
            amounts.subtotal,
            amounts.taxAmount,
            amounts.total,
            definition.notes,
            JSON.stringify({ sample: true, seed: SEED }),
            target.user_id,
            timestampFromNow(definition.start),
          ],
        );
        const scheduleId = Number(scheduleResult.rows[0].id);

        for (const [historyIndex, history] of definition.history.entries()) {
          generatedCount += 1;
          const invoiceNumber = `RECUR-SAMPLE-${definitionIndex + 1}${historyIndex + 1}`;
          const paid = history.status === 'paid' ? amounts.total : 0;
          const invoiceResult = await client.query(
            `INSERT INTO invoices (
               organization_id, invoice_number, contact_id, customer_name,
               customer_email, issue_date, due_date, subtotal, tax_amount,
               discount_amount, discount_value, total, amount_paid, amount_due,
               currency, status, payment_terms, notes, paid_at,
               recurring_template_id, custom_fields, created_by, created_at, updated_at
             ) VALUES (
               $1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, 0, 0,
               $10, $11, $12, 'USD', $13, 'Net 14', $14, $15,
               $16, $17::jsonb, $18, $19, $19
             ) RETURNING id`,
            [
              target.organization_id,
              invoiceNumber,
              definition.contact.contactId,
              definition.contact.customerName,
              definition.contact.customerEmail,
              dateFromNow(history.days),
              dateFromNow(history.days + 14),
              amounts.subtotal,
              amounts.taxAmount,
              amounts.total,
              paid,
              money(amounts.total - paid),
              history.status,
              definition.notes,
              history.status === 'paid' ? timestampFromNow(history.days + 3) : null,
              scheduleId,
              JSON.stringify({ sample: true, seed: SEED }),
              target.user_id,
              timestampFromNow(history.days),
            ],
          );
          const invoiceId = Number(invoiceResult.rows[0].id);
          for (const [itemIndex, item] of definition.items.entries()) {
            const lineSubtotal = money(item.quantity * item.unitPrice);
            const taxAmount = money(lineSubtotal * item.taxRate / 100);
            await client.query(
              `INSERT INTO invoice_items (
                 invoice_id, organization_id, name, description, quantity,
                 unit_price, tax_rate, tax_amount, discount_amount, total, sort_order
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10)`,
              [invoiceId, target.organization_id, item.name, item.description,
                item.quantity, item.unitPrice, item.taxRate, taxAmount,
                money(lineSubtotal + taxAmount), itemIndex],
            );
          }
        }
      }

      await client.query('COMMIT');
      console.log(JSON.stringify({
        seededSchedules: definitions.length,
        seededGeneratedInvoices: generatedCount,
        scheduleNames: definitions.map((definition) => definition.name),
      }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
