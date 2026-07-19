import api from '@/lib/api';
import {
  graphqlRequest,
  isPaymentGraphqlReadsEnabled,
} from './graphqlClient';

export interface InvoicePayment {
  id: number;
  organization_id: number;
  invoice_id?: number;
  invoice_number?: string;
  contact_id?: number;
  contact_name?: string;
  first_name?: string;
  last_name?: string;
  amount: number;
  currency: string;
  payment_method: 'card' | 'stripe' | 'bank_transfer' | 'cash' | 'check' | 'other';
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
  stripe_payment_intent_id?: string;
  card_last4?: string;
  card_brand?: string;
  description?: string;
  notes?: string;
  receipt_url?: string;
  paid_at?: string;
  created_at: string;
  updated_at?: string;
}

type PaymentFilters = {
  status?: string;
  payment_method?: string;
};

type GraphqlPayment = {
  id: number;
  organizationId: number;
  invoiceId: number | null;
  invoiceNumber: string | null;
  contactId: number | null;
  contactName: string | null;
  amount: string;
  currency: string;
  paymentMethod: InvoicePayment['payment_method'];
  status: InvoicePayment['status'];
  stripePaymentIntentId: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
  description: string | null;
  notes: string | null;
  receiptUrl: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const fields = `
  id organizationId invoiceId invoiceNumber contactId contactName amount currency
  paymentMethod status stripePaymentIntentId cardLast4 cardBrand description notes
  receiptUrl paidAt createdAt updatedAt
`;

const mapPayment = (payment: GraphqlPayment): InvoicePayment => ({
  id: payment.id,
  organization_id: payment.organizationId,
  ...(payment.invoiceId === null ? {} : { invoice_id: payment.invoiceId }),
  ...(payment.invoiceNumber === null ? {} : { invoice_number: payment.invoiceNumber }),
  ...(payment.contactId === null ? {} : { contact_id: payment.contactId }),
  ...(payment.contactName === null ? {} : { contact_name: payment.contactName }),
  amount: Number(payment.amount),
  currency: payment.currency,
  payment_method: payment.paymentMethod,
  status: payment.status,
  ...(payment.stripePaymentIntentId === null
    ? {}
    : { stripe_payment_intent_id: payment.stripePaymentIntentId }),
  ...(payment.cardLast4 === null ? {} : { card_last4: payment.cardLast4 }),
  ...(payment.cardBrand === null ? {} : { card_brand: payment.cardBrand }),
  ...(payment.description === null ? {} : { description: payment.description }),
  ...(payment.notes === null ? {} : { notes: payment.notes }),
  ...(payment.receiptUrl === null ? {} : { receipt_url: payment.receiptUrl }),
  ...(payment.paidAt === null ? {} : { paid_at: payment.paidAt }),
  created_at: payment.createdAt,
  updated_at: payment.updatedAt,
});

const enumValue = (value?: string): string | undefined =>
  value === undefined ? undefined : value.toUpperCase();

export const getInvoicePayments = async (
  organizationId: number,
  filters: PaymentFilters = {},
): Promise<InvoicePayment[]> => {
  if (!isPaymentGraphqlReadsEnabled()) {
    const response = await api.get('/api/invoices/payments', {
      params: filters,
      headers: { 'x-organization-id': organizationId.toString() },
    });
    const payments = response.data.payments || response.data || [];
    return Array.isArray(payments) ? payments : [];
  }
  const data = await graphqlRequest<
    { payments: { nodes: GraphqlPayment[] } },
    {
      page: { page: number; pageSize: number };
      status?: string;
      paymentMethod?: string;
    }
  >(
    `query Payments(
      $page: PageInput,
      $status: PaymentStatus,
      $paymentMethod: PaymentMethod
    ) {
      payments(page: $page, status: $status, paymentMethod: $paymentMethod) {
        nodes { ${fields} }
      }
    }`,
    {
      page: { page: 1, pageSize: 50 },
      ...(filters.status ? { status: enumValue(filters.status) } : {}),
      ...(filters.payment_method
        ? { paymentMethod: enumValue(filters.payment_method) }
        : {}),
    },
    organizationId,
  );
  return data.payments.nodes.map(mapPayment);
};

export const createInvoicePayment = async (
  organizationId: number,
  payment: Record<string, unknown>,
): Promise<void> => {
  await api.post(
    '/api/invoices/payments',
    payment,
    { headers: { 'x-organization-id': organizationId.toString() } },
  );
};
