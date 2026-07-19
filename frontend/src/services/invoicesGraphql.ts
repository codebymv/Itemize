import type { JsonRecord } from '@/types';
import type { Invoice, InvoiceItem, Payment } from './invoicesApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlInvoiceItem = {
  id: number;
  invoiceId: number;
  productId: number | null;
  name: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  taxAmount: string;
  discountAmount: string;
  total: string;
  sortOrder: number;
  productName: string | null;
};

type GraphqlInvoice = {
  id: number;
  organizationId: number;
  invoiceNumber: string;
  contactId: number | null;
  businessId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  issueDate: string;
  dueDate: string;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  discountAmount: string;
  discountType: Invoice['discount_type'] | null;
  discountValue: string;
  total: string;
  amountPaid: string;
  amountDue: string;
  currency: string;
  status: Invoice['status'];
  paymentTerms: string | null;
  paymentInstructions: string | null;
  notes: string | null;
  termsAndConditions: string | null;
  stripeInvoiceId: string | null;
  stripePaymentIntentId: string | null;
  stripeHostedInvoiceUrl: string | null;
  stripePdfUrl: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  paidAt: string | null;
  isRecurring: boolean;
  recurringInterval: string | null;
  parentInvoiceId: number | null;
  customFields: JsonRecord;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  items?: GraphqlInvoiceItem[];
  payments?: Array<{
    id: number;
    amount: string;
    currency: string;
    paymentMethod: string;
    status: string;
    notes: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
  business?: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    logoUrl: string | null;
  } | null;
};

const coreFields = `
  id organizationId invoiceNumber contactId businessId customerName
  customerEmail customerPhone customerAddress issueDate dueDate subtotal
  taxRate taxAmount discountAmount discountType discountValue total
  amountPaid amountDue currency status paymentTerms paymentInstructions notes
  termsAndConditions stripeInvoiceId stripePaymentIntentId
  stripeHostedInvoiceUrl stripePdfUrl sentAt viewedAt paidAt isRecurring
  recurringInterval parentInvoiceId customFields createdById createdAt
  updatedAt contactFirstName contactLastName contactEmail
`;

const detailFields = `
  ${coreFields}
  items {
    id invoiceId productId name description quantity unitPrice taxRate
    taxAmount discountAmount total sortOrder productName
  }
  payments {
    id amount currency paymentMethod status notes paidAt createdAt
  }
  business { id name email phone address taxId logoUrl }
`;

const optional = <T extends object, K extends keyof T>(
  key: K,
  value: T[K] | null,
): Partial<T> =>
  value === null ? {} : ({ [key]: value } as unknown as Partial<T>);

const mapItem = (item: GraphqlInvoiceItem): InvoiceItem => ({
  id: item.id,
  invoice_id: item.invoiceId,
  ...optional<InvoiceItem, 'product_id'>('product_id', item.productId),
  name: item.name,
  ...optional<InvoiceItem, 'description'>('description', item.description),
  quantity: Number(item.quantity),
  unit_price: Number(item.unitPrice),
  tax_rate: Number(item.taxRate),
  tax_amount: Number(item.taxAmount),
  discount_amount: Number(item.discountAmount),
  total: Number(item.total),
  sort_order: item.sortOrder,
  ...optional<InvoiceItem, 'product_name'>('product_name', item.productName),
});

