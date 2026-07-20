import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type InvoiceSettingsRow = {
  id: number;
  organization_id: number;
  stripe_account_id: string | null;
  stripe_publishable_key: string | null;
  stripe_connected: boolean;
  stripe_connected_at: Date | null;
  invoice_prefix: string;
  next_invoice_number: number;
  default_payment_terms: number;
  default_notes: string | null;
  default_terms: string | null;
  default_tax_rate: string;
  tax_id: string | null;
  business_name: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_email: string | null;
  logo_url: string | null;
  default_currency: string;
  created_at: Date;
  updated_at: Date;
};

export type InvoiceSettingsValues = {
  invoicePrefix?: string;
  nextInvoiceNumber?: number;
  defaultPaymentTerms?: number;
  defaultNotes?: string | null;
  defaultTerms?: string | null;
  defaultTaxRate?: string;
  taxId?: string | null;
  businessName?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  defaultCurrency?: string;
};

export type InvoiceSettingsWriteOutcome =
  | { kind: 'saved'; row: InvoiceSettingsRow }
  | { kind: 'counter-regression'; current: number }
  | { kind: 'invoice-number-conflict'; invoiceNumber: string };

const selection = `
  id, organization_id, stripe_account_id, stripe_publishable_key,
  stripe_connected, stripe_connected_at, invoice_prefix,
  next_invoice_number, default_payment_terms, default_notes, default_terms,
  default_tax_rate, tax_id, business_name, business_address, business_phone,
  business_email, logo_url, default_currency, created_at, updated_at`;

@Injectable()
export class InvoiceSettingsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async find(organizationId: number): Promise<InvoiceSettingsRow | null> {
    const result = await this.pool.query<InvoiceSettingsRow>(
      `SELECT ${selection}
       FROM payment_settings
       WHERE organization_id = $1`,
      [organizationId],
    );
    return result.rows[0] ?? null;
  }

  async update(
    organizationId: number,
    values: InvoiceSettingsValues,
  ): Promise<InvoiceSettingsWriteOutcome> {
    return this.transaction(async (client) => {
      await client.query(
        `INSERT INTO payment_settings (
           organization_id, invoice_prefix, next_invoice_number,
           default_payment_terms, default_tax_rate, default_currency
         ) VALUES ($1, 'INV-', 1, 30, 10, 'USD')
         ON CONFLICT (organization_id) DO NOTHING`,
        [organizationId],
      );
      const locked = await client.query<InvoiceSettingsRow>(
        `SELECT ${selection}
         FROM payment_settings
         WHERE organization_id = $1
         FOR UPDATE`,
        [organizationId],
      );
      const current = locked.rows[0];
      if (
        values.nextInvoiceNumber !== undefined &&
        values.nextInvoiceNumber < Number(current.next_invoice_number)
      ) {
        return {
          kind: 'counter-regression',
          current: Number(current.next_invoice_number),
        };
      }
      const effectivePrefix = values.invoicePrefix ?? current.invoice_prefix;
      const effectiveNumber = values.nextInvoiceNumber ?? Number(current.next_invoice_number);
      if (
        values.invoicePrefix !== undefined ||
        values.nextInvoiceNumber !== undefined
      ) {
        const invoiceNumber =
          `${effectivePrefix}${String(effectiveNumber).padStart(5, '0')}`;
        const collision = await client.query(
          `SELECT 1 FROM invoices
           WHERE organization_id = $1 AND invoice_number = $2`,
          [organizationId, invoiceNumber],
        );
        if (collision.rows[0]) {
          return { kind: 'invoice-number-conflict', invoiceNumber };
        }
      }

      const parameters: unknown[] = [organizationId];
      const assignments: string[] = [];
      const set = (column: string, value: unknown) => {
        parameters.push(value);
        assignments.push(`${column} = $${parameters.length}`);
      };
      if (values.invoicePrefix !== undefined) set('invoice_prefix', values.invoicePrefix);
      if (values.nextInvoiceNumber !== undefined) {
        set('next_invoice_number', values.nextInvoiceNumber);
      }
      if (values.defaultPaymentTerms !== undefined) {
        set('default_payment_terms', values.defaultPaymentTerms);
      }
      if (values.defaultNotes !== undefined) set('default_notes', values.defaultNotes);
      if (values.defaultTerms !== undefined) set('default_terms', values.defaultTerms);
      if (values.defaultTaxRate !== undefined) {
        set('default_tax_rate', values.defaultTaxRate);
      }
      if (values.taxId !== undefined) set('tax_id', values.taxId);
      if (values.businessName !== undefined) set('business_name', values.businessName);
      if (values.businessAddress !== undefined) {
        set('business_address', values.businessAddress);
      }
      if (values.businessPhone !== undefined) set('business_phone', values.businessPhone);
      if (values.businessEmail !== undefined) set('business_email', values.businessEmail);
      if (values.defaultCurrency !== undefined) {
        set('default_currency', values.defaultCurrency);
      }
      if (assignments.length > 0) {
        await client.query(
          `UPDATE payment_settings
           SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
           WHERE organization_id = $1`,
          parameters,
        );
      }
      const saved = await client.query<InvoiceSettingsRow>(
        `SELECT ${selection}
         FROM payment_settings
         WHERE organization_id = $1`,
        [organizationId],
      );
      return { kind: 'saved', row: saved.rows[0] };
    });
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
