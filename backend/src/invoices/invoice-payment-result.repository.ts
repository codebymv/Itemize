import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export type PublicInvoicePaymentResultRow = {
  invoice_number: string;
  business_name: string;
  amount: string;
  currency: string;
  status: string;
  updated_at: Date;
};

@Injectable()
export class InvoicePaymentResultRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findBySessionId(sessionId: string): Promise<PublicInvoicePaymentResultRow | null> {
    const result = await this.pool.query<PublicInvoicePaymentResultRow>(
      `SELECT intent.invoice_number,
              COALESCE(NULLIF(BTRIM(business.name), ''),
                       NULLIF(BTRIM(organization.name), ''), 'Itemize workspace') AS business_name,
              intent.amount_due AS amount,
              intent.currency,
              intent.status,
              intent.updated_at
       FROM invoice_payment_link_intents intent
       JOIN invoices invoice
         ON invoice.id = intent.invoice_id
        AND invoice.organization_id = intent.organization_id
       JOIN organizations organization ON organization.id = intent.organization_id
       LEFT JOIN businesses business
         ON business.id = invoice.business_id
        AND business.organization_id = intent.organization_id
       WHERE intent.provider_session_id = $1
       ORDER BY intent.created_at DESC
       LIMIT 1`,
      [sessionId],
    );
    return result.rows[0] ?? null;
  }
}
