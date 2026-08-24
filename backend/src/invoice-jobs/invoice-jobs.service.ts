/**
 * Faithful port of the legacy daily invoice jobs
 * (backend/src/jobs/invoice-jobs.js): overdue detection, recurring
 * invoice generation, and estimate expiry. The recurring claim
 * re-reads the due template FOR UPDATE SKIP LOCKED inside its own
 * transaction, allocates the organization-scoped invoice number
 * through the shared payment_settings sequence, and advances or
 * completes the template exactly like the legacy job. The template
 * column list mirrors backend/src/routes/recurring-columns.js.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { paidEntitlementSql } from '../billing/paid-entitlement.sql';
import { PG_POOL } from '../database/database.module';

const RECURRING_TEMPLATE_COLUMNS = [
  'id',
  'organization_id',
  'template_name',
  'contact_id',
  'customer_name',
  'customer_email',
  'customer_phone',
  'customer_address',
  'frequency',
  'start_date',
  'end_date',
  'next_run_date',
  'last_generated_at',
  'status',
  'items',
  'subtotal',
  'tax_amount',
  'discount_amount',
  'discount_type',
  'discount_value',
  'total',
  'currency',
  'notes',
  'payment_terms',
  'custom_fields',
  'source_invoice_id',
  'created_by',
  'created_at',
  'updated_at',
];

const recurringTemplateColumns = (alias: string): string =>
  RECURRING_TEMPLATE_COLUMNS.map((column) => `${alias}.${column}`).join(', ');

type RecurringTemplateRow = {
  id: number;
  organization_id: number;
  template_name: string;
  contact_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  contact_email: string | null;
  frequency: string;
  end_date: string | Date | null;
  next_run_date: string | Date;
  items: unknown;
  subtotal: string;
  tax_amount: string;
  discount_amount: string;
  discount_type: string | null;
  discount_value: string;
  total: string;
  notes: string | null;
  payment_terms: string | number | null;
  created_by: number | null;
};

type RecurringItem = {
  product_id?: number | null;
  name?: string;
  description?: string | null;
  quantity?: number;
  unit_price?: number;
  tax_rate?: number;
};

export type OverdueInvoiceRow = {
  id: number;
  invoice_number: string;
  organization_id: number;
};

export type GeneratedInvoice = {
  template_id: number;
  template_name: string;
  invoice_id: number;
  invoice_number: string;
};

export type ExpiredEstimateRow = {
  id: number;
  estimate_number: string;
  organization_id: number;
};

export function calculateNextRunDate(
  currentDate: string | Date,
  frequency: string,
): string {
  const date = new Date(currentDate);
  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }
  return date.toISOString().split('T')[0];
}

const DEFAULT_INVOICE_PREFIX = 'INV-';

export async function allocateInvoiceNumber(
  client: PoolClient,
  organizationId: number,
): Promise<string> {
  const result = await client.query<{
    invoice_prefix: string;
    allocated_number: string;
  }>(
    `INSERT INTO payment_settings (organization_id, next_invoice_number)
     VALUES ($1, 2)
     ON CONFLICT (organization_id) DO UPDATE
     SET
       next_invoice_number = GREATEST(COALESCE(payment_settings.next_invoice_number, 1), 1) + 1,
       updated_at = CURRENT_TIMESTAMP
     RETURNING
       COALESCE(invoice_prefix, '${DEFAULT_INVOICE_PREFIX}') AS invoice_prefix,
       next_invoice_number - 1 AS allocated_number`,
    [organizationId],
  );
  const allocation = result.rows[0];
  if (!allocation) {
    throw new Error('Invoice number allocation returned no row');
  }
  const allocatedNumber = Number(allocation.allocated_number);
  if (!Number.isSafeInteger(allocatedNumber) || allocatedNumber < 1) {
    throw new Error('Invoice number allocation returned an invalid number');
  }
  return `${allocation.invoice_prefix || DEFAULT_INVOICE_PREFIX}${String(allocatedNumber).padStart(5, '0')}`;
}

@Injectable()
export class InvoiceJobsService {
  private readonly logger = new Logger(InvoiceJobsService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async runOverdueDetection(): Promise<OverdueInvoiceRow[]> {
    const result = await this.pool.query<OverdueInvoiceRow>(
      `UPDATE invoices
       SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
       WHERE status IN ('sent', 'viewed', 'partial')
       AND due_date < CURRENT_DATE
       AND amount_due > 0
       RETURNING id, invoice_number, organization_id`,
    );
    if (result.rows.length > 0) {
      this.logger.log(`Marked ${result.rows.length} invoices as overdue`);
    }
    return result.rows;
  }

  async runRecurringInvoiceGeneration(): Promise<GeneratedInvoice[]> {
    const client = await this.pool.connect();
    try {
      const templatesResult = await client.query<{ id: number }>(
        `SELECT r.id
         FROM recurring_invoice_templates r
         JOIN organizations organization ON organization.id = r.organization_id
         WHERE r.status = 'active'
         AND r.next_run_date <= CURRENT_DATE
         AND (r.end_date IS NULL OR r.end_date >= CURRENT_DATE)
         AND ${paidEntitlementSql('organization')}`,
      );

      const generated: GeneratedInvoice[] = [];
      for (const candidate of templatesResult.rows) {
        try {
          await client.query('BEGIN');
          const claimedResult = await client.query<RecurringTemplateRow>(
            `SELECT ${recurringTemplateColumns('r')}, c.email as contact_email
             FROM recurring_invoice_templates r
             JOIN organizations organization ON organization.id = r.organization_id
             LEFT JOIN contacts c ON r.contact_id = c.id
             WHERE r.id = $1
             AND r.status = 'active'
             AND r.next_run_date <= CURRENT_DATE
             AND (r.end_date IS NULL OR r.end_date >= CURRENT_DATE)
             AND ${paidEntitlementSql('organization')}
             FOR UPDATE OF r SKIP LOCKED`,
            [candidate.id],
          );
          if (claimedResult.rows.length === 0) {
            await client.query('ROLLBACK');
            continue;
          }

          const template = claimedResult.rows[0];
          const invoiceNumber = await allocateInvoiceNumber(
            client,
            template.organization_id,
          );

          const dueDate = new Date();
          dueDate.setDate(
            dueDate.getDate() +
              (template.payment_terms
                ? parseInt(String(template.payment_terms), 10)
                : 30),
          );

          const items: RecurringItem[] =
            typeof template.items === 'string'
              ? JSON.parse(template.items)
              : (template.items as RecurringItem[]);

          const invoiceResult = await client.query<{ id: number }>(
            `INSERT INTO invoices (
               organization_id, invoice_number, contact_id,
               customer_name, customer_email,
               due_date, subtotal, tax_amount, discount_amount, discount_type, discount_value,
               total, amount_due, notes, recurring_template_id, created_by
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING id`,
            [
              template.organization_id,
              invoiceNumber,
              template.contact_id,
              template.customer_name,
              template.customer_email || template.contact_email,
              dueDate.toISOString().split('T')[0],
              template.subtotal,
              template.tax_amount,
              template.discount_amount,
              template.discount_type,
              template.discount_value,
              template.total,
              template.total,
              template.notes,
              template.id,
              template.created_by,
            ],
          );
          const invoiceId = invoiceResult.rows[0].id;

          if (items && items.length > 0) {
            const invoiceIds: number[] = [];
            const orgIds: number[] = [];
            const productIds: Array<number | null> = [];
            const names: Array<string | undefined> = [];
            const descriptions: Array<string | null> = [];
            const quantities: number[] = [];
            const unitPrices: number[] = [];
            const taxRates: number[] = [];
            const taxAmounts: number[] = [];
            const totals: number[] = [];
            const sortOrders: number[] = [];

            for (let index = 0; index < items.length; index += 1) {
              const item = items[index];
              const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
              const itemTax = itemTotal * ((item.tax_rate || 0) / 100);
              invoiceIds.push(invoiceId);
              orgIds.push(template.organization_id);
              productIds.push(item.product_id || null);
              names.push(item.name);
              descriptions.push(item.description || null);
              quantities.push(item.quantity || 1);
              unitPrices.push(item.unit_price || 0);
              taxRates.push(item.tax_rate || 0);
              taxAmounts.push(itemTax);
              totals.push(itemTotal + itemTax);
              sortOrders.push(index);
            }

            await client.query(
              `INSERT INTO invoice_items (
                 invoice_id, organization_id, product_id, name, description,
                 quantity, unit_price, tax_rate, tax_amount, total, sort_order
               )
               SELECT
                 u.invoice_id, u.organization_id, u.product_id, u.name, u.description,
                 u.quantity, u.unit_price, u.tax_rate, u.tax_amount, u.total, u.sort_order
               FROM UNNEST (
                 $1::int[], $2::int[], $3::int[], $4::varchar[], $5::text[],
                 $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[], $11::int[]
               ) AS u(
                 invoice_id, organization_id, product_id, name, description,
                 quantity, unit_price, tax_rate, tax_amount, total, sort_order
               )`,
              [
                invoiceIds,
                orgIds,
                productIds,
                names,
                descriptions,
                quantities,
                unitPrices,
                taxRates,
                taxAmounts,
                totals,
                sortOrders,
              ],
            );
          }

          const nextRunDate = calculateNextRunDate(
            template.next_run_date,
            template.frequency,
          );
          const isCompleted =
            template.end_date &&
            new Date(nextRunDate) > new Date(template.end_date);

          await client.query(
            `UPDATE recurring_invoice_templates
             SET
               next_run_date = $1,
               last_generated_at = CURRENT_TIMESTAMP,
               status = $2,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $3 AND organization_id = $4`,
            [
              isCompleted ? template.end_date : nextRunDate,
              isCompleted ? 'completed' : 'active',
              template.id,
              template.organization_id,
            ],
          );
          await client.query('COMMIT');

          generated.push({
            template_id: template.id,
            template_name: template.template_name,
            invoice_id: invoiceId,
            invoice_number: invoiceNumber,
          });
          this.logger.log(
            `Generated invoice ${invoiceNumber} from recurring template ${template.template_name}`,
          );
        } catch (templateError) {
          await client.query('ROLLBACK');
          this.logger.error(
            `Error generating invoice from template ${candidate.id}: ${
              (templateError as Error).message
            }`,
          );
        }
      }
      return generated;
    } finally {
      client.release();
    }
  }

  async runEstimateExpiryCheck(): Promise<ExpiredEstimateRow[]> {
    const result = await this.pool.query<ExpiredEstimateRow>(
      `UPDATE estimates
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'sent'
       AND valid_until < CURRENT_DATE
       RETURNING id, estimate_number, organization_id`,
    );
    if (result.rows.length > 0) {
      this.logger.log(`Marked ${result.rows.length} estimates as expired`);
    }
    return result.rows;
  }

  async runAll(): Promise<void> {
    await this.runOverdueDetection();
    await this.runRecurringInvoiceGeneration();
    await this.runEstimateExpiryCheck();
  }
}
