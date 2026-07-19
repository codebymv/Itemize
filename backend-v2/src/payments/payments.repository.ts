import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PaymentMethod, PaymentStatus } from './payment.types';

export type PaymentRow = {
  id: number;
  organization_id: number;
  invoice_id: number | null;
  invoice_number: string | null;
  contact_id: number | null;
  contact_name: string | null;
  amount: string;
  currency: string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  stripe_payment_intent_id: string | null;
  card_last4: string | null;
  card_brand: string | null;
  description: string | null;
  notes: string | null;
  receipt_url: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class PaymentsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(
    organizationId: number,
    pageSize: number,
    offset: number,
    status?: PaymentStatus,
    paymentMethod?: PaymentMethod,
  ): Promise<{ rows: PaymentRow[]; total: number }> {
    const values: unknown[] = [organizationId];
    const predicates = ['p.organization_id = $1'];
    if (status !== undefined) {
      values.push(status);
      predicates.push(`p.status = $${values.length}`);
    }
    if (paymentMethod !== undefined) {
      values.push(paymentMethod);
      predicates.push(`p.payment_method = $${values.length}`);
    }
    const where = predicates.join(' AND ');
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM payments p WHERE ${where}`,
      values,
    );
    values.push(pageSize, offset);
    const rows = await this.pool.query<PaymentRow>(
      `SELECT
         p.id, p.organization_id, p.invoice_id, i.invoice_number,
         p.contact_id,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), i.customer_name)
           AS contact_name,
         p.amount, p.currency, p.payment_method, p.status,
         p.stripe_payment_intent_id, p.card_last4, p.card_brand,
         p.description, p.notes, p.receipt_url, p.paid_at,
         p.created_at, p.updated_at
       FROM payments p
       LEFT JOIN invoices i
         ON i.id = p.invoice_id AND i.organization_id = p.organization_id
       LEFT JOIN contacts c
         ON c.id = p.contact_id AND c.organization_id = p.organization_id
       WHERE ${where}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { rows: rows.rows, total: Number(count.rows[0].total) };
  }
}