const mapInvoice = (invoice: GraphqlInvoice): Invoice => ({
  id: invoice.id,
  organization_id: invoice.organizationId,
  invoice_number: invoice.invoiceNumber,
  ...optional<Invoice, 'contact_id'>('contact_id', invoice.contactId),
  ...optional<Invoice, 'business_id'>('business_id', invoice.businessId),
  ...optional<Invoice, 'customer_name'>('customer_name', invoice.customerName),
  ...optional<Invoice, 'customer_email'>('customer_email', invoice.customerEmail),
  ...optional<Invoice, 'customer_phone'>('customer_phone', invoice.customerPhone),
  ...optional<Invoice, 'customer_address'>(
    'customer_address',
    invoice.customerAddress,
  ),
  issue_date: invoice.issueDate,
  due_date: invoice.dueDate,
  subtotal: Number(invoice.subtotal),
  tax_amount: Number(invoice.taxAmount),
  discount_amount: Number(invoice.discountAmount),
  ...optional<Invoice, 'discount_type'>('discount_type', invoice.discountType),
  discount_value: Number(invoice.discountValue),
  total: Number(invoice.total),
  amount_paid: Number(invoice.amountPaid),
  amount_due: Number(invoice.amountDue),
  currency: invoice.currency,
  status: invoice.status,
  ...optional<Invoice, 'payment_terms'>('payment_terms', invoice.paymentTerms),
  ...optional<Invoice, 'payment_instructions'>(
    'payment_instructions',
    invoice.paymentInstructions,
  ),
  ...optional<Invoice, 'notes'>('notes', invoice.notes),
  ...optional<Invoice, 'terms_and_conditions'>(
    'terms_and_conditions',
    invoice.termsAndConditions,
  ),
  ...optional<Invoice, 'stripe_invoice_id'>(
    'stripe_invoice_id',
    invoice.stripeInvoiceId,
  ),
  ...optional<Invoice, 'stripe_payment_intent_id'>(
    'stripe_payment_intent_id',
    invoice.stripePaymentIntentId,
  ),
  ...optional<Invoice, 'stripe_hosted_invoice_url'>(
    'stripe_hosted_invoice_url',
    invoice.stripeHostedInvoiceUrl,
  ),
  ...optional<Invoice, 'stripe_pdf_url'>('stripe_pdf_url', invoice.stripePdfUrl),
  ...optional<Invoice, 'sent_at'>('sent_at', invoice.sentAt),
  ...optional<Invoice, 'viewed_at'>('viewed_at', invoice.viewedAt),
  ...optional<Invoice, 'paid_at'>('paid_at', invoice.paidAt),
  is_recurring: invoice.isRecurring,
  ...optional<Invoice, 'recurring_interval'>(
    'recurring_interval',
    invoice.recurringInterval,
  ),
  ...optional<Invoice, 'parent_invoice_id'>(
    'parent_invoice_id',
    invoice.parentInvoiceId,
  ),
  custom_fields: invoice.customFields,
  ...optional<Invoice, 'created_by'>('created_by', invoice.createdById),
  created_at: invoice.createdAt,
  updated_at: invoice.updatedAt,
  ...optional<Invoice, 'contact_first_name'>(
    'contact_first_name',
    invoice.contactFirstName,
  ),
  ...optional<Invoice, 'contact_last_name'>(
    'contact_last_name',
    invoice.contactLastName,
  ),
  ...optional<Invoice, 'contact_email'>('contact_email', invoice.contactEmail),
  ...(invoice.items ? { items: invoice.items.map(mapItem) } : {}),
  ...(invoice.payments
    ? {
        payments: invoice.payments.map((payment) => ({
          id: payment.id,
          organization_id: invoice.organizationId,
          invoice_id: invoice.id,
          amount: Number(payment.amount),
          currency: payment.currency,
          payment_method:
            payment.paymentMethod.toLowerCase() as Payment['payment_method'],
          status:
            payment.status.toLowerCase() as Payment['status'],
          ...(payment.notes === null ? {} : { notes: payment.notes }),
          ...(payment.paidAt === null ? {} : { paid_at: payment.paidAt }),
          refund_amount: 0,
          created_at: payment.createdAt,
          updated_at: payment.createdAt,
        })),
      }
    : {}),
  ...(invoice.business === undefined || invoice.business === null
    ? {}
    : {
        business: {
          id: invoice.business.id,
          organization_id: invoice.organizationId,
          name: invoice.business.name,
          ...optional('email', invoice.business.email),
          ...optional('phone', invoice.business.phone),
          ...optional('address', invoice.business.address),
          ...optional('tax_id', invoice.business.taxId),
          ...optional('logo_url', invoice.business.logoUrl),
          is_active: true,
          created_at: invoice.createdAt,
          updated_at: invoice.updatedAt,
        },
      }),
});

type WritableInvoice = Parameters<typeof mapMutationInput>[0];

function mapItems(items: InvoiceItem[]) {
  return items.map((item) => ({
    ...(item.product_id === undefined ? {} : { productId: item.product_id }),
    name: item.name,
    ...(item.description === undefined ? {} : { description: item.description }),
    quantity: String(item.quantity ?? 1),
    unitPrice: String(item.unit_price ?? 0),
    taxRate: String(item.tax_rate ?? 0),
  }));
}

