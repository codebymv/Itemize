import {
  graphqlMutationRequest,
  graphqlRequest,
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
  refunded_amount: number;
  refundable_amount: number;
  refunded_at?: string;
  refund_reason?: string;
  paid_at?: string;
  created_at: string;
  updated_at?: string;
}

export const PAYMENT_PERIODS = [
  '7days',
  '30days',
  '90days',
  '6months',
  '12months',
  'all',
] as const;

export type PaymentPeriod = typeof PAYMENT_PERIODS[number];

export const PAYMENT_PERIOD_LABELS: Record<PaymentPeriod, string> = {
  '7days': 'Last 7 days',
  '30days': 'Last 30 days',
  '90days': 'Last 90 days',
  '6months': 'Last 6 months',
  '12months': 'Last 12 months',
  all: 'All time',
};

export interface PaymentOverviewCurrency {
  currency: string;
  failedAmount: number;
  failedCount: number;
  grossAmount: number;
  grossCount: number;
  inProgressAmount: number;
  inProgressCount: number;
  refundedAmount: number;
  refundedCount: number;
  netAmount: number;
}

export interface PaymentOverview {
  period: PaymentPeriod;
  startAt?: string;
  endAt: string;
  timeZone: string;
  currencies: PaymentOverviewCurrency[];
}

export interface RevenueFlowSummary {
  bookedSales: number;
  bookedDeals: number;
  failedAmount: number;
  failedCount: number;
  grossReceived: number;
  settledPayments: number;
  inProgressAmount: number;
  inProgressCount: number;
  refunds: number;
  refundedPayments: number;
  netReceived: number;
}

export interface RevenueFlowBucket {
  startAt: string;
  bookedSales: number;
  bookedDeals: number;
  grossReceived: number;
  settledPayments: number;
  refunds: number;
  refundedPayments: number;
  netReceived: number;
}

export interface RevenueFlowMethod {
  paymentMethod: InvoicePayment['payment_method'];
  grossReceived: number;
  settledPayments: number;
  refunds: number;
  refundedPayments: number;
  netReceived: number;
}

export interface RevenueFlowCurrency {
  currency: string;
  summary: RevenueFlowSummary;
  buckets: RevenueFlowBucket[];
  methods: RevenueFlowMethod[];
}

export interface RevenueFlow {
  period: PaymentPeriod;
  startAt?: string;
  endAt: string;
  timeZone: string;
  bucketUnit: 'day' | 'week' | 'month' | 'quarter' | 'year';
  currencies: RevenueFlowCurrency[];
}

