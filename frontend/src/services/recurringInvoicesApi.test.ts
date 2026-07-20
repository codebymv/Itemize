import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  createRecurringInvoice,
  deleteRecurringInvoice,
  generateRecurringInvoiceNow,
  getRecurringInvoice,
  getRecurringInvoiceHistory,
  getRecurringInvoiceNumberPreview,
  getRecurringInvoices,
  pauseRecurringInvoice,
  resumeRecurringInvoice,
  updateRecurringInvoice,
} from './recurringInvoicesApi';
import {
  isRecurringInvoiceGraphqlLifecycleEnabled,
  isRecurringInvoiceGraphqlMutationsEnabled,
  isRecurringInvoiceGraphqlReadsEnabled,
} from './graphqlClient';
import {
  createRecurringInvoiceViaGraphql,
  deleteRecurringInvoiceViaGraphql,
  getRecurringInvoiceViaGraphql,
  getRecurringInvoiceHistoryViaGraphql,
  getRecurringInvoicesViaGraphql,
  pauseRecurringInvoiceViaGraphql,
  resumeRecurringInvoiceViaGraphql,
  updateRecurringInvoiceViaGraphql,
} from './recurringInvoicesGraphql';

vi.mock('@/lib/api', () => ({
  default: { delete: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));
vi.mock('./graphqlClient', () => ({
  isRecurringInvoiceGraphqlLifecycleEnabled: vi.fn(),
  isRecurringInvoiceGraphqlMutationsEnabled: vi.fn(),
  isRecurringInvoiceGraphqlReadsEnabled: vi.fn(),
}));
vi.mock('./recurringInvoicesGraphql', () => ({
  createRecurringInvoiceViaGraphql: vi.fn(),
  deleteRecurringInvoiceViaGraphql: vi.fn(),
  getRecurringInvoiceViaGraphql: vi.fn(),
  getRecurringInvoiceHistoryViaGraphql: vi.fn(),
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

describe('recurring invoice API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRecurringInvoiceGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isRecurringInvoiceGraphqlMutationsEnabled).mockReturnValue(false);
    vi.mocked(isRecurringInvoiceGraphqlLifecycleEnabled).mockReturnValue(false);
  });

  it('keeps CRUD and lifecycle operations on REST by default', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { recurring: [recurring] } })
      .mockResolvedValueOnce({ data: recurring })
      .mockResolvedValueOnce({ data: { invoices: [] } })
      .mockResolvedValueOnce({ data: { invoice_number: 'INV-00009' } });
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: recurring })
      .mockResolvedValueOnce({ data: recurring })
      .mockResolvedValueOnce({ data: recurring })
      .mockResolvedValueOnce({ data: { invoice_number: 'INV-00010' } });
    vi.mocked(api.put).mockResolvedValue({ data: recurring });
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });
    await getRecurringInvoices('all', 4);
    await getRecurringInvoice(8, 4);
    await getRecurringInvoiceHistory(8, 4);
    await createRecurringInvoice(createInput, 4);
    await updateRecurringInvoice(8, { notes: 'Updated' }, 4);
    await deleteRecurringInvoice(8, 4);
    await pauseRecurringInvoice(8, 4);
    await resumeRecurringInvoice(8, 4);
    await generateRecurringInvoiceNow(8, 4);
    await getRecurringInvoiceNumberPreview(4);
    expect(api.put).toHaveBeenCalledWith(
      '/api/invoices/recurring/8', { notes: 'Updated' },
      { headers: { 'x-organization-id': '4' } },
    );
    expect(createRecurringInvoiceViaGraphql).not.toHaveBeenCalled();
  });

  it('switches reads and CRUD while lifecycle protocols remain independently REST', async () => {
    vi.mocked(isRecurringInvoiceGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(isRecurringInvoiceGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(getRecurringInvoicesViaGraphql).mockResolvedValue([recurring]);
    vi.mocked(getRecurringInvoiceViaGraphql).mockResolvedValue(recurring);
    vi.mocked(getRecurringInvoiceHistoryViaGraphql).mockResolvedValue([]);
    vi.mocked(createRecurringInvoiceViaGraphql).mockResolvedValue(recurring);
    vi.mocked(updateRecurringInvoiceViaGraphql).mockResolvedValue(recurring);
    vi.mocked(deleteRecurringInvoiceViaGraphql).mockResolvedValue({ success: true });
    vi.mocked(api.post).mockResolvedValue({ data: recurring });
    await getRecurringInvoices('paused', 4);
    await getRecurringInvoice(8, 4);
    await getRecurringInvoiceHistory(8, 4);
    await createRecurringInvoice(createInput, 4);
    await updateRecurringInvoice(8, { notes: 'Updated' }, 4);
    await deleteRecurringInvoice(8, 4);
    await pauseRecurringInvoice(8, 4);
    expect(getRecurringInvoicesViaGraphql).toHaveBeenCalledWith('paused', 4);
    expect(updateRecurringInvoiceViaGraphql).toHaveBeenCalledWith(
      8, { notes: 'Updated' }, 4,
    );
    expect(getRecurringInvoiceHistoryViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(api.post).toHaveBeenCalledWith(
      '/api/invoices/recurring/8/pause', {},
      { headers: { 'x-organization-id': '4' } },
    );
  });

  it('switches pause and resume without moving generate-now to GraphQL', async () => {
    vi.mocked(isRecurringInvoiceGraphqlLifecycleEnabled).mockReturnValue(true);
    vi.mocked(pauseRecurringInvoiceViaGraphql).mockResolvedValue({
      ...recurring, status: 'paused',
    });
    vi.mocked(resumeRecurringInvoiceViaGraphql).mockResolvedValue(recurring);
    vi.mocked(api.post).mockResolvedValue({
      data: { invoice_number: 'INV-00010' },
    });
    await pauseRecurringInvoice(8, 4);
    await resumeRecurringInvoice(8, 4);
    await generateRecurringInvoiceNow(8, 4);
    expect(pauseRecurringInvoiceViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(resumeRecurringInvoiceViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      '/api/invoices/recurring/8/generate-now', {},
      { headers: { 'x-organization-id': '4' } },
    );
  });
});
