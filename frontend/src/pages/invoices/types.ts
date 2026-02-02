export interface Invoice {
  id: number;
  invoice_number: string;
  contact_id: number;
  contact_first_name?: string;
  contact_last_name?: string;
  customer_name?: string;
  customer_email?: string;
  currency?: string;
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'partial' | 'overdue' | 'cancelled';
  total: number;
  amount_paid: number;
  amount_due: number;
  due_date: string;
  sent_at?: string;
  paid_at?: string;
  created_at: string;
  is_recurring_source?: boolean;
  recurring_template_id?: number;
  recurring_schedule?: string;
}

export type InvoiceStatus = Invoice['status'];