function mapMutationInput(invoice: {
  contact_id?: number;
  business_id?: number;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  issue_date?: string;
  due_date?: string;
  items?: InvoiceItem[];
  discount_type?: Invoice['discount_type'];
  discount_value?: number;
  tax_rate?: number;
  notes?: string;
  terms_and_conditions?: string;
  payment_terms?: number | string;
}) {
  return {
    ...(invoice.contact_id === undefined ? {} : { contactId: invoice.contact_id }),
    ...(invoice.business_id === undefined ? {} : { businessId: invoice.business_id }),
    ...(invoice.customer_name === undefined
      ? {}
      : { customerName: invoice.customer_name }),
    ...(invoice.customer_email === undefined
      ? {}
      : { customerEmail: invoice.customer_email }),
    ...(invoice.customer_phone === undefined
      ? {}
      : { customerPhone: invoice.customer_phone }),
    ...(invoice.customer_address === undefined
      ? {}
      : { customerAddress: invoice.customer_address }),
    ...(invoice.issue_date === undefined ? {} : { issueDate: invoice.issue_date }),
    ...(invoice.due_date === undefined ? {} : { dueDate: invoice.due_date }),
    ...(invoice.items === undefined ? {} : { items: mapItems(invoice.items) }),
    ...(invoice.discount_type === undefined
      ? {}
      : { discountType: invoice.discount_type }),
    ...(invoice.discount_value === undefined
      ? {}
      : { discountValue: String(invoice.discount_value) }),
    ...(invoice.tax_rate === undefined
      ? {}
      : { taxRate: String(invoice.tax_rate) }),
    ...(invoice.notes === undefined ? {} : { notes: invoice.notes }),
    ...(invoice.terms_and_conditions === undefined
      ? {}
      : { termsAndConditions: invoice.terms_and_conditions }),
    ...(invoice.payment_terms === undefined
      ? {}
      : { paymentTerms: String(invoice.payment_terms) }),
  };
}

export const getInvoicesViaGraphql = async (
  params: {
    status?: Invoice['status'] | 'all';
    contact_id?: number;
    page?: number;
    limit?: number;
    search?: string;
  },
  organizationId?: number,
) => {
  const data = await graphqlRequest<{
    invoices: {
      nodes: GraphqlInvoice[];
      pageInfo: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    };
  }, Record<string, unknown>>(
    `query Invoices($filter: InvoiceFilterInput, $page: PageInput) {
      invoices(filter: $filter, page: $page) {
        nodes { ${coreFields} }
        pageInfo { page pageSize total totalPages }
      }
    }`,
    {
      filter: {
        ...(params.status === undefined ? {} : { status: params.status }),
        ...(params.contact_id === undefined
          ? {}
          : { contactId: params.contact_id }),
        ...(params.search === undefined ? {} : { search: params.search }),
      },
      page: { page: params.page ?? 1, pageSize: params.limit ?? 50 },
    },
    organizationId,
  );
  return {
    invoices: data.invoices.nodes.map(mapInvoice),
    pagination: {
      page: data.invoices.pageInfo.page,
      limit: data.invoices.pageInfo.pageSize,
      total: data.invoices.pageInfo.total,
      totalPages: data.invoices.pageInfo.totalPages,
    },
  };
};

export const getInvoiceViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<Invoice> => {
  const data = await graphqlRequest<{ invoice: GraphqlInvoice }, { id: number }>(
    `query Invoice($id: Int!) { invoice(id: $id) { ${detailFields} } }`,
    { id },
    organizationId,
  );
  return mapInvoice(data.invoice);
};

export const createInvoiceViaGraphql = async (
  invoice: WritableInvoice & { items: InvoiceItem[] },
  organizationId?: number,
): Promise<Invoice> => {
  const data = await graphqlMutationRequest<
    { createInvoice: GraphqlInvoice },
    { input: ReturnType<typeof mapMutationInput> }
  >(
    `mutation CreateInvoice($input: CreateInvoiceInput!) {
      createInvoice(input: $input) { ${detailFields} }
    }`,
    { input: mapMutationInput(invoice) },
    organizationId,
  );
  return mapInvoice(data.createInvoice);
};

export const updateInvoiceViaGraphql = async (
  id: number,
  invoice: WritableInvoice,
  organizationId?: number,
): Promise<Invoice> => {
  const data = await graphqlMutationRequest<
    { updateInvoice: GraphqlInvoice },
    { id: number; input: ReturnType<typeof mapMutationInput> }
  >(
    `mutation UpdateInvoice($id: Int!, $input: UpdateInvoiceInput!) {
      updateInvoice(id: $id, input: $input) { ${detailFields} }
    }`,
    { id, input: mapMutationInput(invoice) },
    organizationId,
  );
  return mapInvoice(data.updateInvoice);
};

export const deleteInvoiceViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<
    { deleteInvoice: { success: boolean; deletedId: number } },
    { id: number }
  >(
    `mutation DeleteInvoice($id: Int!) {
      deleteInvoice(id: $id) { success deletedId invoiceNumber }
    }`,
    { id },
    organizationId,
  );
  if (data.deleteInvoice.deletedId !== id) {
    throw new Error('GraphQL invoice delete returned the wrong invoice');
  }
  return { success: data.deleteInvoice.success };
};
