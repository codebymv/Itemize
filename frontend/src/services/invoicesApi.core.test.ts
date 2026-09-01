import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  createInvoice,
  createPaymentLink,
  createRecurringTemplateFromInvoice,
  deleteInvoice,
  downloadInvoicePdf,
  getInvoicePdf,
  getInvoice,
  getInvoices,
  sendInvoice,
  updateInvoice,
} from './invoicesApi';
import {
  createInvoiceViaGraphql,
  createInvoicePaymentLinkViaGraphql,
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
vi.mock('./invoicesGraphql', () => ({
  createInvoiceViaGraphql: vi.fn(),
  createInvoicePaymentLinkViaGraphql: vi.fn(),
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
  tax_rate: 0,
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
  });

  it('routes from-invoice cloning through GraphQL without a REST fallback', async () => {
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

  it('routes all five core invoice operations through GraphQL', async () => {
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
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('sends invoices through GraphQL without an HTTP fallback', async () => {
    const options = {
      subject: 'Your invoice', message: 'Please pay.',
      ccEmails: ['owner@example.com'], includePaymentLink: true,
    };
    vi.mocked(sendInvoiceViaGraphql).mockResolvedValue({
      ...invoice, status: 'sent', emailSent: true,
    });
    await sendInvoice(12, 4, options, 'invoice-send-12');
    expect(sendInvoiceViaGraphql).toHaveBeenCalledWith(
      12, options, 4, 'invoice-send-12',
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('creates payment links through GraphQL without an HTTP fallback', async () => {
    vi.mocked(createInvoicePaymentLinkViaGraphql).mockResolvedValue({
      url: 'https://pay.test/graphql', session_id: 'cs_graphql',
    });
    await expect(createPaymentLink(12, 4, 'payment-link-12')).resolves.toEqual({
      url: 'https://pay.test/graphql', session_id: 'cs_graphql',
    });
    expect(createInvoicePaymentLinkViaGraphql).toHaveBeenCalledWith(
      12, 4, 'payment-link-12',
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('downloads the retained PDF boundary with tenant context and a safe filename', async () => {
    const pdf = new Blob(['%PDF-1.7\nfrontend-test'], { type: 'application/pdf' });
    vi.mocked(api.get).mockResolvedValue({
      data: pdf,
      headers: {
        'content-disposition': 'attachment; filename="../INV-00012.pdf"',
        'content-type': 'application/pdf',
      },
    });
    const anchor = document.createElement('a');
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    const createObjectURL = vi.fn(() => 'blob:invoice-pdf');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    await downloadInvoicePdf(12, 4);

    expect(api.get).toHaveBeenCalledWith('/api/invoices/12/pdf', {
      headers: { 'x-organization-id': '4' },
      responseType: 'blob',
    });
    expect(anchor.download).toBe('INV-00012.pdf');
    expect(anchor.href).toBe('blob:invoice-pdf');
    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledWith(pdf);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:invoice-pdf');
    expect(document.body.contains(anchor)).toBe(false);
    createElement.mockRestore();
  });

  it('returns the retained invoice PDF for document handoffs', async () => {
    const pdf = new Blob(['%PDF-1.7\nsignature-test'], { type: 'application/pdf' });
    vi.mocked(api.get).mockResolvedValue({
      data: pdf,
      headers: {
        'content-disposition': 'attachment; filename="INV-00012.pdf"',
        'content-type': 'application/pdf',
      },
    });

    await expect(getInvoicePdf(12, 4)).resolves.toEqual({
      blob: pdf,
      filename: 'INV-00012.pdf',
    });
    expect(api.get).toHaveBeenCalledWith('/api/invoices/12/pdf', {
      headers: { 'x-organization-id': '4' },
      responseType: 'blob',
    });
  });
});
