import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  createInvoice,
  createRecurringTemplateFromInvoice,
  deleteInvoice,
  getInvoice,
  getInvoices,
  sendInvoice,
  updateInvoice,
} from './invoicesApi';
import {
  isInvoiceGraphqlMutationsEnabled,
  isInvoiceGraphqlReadsEnabled,
  isInvoiceGraphqlSendEnabled,
  isRecurringInvoiceGraphqlCloneEnabled,
} from './graphqlClient';
import {
  createInvoiceViaGraphql,
  deleteInvoiceViaGraphql,
  getInvoiceViaGraphql,
  getInvoicesViaGraphql,
  sendInvoiceViaGraphql,
  updateInvoiceViaGraphql,
} from './invoicesGraphql';
import { createRecurringInvoiceFromInvoiceViaGraphql } from './recurringInvoicesGraphql';

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));
vi.mock('./graphqlClient', () => ({
  isInvoiceGraphqlMutationsEnabled: vi.fn(),
  isInvoiceGraphqlReadsEnabled: vi.fn(),
  isInvoiceGraphqlSendEnabled: vi.fn(),
  isInvoiceBusinessGraphqlMutationsEnabled: vi.fn(() => false),
  isInvoiceBusinessGraphqlReadsEnabled: vi.fn(() => false),
  isPaymentGraphqlMutationsEnabled: vi.fn(() => false),
  isProductGraphqlMutationsEnabled: vi.fn(() => false),
  isProductGraphqlReadsEnabled: vi.fn(() => false),
  isRecurringInvoiceGraphqlCloneEnabled: vi.fn(),
}));
vi.mock('./invoicesGraphql', () => ({
  createInvoiceViaGraphql: vi.fn(),
  deleteInvoiceViaGraphql: vi.fn(),
  getInvoiceViaGraphql: vi.fn(),
  getInvoicesViaGraphql: vi.fn(),
  sendInvoiceViaGraphql: vi.fn(),
  updateInvoiceViaGraphql: vi.fn(),
}));
vi.mock('./recurringInvoicesGraphql', () => ({
  createRecurringInvoiceFromInvoiceViaGraphql: vi.fn(),
}));

const invoice = {
  id: 12,
  organization_id: 4,
  invoice_number: 'INV-00012',
  issue_date: '2026-07-18',
  due_date: '2026-08-17',
  subtotal: 20,
  tax_amount: 0,
  discount_amount: 0,
  discount_value: 0,
  total: 20,
  amount_paid: 0,
  amount_due: 20,
  currency: 'USD',
  status: 'draft' as const,
  is_recurring: false,
  custom_fields: {},
  created_at: '2026-07-18T12:00:00.000Z',
  updated_at: '2026-07-18T12:00:00.000Z',
  items: [{ name: 'Service', quantity: 2, unit_price: 10, tax_rate: 0 }],
};

