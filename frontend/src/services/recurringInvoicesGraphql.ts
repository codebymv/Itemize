import type {
  RecurringInvoice,
  RecurringInvoiceItem,
  RecurringInvoiceWriteInput,
  RecurringStatus,
} from './recurringInvoicesApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlRecurringItem = {
  productId: number | null;
  name: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

type GraphqlRecurringInvoice = {
  id: number;
  organizationId: number;
  templateName: string;
  contactId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  frequency: RecurringInvoice['frequency'];
  startDate: string;
  endDate: string | null;
  nextRunDate: string | null;
  lastGeneratedAt: string | null;
  status: RecurringInvoice['status'];
  items?: GraphqlRecurringItem[];
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  discountType: RecurringInvoice['discount_type'];
  discountValue: string;
  total: string;
  currency: string;
  notes: string | null;
  paymentTerms: string | null;
  customFields: Record<string, unknown>;
  sourceInvoiceId: number | null;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  sourceInvoiceNumber: string | null;
  invoicesGenerated: number;
};

const coreFields = `
  id organizationId templateName contactId customerName customerEmail
  frequency startDate endDate nextRunDate lastGeneratedAt status subtotal
  taxAmount discountAmount discountType discountValue total currency notes
  paymentTerms customFields sourceInvoiceId createdById createdAt updatedAt
  contactFirstName contactLastName contactEmail sourceInvoiceNumber
  invoicesGenerated
`;

const detailFields = `
  ${coreFields}
  items { productId name description quantity unitPrice taxRate }
`;

const mapItem = (item: GraphqlRecurringItem): RecurringInvoiceItem => ({
  product_id: item.productId,
  name: item.name,
  description: item.description,
  quantity: Number(item.quantity),
  unit_price: Number(item.unitPrice),
  tax_rate: Number(item.taxRate),
});

const mapRecurringInvoice = (row: GraphqlRecurringInvoice): RecurringInvoice => ({
  id: row.id,
  organization_id: row.organizationId,
  template_name: row.templateName,
  contact_id: row.contactId,
  customer_name: row.customerName,
  customer_email: row.customerEmail,
  frequency: row.frequency,
  start_date: row.startDate,
  end_date: row.endDate,
  next_run_date: row.nextRunDate,
  last_generated_at: row.lastGeneratedAt,
  status: row.status,
  items: row.items?.map(mapItem),
  subtotal: Number(row.subtotal),
  tax_amount: Number(row.taxAmount),
  discount_amount: Number(row.discountAmount),
  discount_type: row.discountType,
  discount_value: Number(row.discountValue),
  total: Number(row.total),
  currency: row.currency,
  notes: row.notes,
  payment_terms: row.paymentTerms,
  custom_fields: row.customFields,
  source_invoice_id: row.sourceInvoiceId,
  created_by: row.createdById,
  created_at: row.createdAt,
  updated_at: row.updatedAt,
  contact_first_name: row.contactFirstName,
  contact_last_name: row.contactLastName,
  contact_email: row.contactEmail,
  source_invoice_number: row.sourceInvoiceNumber,
  invoices_generated: row.invoicesGenerated,
});

const mapInput = (input: RecurringInvoiceWriteInput) => ({
  ...(input.template_name === undefined ? {} : { templateName: input.template_name }),
  ...(input.contact_id === undefined ? {} : { contactId: input.contact_id }),
  ...(input.customer_name === undefined ? {} : { customerName: input.customer_name }),
  ...(input.customer_email === undefined ? {} : { customerEmail: input.customer_email }),
  ...(input.frequency === undefined ? {} : { frequency: input.frequency }),
  ...(input.start_date === undefined ? {} : { startDate: input.start_date }),
  ...(input.end_date === undefined ? {} : { endDate: input.end_date }),
  ...(input.items === undefined ? {} : {
    items: input.items.map((item) => ({
      ...(item.product_id === undefined ? {} : { productId: item.product_id }),
      name: item.name,
      ...(item.description === undefined ? {} : { description: item.description }),
      quantity: String(item.quantity ?? 1),
      unitPrice: String(item.unit_price ?? 0),
      taxRate: String(item.tax_rate ?? 0),
    })),
  }),
  ...(input.discount_type === undefined ? {} : { discountType: input.discount_type }),
  ...(input.discount_value === undefined
    ? {} : { discountValue: String(input.discount_value) }),
  ...(input.notes === undefined ? {} : { notes: input.notes }),
  ...(input.payment_terms === undefined ? {} : { paymentTerms: input.payment_terms }),
});

