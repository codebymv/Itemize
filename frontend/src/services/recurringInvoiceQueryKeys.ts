import type { RecurringInvoiceListParams } from './recurringInvoicesGraphql';

export const recurringInvoiceQueryKeys = {
  all: (organizationId: number | null | undefined) => (
    ['recurring-invoices', organizationId] as const
  ),
  pages: (organizationId: number | null | undefined) => (
    [...recurringInvoiceQueryKeys.all(organizationId), 'page'] as const
  ),
  page: (
    organizationId: number | null | undefined,
    params: RecurringInvoiceListParams,
  ) => [...recurringInvoiceQueryKeys.pages(organizationId), params] as const,
};