describe('core invoice API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isInvoiceGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isInvoiceGraphqlMutationsEnabled).mockReturnValue(false);
    vi.mocked(isInvoiceGraphqlSendEnabled).mockReturnValue(false);
    vi.mocked(isRecurringInvoiceGraphqlCloneEnabled).mockReturnValue(false);
  });

  it('keeps from-invoice cloning on REST by default', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        success: true,
        template: { id: 22 },
        sourceInvoicePreserved: true,
      },
    });
    await expect(createRecurringTemplateFromInvoice(
      12,
      {
        template_name: 'Retainer',
        frequency: 'monthly',
        start_date: '2026-07-21',
      },
      4,
    )).resolves.toEqual({ recurring_template_id: 22 });
    expect(api.post).toHaveBeenCalledWith(
      '/api/invoices/recurring/from-invoice/12',
      {
        template_name: 'Retainer',
        frequency: 'monthly',
        start_date: '2026-07-21',
      },
      { headers: { 'x-organization-id': '4' } },
    );
    expect(createRecurringInvoiceFromInvoiceViaGraphql).not.toHaveBeenCalled();
  });

  it('routes from-invoice cloning through its independent GraphQL flag', async () => {
    vi.mocked(isRecurringInvoiceGraphqlCloneEnabled).mockReturnValue(true);
    vi.mocked(createRecurringInvoiceFromInvoiceViaGraphql)
      .mockResolvedValue({ recurring_template_id: 22 });
    const input = {
      template_name: 'Retainer',
      frequency: 'monthly',
      start_date: '2026-07-21',
      end_date: '2026-12-21',
    };
    await expect(createRecurringTemplateFromInvoice(12, input, 4))
      .resolves.toEqual({ recurring_template_id: 22 });
    expect(createRecurringInvoiceFromInvoiceViaGraphql)
      .toHaveBeenCalledWith(12, input, 4);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('retains all five operations on REST by default', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        data: {
          data: [invoice],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      })
      .mockResolvedValueOnce({ data: { data: invoice } });
    vi.mocked(api.post).mockResolvedValue({ data: { data: invoice } });
    vi.mocked(api.put).mockResolvedValue({ data: { data: invoice } });
    vi.mocked(api.delete).mockResolvedValue({
      data: { data: { success: true } },
    });
    await getInvoices({ status: 'draft' }, 4);
    await getInvoice(12, 4);
    await createInvoice({ items: invoice.items }, 4);
    await updateInvoice(12, { notes: 'Updated' }, 4);
    await deleteInvoice(12, 4);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenCalledWith(
      '/api/invoices',
      { items: invoice.items },
      { headers: { 'x-organization-id': '4' } },
    );
    expect(createInvoiceViaGraphql).not.toHaveBeenCalled();
  });

  it('routes reads and CRUD through independent GraphQL flags', async () => {
    vi.mocked(isInvoiceGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(isInvoiceGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(getInvoicesViaGraphql).mockResolvedValue({
      invoices: [invoice],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(getInvoiceViaGraphql).mockResolvedValue(invoice);
    vi.mocked(createInvoiceViaGraphql).mockResolvedValue(invoice);
    vi.mocked(updateInvoiceViaGraphql).mockResolvedValue(invoice);
    vi.mocked(deleteInvoiceViaGraphql).mockResolvedValue({ success: true });
    await getInvoices({ search: 'INV' }, 4);
    await getInvoice(12, 4);
    await createInvoice({ items: invoice.items }, 4);
    await updateInvoice(12, { notes: 'Updated' }, 4);
    await deleteInvoice(12, 4);
    expect(getInvoicesViaGraphql).toHaveBeenCalledWith({ search: 'INV' }, 4);
    expect(getInvoiceViaGraphql).toHaveBeenCalledWith(12, 4);
    expect(createInvoiceViaGraphql).toHaveBeenCalledWith(
      { items: invoice.items },
      4,
    );
    expect(updateInvoiceViaGraphql).toHaveBeenCalledWith(
      12,
      { notes: 'Updated' },
      4,
    );
    expect(deleteInvoiceViaGraphql).toHaveBeenCalledWith(12, 4);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('keeps send on REST by default and cuts it over independently', async () => {
    const options = {
      subject: 'Your invoice', message: 'Please pay.',
      ccEmails: ['owner@example.com'], includePaymentLink: true,
    };
    vi.mocked(api.post).mockResolvedValue({
      data: { data: { ...invoice, emailSent: true } },
    });
    await sendInvoice(12, 4, options);
    expect(api.post).toHaveBeenCalledWith(
      '/api/invoices/12/send', options,
      { headers: { 'x-organization-id': '4' } },
    );

    vi.clearAllMocks();
    vi.mocked(isInvoiceGraphqlSendEnabled).mockReturnValue(true);
    vi.mocked(sendInvoiceViaGraphql).mockResolvedValue({
      ...invoice, status: 'sent', emailSent: true,
    });
    await sendInvoice(12, 4, options);
    expect(sendInvoiceViaGraphql).toHaveBeenCalledWith(12, options, 4);
    expect(api.post).not.toHaveBeenCalled();
  });
});