export const getRecurringInvoicesViaGraphql = async (
  status: RecurringStatus | 'all',
  organizationId?: number,
): Promise<RecurringInvoice[]> => {
  const rows: RecurringInvoice[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const data = await graphqlRequest<{
      recurringInvoices: {
        nodes: GraphqlRecurringInvoice[];
        pageInfo: { totalPages: number };
      };
    }, Record<string, unknown>>(
      `query RecurringInvoices(
        $filter: RecurringInvoiceFilterInput, $page: PageInput
      ) {
        recurringInvoices(filter: $filter, page: $page) {
          nodes { ${coreFields} }
          pageInfo { totalPages }
        }
      }`,
      {
        filter: status === 'all' ? {} : { status },
        page: { page, pageSize: 100 },
      },
      organizationId,
    );
    rows.push(...data.recurringInvoices.nodes.map(mapRecurringInvoice));
    totalPages = data.recurringInvoices.pageInfo.totalPages;
    page += 1;
  } while (page <= totalPages);
  return rows;
};

export const getRecurringInvoiceViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<RecurringInvoice> => {
  const data = await graphqlRequest<
    { recurringInvoice: GraphqlRecurringInvoice }, { id: number }
  >(
    `query RecurringInvoice($id: Int!) {
      recurringInvoice(id: $id) { ${detailFields} }
    }`,
    { id },
    organizationId,
  );
  return mapRecurringInvoice(data.recurringInvoice);
};

export const createRecurringInvoiceViaGraphql = async (
  input: RecurringInvoiceWriteInput & {
    template_name: string;
    frequency: RecurringInvoice['frequency'];
    start_date: string;
    items: RecurringInvoiceItem[];
  },
  organizationId?: number,
): Promise<RecurringInvoice> => {
  const data = await graphqlMutationRequest<
    { createRecurringInvoice: GraphqlRecurringInvoice },
    { input: ReturnType<typeof mapInput> }
  >(
    `mutation CreateRecurringInvoice($input: CreateRecurringInvoiceInput!) {
      createRecurringInvoice(input: $input) { ${detailFields} }
    }`,
    { input: mapInput(input) },
    organizationId,
  );
  return mapRecurringInvoice(data.createRecurringInvoice);
};

export const updateRecurringInvoiceViaGraphql = async (
  id: number,
  input: RecurringInvoiceWriteInput,
  organizationId?: number,
): Promise<RecurringInvoice> => {
  const data = await graphqlMutationRequest<
    { updateRecurringInvoice: GraphqlRecurringInvoice },
    { id: number; input: ReturnType<typeof mapInput> }
  >(
    `mutation UpdateRecurringInvoice(
      $id: Int!, $input: UpdateRecurringInvoiceInput!
    ) {
      updateRecurringInvoice(id: $id, input: $input) { ${detailFields} }
    }`,
    { id, input: mapInput(input) },
    organizationId,
  );
  return mapRecurringInvoice(data.updateRecurringInvoice);
};

export const deleteRecurringInvoiceViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<{
    deleteRecurringInvoice: { success: boolean; deletedId: number };
  }, { id: number }>(
    `mutation DeleteRecurringInvoice($id: Int!) {
      deleteRecurringInvoice(id: $id) { success deletedId templateName }
    }`,
    { id },
    organizationId,
  );
  if (data.deleteRecurringInvoice.deletedId !== id) {
    throw new Error('GraphQL recurring delete returned the wrong template');
  }
  return { success: data.deleteRecurringInvoice.success };
};