export interface InvoicePaymentPage {
  nodes: InvoicePayment[];
  pageInfo: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

type PaymentFilters = {
  status?: string;
  payment_method?: string;
};

export type PaymentLedgerFilters = PaymentFilters & {
  period?: PaymentPeriod;
  search?: string;
  page?: number;
  pageSize?: number;
};

type ManualPaymentInput = {
  invoice_id?: number;
  contact_id?: number;
  amount: number;
  currency?: string;
  payment_method?: InvoicePayment['payment_method'];
  status?: InvoicePayment['status'];
  payment_date?: string;
  notes?: string;
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
  paymentMethod: string;
  status: string;
  stripePaymentIntentId: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
  description: string | null;
  notes: string | null;
  receiptUrl: string | null;
  refundedAmount: string;
  refundableAmount: string;
  refundedAt: string | null;
  refundReason: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GraphqlRevenueFlow = {
  period: string;
  startAt: string | null;
  endAt: string;
  timeZone: string;
  bucketUnit: RevenueFlow['bucketUnit'];
  currencies: Array<{
    currency: string;
    summary: {
      bookedSales: string;
      bookedDeals: number;
      failedAmount: string;
      failedCount: number;
      grossReceived: string;
      settledPayments: number;
      inProgressAmount: string;
      inProgressCount: number;
      refunds: string;
      refundedPayments: number;
      netReceived: string;
    };
    buckets: Array<{
      startAt: string;
      bookedSales: string;
      bookedDeals: number;
      grossReceived: string;
      settledPayments: number;
      refunds: string;
      refundedPayments: number;
      netReceived: string;
    }>;
    methods: Array<{
      paymentMethod: string;
      grossReceived: string;
      settledPayments: number;
      refunds: string;
      refundedPayments: number;
      netReceived: string;
    }>;
  }>;
};

const fields = `
  id organizationId invoiceId invoiceNumber contactId contactName amount currency
  paymentMethod status stripePaymentIntentId cardLast4 cardBrand description notes
  receiptUrl paidAt createdAt updatedAt
  refundedAmount refundableAmount refundedAt refundReason
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
  payment_method: payment.paymentMethod.toLowerCase() as InvoicePayment['payment_method'],
  status: payment.status.toLowerCase() as InvoicePayment['status'],
  ...(payment.stripePaymentIntentId === null
    ? {}
    : { stripe_payment_intent_id: payment.stripePaymentIntentId }),
  ...(payment.cardLast4 === null ? {} : { card_last4: payment.cardLast4 }),
  ...(payment.cardBrand === null ? {} : { card_brand: payment.cardBrand }),
  ...(payment.description === null ? {} : { description: payment.description }),
  ...(payment.notes === null ? {} : { notes: payment.notes }),
  ...(payment.receiptUrl === null ? {} : { receipt_url: payment.receiptUrl }),
  refunded_amount: Number(payment.refundedAmount),
  refundable_amount: Number(payment.refundableAmount),
  ...(payment.refundedAt === null ? {} : { refunded_at: payment.refundedAt }),
  ...(payment.refundReason === null ? {} : { refund_reason: payment.refundReason }),
  ...(payment.paidAt === null ? {} : { paid_at: payment.paidAt }),
  created_at: payment.createdAt,
  updated_at: payment.updatedAt,
});

const enumValue = (value?: string): string | undefined =>
  value === undefined ? undefined : value.toUpperCase();

export const PAYMENT_PERIOD_ENUM: Record<PaymentPeriod, string> = {
  '7days': 'LAST_7_DAYS',
  '30days': 'LAST_30_DAYS',
  '90days': 'LAST_90_DAYS',
  '6months': 'LAST_6_MONTHS',
  '12months': 'LAST_12_MONTHS',
  all: 'ALL_TIME',
};

const PAYMENT_PERIOD_FROM_ENUM: Record<string, PaymentPeriod> = Object.fromEntries(
  Object.entries(PAYMENT_PERIOD_ENUM).map(([period, enumName]) => [enumName, period]),
) as Record<string, PaymentPeriod>;

export const revenueFlowFields = `
  period startAt endAt timeZone bucketUnit
  currencies {
    currency
    summary {
      bookedSales bookedDeals failedAmount failedCount
      grossReceived settledPayments inProgressAmount inProgressCount
      refunds refundedPayments netReceived
    }
    buckets {
      startAt bookedSales bookedDeals grossReceived settledPayments
      refunds refundedPayments netReceived
    }
    methods {
      paymentMethod grossReceived settledPayments refunds refundedPayments netReceived
    }
  }
`;

export const mapRevenueFlow = (
  flow: GraphqlRevenueFlow,
  fallbackPeriod: PaymentPeriod,
): RevenueFlow => ({
  period: PAYMENT_PERIOD_FROM_ENUM[flow.period] ?? fallbackPeriod,
  ...(flow.startAt === null ? {} : { startAt: flow.startAt }),
  endAt: flow.endAt,
  timeZone: flow.timeZone,
  bucketUnit: flow.bucketUnit,
  currencies: flow.currencies.map((currency) => ({
    currency: currency.currency,
    summary: {
      bookedSales: Number(currency.summary.bookedSales),
      bookedDeals: currency.summary.bookedDeals,
      failedAmount: Number(currency.summary.failedAmount),
      failedCount: currency.summary.failedCount,
      grossReceived: Number(currency.summary.grossReceived),
      settledPayments: currency.summary.settledPayments,
      inProgressAmount: Number(currency.summary.inProgressAmount),
      inProgressCount: currency.summary.inProgressCount,
      refunds: Number(currency.summary.refunds),
      refundedPayments: currency.summary.refundedPayments,
      netReceived: Number(currency.summary.netReceived),
    },
    buckets: currency.buckets.map((bucket) => ({
      startAt: bucket.startAt,
      bookedSales: Number(bucket.bookedSales),
      bookedDeals: bucket.bookedDeals,
      grossReceived: Number(bucket.grossReceived),
      settledPayments: bucket.settledPayments,
      refunds: Number(bucket.refunds),
      refundedPayments: bucket.refundedPayments,
      netReceived: Number(bucket.netReceived),
    })),
    methods: currency.methods.map((method) => ({
      paymentMethod: method.paymentMethod.toLowerCase() as InvoicePayment['payment_method'],
      grossReceived: Number(method.grossReceived),
      settledPayments: method.settledPayments,
      refunds: Number(method.refunds),
      refundedPayments: method.refundedPayments,
      netReceived: Number(method.netReceived),
    })),
  })),
});

export const getInvoicePaymentLedger = async (
  organizationId: number,
  filters: PaymentLedgerFilters = {},
): Promise<{ payments: InvoicePaymentPage; overview: PaymentOverview; revenueFlow: RevenueFlow }> => {
  const period = filters.period ?? '30days';
  const data = await graphqlRequest<
    {
      payments: {
        nodes: GraphqlPayment[];
        pageInfo: InvoicePaymentPage['pageInfo'];
      };
      revenueFlow: GraphqlRevenueFlow;
    },
    {
      page: { page: number; pageSize: number };
      period: string;
      status?: string;
      paymentMethod?: string;
      search?: string;
    }
  >(
    `query PaymentLedger(
      $page: PageInput,
      $period: PaymentPeriod!,
      $status: PaymentStatus,
      $paymentMethod: PaymentMethod,
      $search: String
    ) {
      payments(
        page: $page,
        period: $period,
        status: $status,
        paymentMethod: $paymentMethod,
        search: $search
      ) {
        nodes { ${fields} }
        pageInfo { page pageSize total totalPages hasNextPage hasPreviousPage }
      }
      revenueFlow(period: $period) { ${revenueFlowFields} }
    }`,
    {
      page: { page: filters.page ?? 1, pageSize: filters.pageSize ?? 25 },
      period: PAYMENT_PERIOD_ENUM[period],
      ...(filters.status ? { status: enumValue(filters.status) } : {}),
      ...(filters.payment_method
        ? { paymentMethod: enumValue(filters.payment_method) }
        : {}),
      ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
    },
    organizationId,
  );

  const revenueFlow = mapRevenueFlow(data.revenueFlow, period);
  return {
    payments: {
      nodes: data.payments.nodes.map(mapPayment),
      pageInfo: data.payments.pageInfo,
    },
    overview: {
      period: revenueFlow.period,
      ...(revenueFlow.startAt === undefined ? {} : { startAt: revenueFlow.startAt }),
      endAt: revenueFlow.endAt,
      timeZone: revenueFlow.timeZone,
      currencies: revenueFlow.currencies.map(currency => ({
        currency: currency.currency,
        failedAmount: currency.summary.failedAmount,
        failedCount: currency.summary.failedCount,
        grossAmount: currency.summary.grossReceived,
        grossCount: currency.summary.settledPayments,
        inProgressAmount: currency.summary.inProgressAmount,
        inProgressCount: currency.summary.inProgressCount,
        refundedAmount: currency.summary.refunds,
        refundedCount: currency.summary.refundedPayments,
        netAmount: currency.summary.netReceived,
      })),
    },
    revenueFlow,
  };
};

export const getRevenueFlow = async (
  organizationId: number,
  period: PaymentPeriod = '30days',
): Promise<RevenueFlow> => {
  const data = await graphqlRequest<
    { revenueFlow: GraphqlRevenueFlow },
    { period: string }
  >(
    `query RevenueFlow($period: PaymentPeriod!) {
      revenueFlow(period: $period) { ${revenueFlowFields} }
    }`,
    { period: PAYMENT_PERIOD_ENUM[period] },
    organizationId,
  );
  return mapRevenueFlow(data.revenueFlow, period);
};

export const getInvoicePayments = async (
  organizationId: number,
  filters: PaymentFilters = {},
): Promise<InvoicePayment[]> => {
  const data = await getInvoicePaymentLedger(organizationId, {
    ...filters,
    period: 'all',
    pageSize: 50,
  });
  return data.payments.nodes;
};

export const refundInvoicePayment = async (
  organizationId: number,
  paymentId: number,
  input: { amount?: number; reason?: string; idempotencyKey: string },
): Promise<{ payment: InvoicePayment; refundStatus: string }> => {
  const data = await graphqlMutationRequest<
    { refundPayment: { payment: GraphqlPayment; refundStatus: string } },
    { paymentId: number; input: { amount?: string; reason?: string; idempotencyKey: string } }
  >(
    `mutation RefundPayment($paymentId: Int!, $input: RefundPaymentInput!) {
      refundPayment(paymentId: $paymentId, input: $input) {
        payment { ${fields} }
        refundStatus
      }
    }`,
    {
      paymentId,
      input: {
        ...(input.amount === undefined ? {} : { amount: input.amount.toFixed(2) }),
        ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        idempotencyKey: input.idempotencyKey,
      },
    },
    organizationId,
  );
  return {
    payment: mapPayment(data.refundPayment.payment),
    refundStatus: data.refundPayment.refundStatus,
  };
};

export const createInvoicePayment = async (
  organizationId: number,
  payment: ManualPaymentInput,
): Promise<void> => {
  await graphqlMutationRequest(
    `mutation RecordPayment($input: RecordPaymentInput!) {
      recordPayment(input: $input) {
        payment { id }
        invoice { amountPaid amountDue status }
      }
    }`,
    {
      input: {
        ...(payment.invoice_id === undefined
          ? {}
          : { invoiceId: payment.invoice_id }),
        ...(payment.contact_id === undefined
          ? {}
          : { contactId: payment.contact_id }),
        amount: String(payment.amount),
        currency: payment.currency ?? 'USD',
        paymentMethod: enumValue(payment.payment_method ?? 'other'),
        status: enumValue(payment.status ?? 'succeeded'),
        ...(payment.payment_date === undefined
          ? {}
          : { paymentDate: payment.payment_date }),
        ...(payment.notes === undefined ? {} : { notes: payment.notes }),
      },
    },
    organizationId,
  );
};

export const recordInvoicePaymentViaGraphql = async (
  invoiceId: number,
  payment: {
    amount: number;
    payment_method?: InvoicePayment['payment_method'];
    notes?: string;
  },
  organizationId?: number,
): Promise<{
  payment: InvoicePayment;
  invoice: { amount_paid: number; amount_due: number; status: string };
}> => {
  const data = await graphqlMutationRequest<
    {
      recordInvoicePayment: {
        payment: GraphqlPayment;
        invoice: {
          amountPaid: string;
          amountDue: string;
          status: string;
        };
      };
    },
    {
      invoiceId: number;
      input: {
        amount: string;
        paymentMethod?: string;
        notes?: string;
      };
    }
  >(
    `mutation RecordInvoicePayment(
      $invoiceId: Int!,
      $input: RecordInvoicePaymentInput!
    ) {
      recordInvoicePayment(invoiceId: $invoiceId, input: $input) {
        payment { ${fields} }
        invoice { amountPaid amountDue status }
      }
    }`,
    {
      invoiceId,
      input: {
        amount: String(payment.amount),
        paymentMethod: enumValue(payment.payment_method ?? 'other'),
        ...(payment.notes === undefined ? {} : { notes: payment.notes }),
      },
    },
    organizationId,
  );
  return {
    payment: mapPayment(data.recordInvoicePayment.payment),
    invoice: {
      amount_paid: Number(data.recordInvoicePayment.invoice.amountPaid),
      amount_due: Number(data.recordInvoicePayment.invoice.amountDue),
      status: data.recordInvoicePayment.invoice.status,
    },
  };
};
