import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRecurringInvoice,
  deleteRecurringInvoice,
  generateRecurringInvoiceNow,
  getRecurringInvoice,
  getRecurringInvoiceHistory,
  getRecurringInvoiceNumberPreview,
  getRecurringInvoicePage,
  getRecurringInvoices,
  pauseRecurringInvoice,
  resumeRecurringInvoice,
  updateRecurringInvoice,
} from './recurringInvoicesApi';
import {
  createRecurringInvoiceViaGraphql,
  deleteRecurringInvoiceViaGraphql,
  generateRecurringInvoiceNowViaGraphql,
  getRecurringInvoiceViaGraphql,
  getRecurringInvoiceHistoryViaGraphql,
  getRecurringInvoiceNumberPreviewViaGraphql,
  getRecurringInvoicePageViaGraphql,
  getRecurringInvoicesViaGraphql,
  pauseRecurringInvoiceViaGraphql,
  resumeRecurringInvoiceViaGraphql,
  updateRecurringInvoiceViaGraphql,
} from './recurringInvoicesGraphql';

vi.mock('./recurringInvoicesGraphql', () => ({
  createRecurringInvoiceViaGraphql: vi.fn(),
  deleteRecurringInvoiceViaGraphql: vi.fn(),
  generateRecurringInvoiceNowViaGraphql: vi.fn(),
  getRecurringInvoiceViaGraphql: vi.fn(),
  getRecurringInvoiceHistoryViaGraphql: vi.fn(),
  getRecurringInvoiceNumberPreviewViaGraphql: vi.fn(),
  getRecurringInvoicePageViaGraphql: vi.fn(),
  getRecurringInvoicesViaGraphql: vi.fn(),
  pauseRecurringInvoiceViaGraphql: vi.fn(),
  resumeRecurringInvoiceViaGraphql: vi.fn(),
  updateRecurringInvoiceViaGraphql: vi.fn(),
}));

const recurring = {
  id: 8, organization_id: 4, template_name: 'Retainer',
  frequency: 'monthly' as const, start_date: '2026-07-20',
  next_run_date: '2026-07-20', status: 'active' as const,
  subtotal: 20, tax_amount: 1, discount_amount: 0, discount_value: 0,
  total: 21, currency: 'USD', invoices_generated: 0,
  created_at: '2026-07-19T00:00:00.000Z',
  updated_at: '2026-07-19T00:00:00.000Z',
  items: [{ name: 'Service', quantity: 2, unit_price: 10, tax_rate: 5 }],
};

const createInput = {
  template_name: 'Retainer', frequency: 'monthly' as const,
  start_date: '2026-07-20', items: recurring.items,
};

describe('recurring invoice API transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes every read through GraphQL without a REST fallback', async () => {
    vi.mocked(getRecurringInvoicesViaGraphql).mockResolvedValue([recurring]);
    vi.mocked(getRecurringInvoiceViaGraphql).mockResolvedValue(recurring);
    vi.mocked(getRecurringInvoiceHistoryViaGraphql).mockResolvedValue([]);
    vi.mocked(getRecurringInvoiceNumberPreviewViaGraphql)
      .mockResolvedValue('INV-00009');
    vi.mocked(getRecurringInvoicePageViaGraphql).mockResolvedValue({
      recurringInvoices: [recurring],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      stats: { total: 1, active: 1, paused: 0, completed: 0 },
    });

    await expect(getRecurringInvoices('paused', 4)).resolves.toEqual([recurring]);
    await expect(getRecurringInvoicePage({ status: 'active', page: 1 }, 4))
      .resolves.toMatchObject({ recurringInvoices: [recurring] });
    await expect(getRecurringInvoice(8, 4)).resolves.toEqual(recurring);
    await expect(getRecurringInvoiceHistory(8, 4)).resolves.toEqual([]);
    await expect(getRecurringInvoiceNumberPreview(4)).resolves.toBe('INV-00009');

    expect(getRecurringInvoicesViaGraphql).toHaveBeenCalledWith('paused', 4);
    expect(getRecurringInvoicePageViaGraphql).toHaveBeenCalledWith(
      { status: 'active', page: 1 }, 4, undefined,
    );
    expect(getRecurringInvoiceViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(getRecurringInvoiceHistoryViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(getRecurringInvoiceNumberPreviewViaGraphql).toHaveBeenCalledWith(4);
  });

  it('routes CRUD, lifecycle, and generation through GraphQL without REST fallbacks', async () => {
    vi.mocked(createRecurringInvoiceViaGraphql).mockResolvedValue(recurring);
    vi.mocked(updateRecurringInvoiceViaGraphql).mockResolvedValue(recurring);
    vi.mocked(deleteRecurringInvoiceViaGraphql).mockResolvedValue({ success: true });
    vi.mocked(pauseRecurringInvoiceViaGraphql).mockResolvedValue({
      ...recurring, status: 'paused',
    });
    vi.mocked(resumeRecurringInvoiceViaGraphql).mockResolvedValue(recurring);
    vi.mocked(generateRecurringInvoiceNowViaGraphql).mockResolvedValue({
      invoice_number: 'INV-00010',
      next_run_date: '2026-08-20',
      template_status: 'active',
      replayed: false,
    });

    await expect(createRecurringInvoice(createInput, 4)).resolves.toEqual(recurring);
    await expect(updateRecurringInvoice(8, { notes: 'Updated' }, 4))
      .resolves.toEqual(recurring);
    await expect(deleteRecurringInvoice(8, 4)).resolves.toEqual({ success: true });
    await expect(pauseRecurringInvoice(8, 4)).resolves.toMatchObject({ status: 'paused' });
    await expect(resumeRecurringInvoice(8, 4)).resolves.toEqual(recurring);
    await expect(generateRecurringInvoiceNow(8, 4, 'generation-request-8'))
      .resolves.toEqual({
        invoice_number: 'INV-00010',
        next_run_date: '2026-08-20',
        template_status: 'active',
        replayed: false,
      });

    expect(createRecurringInvoiceViaGraphql).toHaveBeenCalledWith(createInput, 4);
    expect(updateRecurringInvoiceViaGraphql)
      .toHaveBeenCalledWith(8, { notes: 'Updated' }, 4);
    expect(deleteRecurringInvoiceViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(pauseRecurringInvoiceViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(resumeRecurringInvoiceViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(generateRecurringInvoiceNowViaGraphql).toHaveBeenCalledWith(
      8, 4, 'generation-request-8',
    );
  });
});
