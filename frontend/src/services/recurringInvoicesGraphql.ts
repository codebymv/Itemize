import type {
  RecurringInvoice,
  RecurringInvoiceHistoryEntry,
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

export type GraphqlRecurringInvoice = {
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

type GraphqlRecurringHistoryEntry = {
  id: number;
  invoiceNumber: string;
  total: string;
  status: string;
  createdAt: string;
};

const coreFields = `
  id organizationId templateName contactId customerName customerEmail
  frequency startDate endDate nextRunDate lastGeneratedAt status subtotal
  taxAmount discountAmount discountType discountValue total currency notes
  paymentTerms customFields sourceInvoiceId createdById createdAt updatedAt
  contactFirstName contactLastName contactEmail sourceInvoiceNumber
  invoicesGenerated
`;

export const recurringInvoiceDetailFields = `
  ${coreFields}
  items { productId name description quantity unitPrice taxRate }
`;

export type RecurringInvoiceStats = {
  total: number;
  active: number;
  paused: number;
  completed: number;
};

export type RecurringInvoiceListParams = {
  status?: RecurringStatus | 'all';
  search?: string;
  page?: number;
  limit?: number;
};

export type RecurringInvoiceListResponse = {
  recurringInvoices: RecurringInvoice[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: RecurringInvoiceStats;
};

type RecurringInvoicePageData = {
  nodes: GraphqlRecurringInvoice[];
  pageInfo: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type ListCapability = 'unknown' | 'stats' | 'legacy';
let listCapability: ListCapability = 'unknown';

const recurringInvoicePageQuery = `
  query RecurringInvoicePage(
    $filter: RecurringInvoiceFilterInput, $page: PageInput
  ) {
    recurringInvoices(filter: $filter, page: $page) {
      nodes { ${coreFields} }
      pageInfo { page pageSize total totalPages }
      stats { total active paused completed }
    }
  }
`;

const legacyRecurringInvoicePageQuery = `
  query LegacyRecurringInvoicePage(
    $filter: RecurringInvoiceFilterInput, $page: PageInput,
    $allFilter: RecurringInvoiceFilterInput,
    $activeFilter: RecurringInvoiceFilterInput,
    $pausedFilter: RecurringInvoiceFilterInput,
    $completedFilter: RecurringInvoiceFilterInput,
    $summaryPage: PageInput
  ) {
    page: recurringInvoices(filter: $filter, page: $page) {
      nodes { ${coreFields} }
      pageInfo { page pageSize total totalPages }
    }
    all: recurringInvoices(filter: $allFilter, page: $summaryPage) {
      pageInfo { total }
    }
    active: recurringInvoices(filter: $activeFilter, page: $summaryPage) {
      pageInfo { total }
    }
    paused: recurringInvoices(filter: $pausedFilter, page: $summaryPage) {
      pageInfo { total }
    }
    completed: recurringInvoices(filter: $completedFilter, page: $summaryPage) {
      pageInfo { total }
    }
  }
`;

const mapItem = (item: GraphqlRecurringItem): RecurringInvoiceItem => ({
  product_id: item.productId,
  name: item.name,
  description: item.description,
  quantity: Number(item.quantity),
  unit_price: Number(item.unitPrice),
  tax_rate: Number(item.taxRate),
});

export const mapRecurringInvoice = (row: GraphqlRecurringInvoice): RecurringInvoice => ({
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

const mapPage = (
  page: RecurringInvoicePageData,
  stats: RecurringInvoiceStats,
): RecurringInvoiceListResponse => ({
  recurringInvoices: page.nodes.map(mapRecurringInvoice),
  pagination: {
    page: page.pageInfo.page,
    limit: page.pageInfo.pageSize,
    total: page.pageInfo.total,
    totalPages: page.pageInfo.totalPages,
  },
  stats,
});

const missingRecurringInvoiceStats = (error: unknown): boolean =>
  error instanceof Error
  && error.message.includes('Cannot query field')
  && error.message.includes('stats')
  && error.message.includes('RecurringInvoicePage');

const getLegacyRecurringInvoicePage = async (
  status: RecurringStatus | 'all',
  search: string | undefined,
  page: number,
  limit: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<RecurringInvoiceListResponse> => {
  const data = await graphqlRequest<{
    page: RecurringInvoicePageData;
    all: { pageInfo: { total: number } };
    active: { pageInfo: { total: number } };
    paused: { pageInfo: { total: number } };
    completed: { pageInfo: { total: number } };
  }, Record<string, unknown>>(
    legacyRecurringInvoicePageQuery,
    {
      filter: status === 'all' ? {} : { status },
      // Older schemas predate server search. One bounded compatibility page
      // preserves rolling-deploy search without restoring an all-page walk.
      page: search
        ? { page: 1, pageSize: 100 }
        : { page, pageSize: limit },
      allFilter: {},
      activeFilter: { status: 'active' },
      pausedFilter: { status: 'paused' },
      completedFilter: { status: 'completed' },
      summaryPage: { page: 1, pageSize: 1 },
    },
    organizationId,
    signal,
  );
  const pageData = search
    ? (() => {
        const needle = search.toLocaleLowerCase();
        const matches = data.page.nodes.filter((row) => [
          row.templateName,
          row.customerName,
          row.customerEmail,
          row.contactFirstName,
          row.contactLastName,
          row.contactEmail,
        ].some((value) => value?.toLocaleLowerCase().includes(needle)));
        const offset = (page - 1) * limit;
        return {
          nodes: matches.slice(offset, offset + limit),
          pageInfo: {
            page,
            pageSize: limit,
            total: matches.length,
            totalPages: Math.ceil(matches.length / limit),
          },
        };
      })()
    : data.page;
  return mapPage(pageData, {
    total: data.all.pageInfo.total,
    active: data.active.pageInfo.total,
    paused: data.paused.pageInfo.total,
    completed: data.completed.pageInfo.total,
  });
};

export const getRecurringInvoicePageViaGraphql = async (
  params: RecurringInvoiceListParams = {},
  organizationId?: number,
  signal?: AbortSignal,
): Promise<RecurringInvoiceListResponse> => {
  const status = params.status ?? 'all';
  const normalizedSearch = params.search?.trim();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  if (listCapability === 'legacy') {
    return getLegacyRecurringInvoicePage(
      status, normalizedSearch, page, limit, organizationId, signal,
    );
  }
  try {
    const data = await graphqlRequest<{
      recurringInvoices: RecurringInvoicePageData & {
        stats: RecurringInvoiceStats;
      };
    }, Record<string, unknown>>(
      recurringInvoicePageQuery,
      {
        filter: {
          ...(status === 'all' ? {} : { status }),
          ...(normalizedSearch ? { search: normalizedSearch } : {}),
        },
        page: { page, pageSize: limit },
      },
      organizationId,
      signal,
    );
    listCapability = 'stats';
    return mapPage(data.recurringInvoices, data.recurringInvoices.stats);
  } catch (error) {
    if (listCapability === 'unknown' && missingRecurringInvoiceStats(error)) {
      listCapability = 'legacy';
      return getLegacyRecurringInvoicePage(
        status, normalizedSearch, page, limit, organizationId, signal,
      );
    }
    throw error;
  }
};

export const resetRecurringInvoiceListCapability = (): void => {
  listCapability = 'unknown';
};

export const getRecurringInvoicesViaGraphql = async (
  status: RecurringStatus | 'all',
  organizationId?: number,
  signal?: AbortSignal,
): Promise<RecurringInvoice[]> => {
  const rows: RecurringInvoice[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const data = await getRecurringInvoicePageViaGraphql(
      { status, page, limit: 100 },
      organizationId,
      signal,
    );
    rows.push(...data.recurringInvoices);
    totalPages = data.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);
  return rows;
};

export const getRecurringInvoiceViaGraphql = async (
  id: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<RecurringInvoice> => {
  const data = await graphqlRequest<
    { recurringInvoice: GraphqlRecurringInvoice }, { id: number }
  >(
    `query RecurringInvoice($id: Int!) {
      recurringInvoice(id: $id) { ${recurringInvoiceDetailFields} }
    }`,
    { id },
    organizationId,
    signal,
  );
  return mapRecurringInvoice(data.recurringInvoice);
};

export const getRecurringInvoiceNumberPreviewViaGraphql = async (
  organizationId?: number,
  signal?: AbortSignal,
): Promise<string> => {
  const data = await graphqlRequest<
    { previewRecurringInvoiceNumber: string },
    Record<string, never>
  >(
    `query PreviewRecurringInvoiceNumber {
      previewRecurringInvoiceNumber
    }`,
    {},
    organizationId,
    signal,
  );
  return data.previewRecurringInvoiceNumber;
};

export const getRecurringInvoiceHistoryViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<RecurringInvoiceHistoryEntry[]> => {
  const rows: RecurringInvoiceHistoryEntry[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const data = await graphqlRequest<{
      recurringInvoiceHistory: {
        nodes: GraphqlRecurringHistoryEntry[];
        pageInfo: { totalPages: number };
      };
    }, { id: number; page: { page: number; pageSize: number } }>(
      `query RecurringInvoiceHistory($id: Int!, $page: PageInput) {
        recurringInvoiceHistory(id: $id, page: $page) {
          nodes { id invoiceNumber total status createdAt }
          pageInfo { totalPages }
        }
      }`,
      { id, page: { page, pageSize: 100 } },
      organizationId,
    );
    rows.push(...data.recurringInvoiceHistory.nodes.map((row) => ({
      id: row.id,
      invoice_number: row.invoiceNumber,
      total: Number(row.total),
      status: row.status,
      created_at: row.createdAt,
    })));
    totalPages = data.recurringInvoiceHistory.pageInfo.totalPages;
    page += 1;
  } while (page <= totalPages);
  return rows;
};

export const createRecurringInvoiceViaGraphql = async (
  input: RecurringInvoiceWriteInput & {
    template_name: string;
    frequency: RecurringInvoice['frequency'];
    start_date: string;
    items: RecurringInvoiceItem[];
  },
  idempotencyKey: string,
  organizationId?: number,
): Promise<RecurringInvoice> => {
  const data = await graphqlMutationRequest<
    { createRecurringInvoice: GraphqlRecurringInvoice },
    { input: ReturnType<typeof mapInput>; idempotencyKey: string }
  >(
    `mutation CreateRecurringInvoice(
      $input: CreateRecurringInvoiceInput!, $idempotencyKey: String!
    ) {
      createRecurringInvoice(input: $input, idempotencyKey: $idempotencyKey) {
        ${recurringInvoiceDetailFields}
      }
    }`,
    { input: mapInput(input), idempotencyKey },
    organizationId,
  );
  return mapRecurringInvoice(data.createRecurringInvoice);
};

export const createRecurringInvoiceFromInvoiceViaGraphql = async (
  invoiceId: number,
  input: {
    template_name: string;
    frequency: string;
    start_date: string;
    end_date?: string;
  },
  idempotencyKey: string,
  organizationId?: number,
): Promise<{ recurring_template_id: number }> => {
  const data = await graphqlMutationRequest<
    { createRecurringInvoiceFromInvoice: { id: number } },
    {
      invoiceId: number;
      idempotencyKey: string;
      input: {
        templateName: string;
        frequency: string;
        startDate: string;
        endDate?: string;
      };
    }
  >(
    `mutation CreateRecurringInvoiceFromInvoice(
      $invoiceId: Int!, $input: CreateRecurringInvoiceFromInvoiceInput!,
      $idempotencyKey: String!
    ) {
      createRecurringInvoiceFromInvoice(
        invoiceId: $invoiceId,
        input: $input,
        idempotencyKey: $idempotencyKey
      ) {
        id
      }
    }`,
    {
      invoiceId,
      idempotencyKey,
      input: {
        templateName: input.template_name,
        frequency: input.frequency,
        startDate: input.start_date,
        ...(input.end_date === undefined ? {} : { endDate: input.end_date }),
      },
    },
    organizationId,
  );
  return {
    recurring_template_id: data.createRecurringInvoiceFromInvoice.id,
  };
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
      updateRecurringInvoice(id: $id, input: $input) { ${recurringInvoiceDetailFields} }
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

const lifecycleMutation = async (
  operation: 'pauseRecurringInvoice' | 'resumeRecurringInvoice',
  id: number,
  organizationId?: number,
): Promise<RecurringInvoice> => {
  if (operation === 'pauseRecurringInvoice') {
    const data = await graphqlMutationRequest<
      { pauseRecurringInvoice: GraphqlRecurringInvoice },
      { id: number }
    >(
      `mutation PauseRecurringInvoice($id: Int!) {
        pauseRecurringInvoice(id: $id) { ${recurringInvoiceDetailFields} }
      }`,
      { id },
      organizationId,
    );
    return mapRecurringInvoice(data.pauseRecurringInvoice);
  }
  const data = await graphqlMutationRequest<
    { resumeRecurringInvoice: GraphqlRecurringInvoice },
    { id: number }
  >(
    `mutation ResumeRecurringInvoice($id: Int!) {
      resumeRecurringInvoice(id: $id) { ${recurringInvoiceDetailFields} }
    }`,
    { id },
    organizationId,
  );
  return mapRecurringInvoice(data.resumeRecurringInvoice);
};

export const pauseRecurringInvoiceViaGraphql = (
  id: number,
  organizationId?: number,
): Promise<RecurringInvoice> =>
  lifecycleMutation('pauseRecurringInvoice', id, organizationId);

export const resumeRecurringInvoiceViaGraphql = (
  id: number,
  organizationId?: number,
): Promise<RecurringInvoice> =>
  lifecycleMutation('resumeRecurringInvoice', id, organizationId);

export const generateRecurringInvoiceNowViaGraphql = async (
  id: number,
  organizationId?: number,
  idempotencyKey?: string,
): Promise<{
  invoice_number: string;
  next_run_date: string | null;
  template_status: RecurringInvoice['status'];
  replayed: boolean;
}> => {
  const data = await graphqlMutationRequest<{
    generateRecurringInvoiceNow: {
      invoiceId: number;
      invoiceNumber: string;
      nextRunDate: string | null;
      templateStatus: string;
      replayed: boolean;
    };
  }, { id: number; idempotencyKey: string }>(
    `mutation GenerateRecurringInvoiceNow(
      $id: Int!, $idempotencyKey: String!
    ) {
      generateRecurringInvoiceNow(
        id: $id, idempotencyKey: $idempotencyKey
      ) {
        invoiceId invoiceNumber nextRunDate templateStatus replayed
      }
    }`,
    {
      id,
      idempotencyKey:
        idempotencyKey ??
        globalThis.crypto?.randomUUID?.() ??
        `recurring-generation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    organizationId,
  );
  return {
    invoice_number: data.generateRecurringInvoiceNow.invoiceNumber,
    next_run_date: data.generateRecurringInvoiceNow.nextRunDate,
    template_status: data.generateRecurringInvoiceNow.templateStatus as RecurringInvoice['status'],
    replayed: data.generateRecurringInvoiceNow.replayed,
  };
};
