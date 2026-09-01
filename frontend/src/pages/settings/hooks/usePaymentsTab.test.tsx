import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentSettings } from '@/services/invoicesApi';
import { GraphqlRequestError } from '@/services/graphqlClient';
import { usePaymentsTab } from './usePaymentsTab';

const mocks = vi.hoisted(() => ({
  getPaymentSettings: vi.fn(),
  getBusinessPage: vi.fn(),
  updatePaymentSettings: vi.fn(),
  deleteBusiness: vi.fn(),
  useOrganization: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: mocks.useOrganization,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/services/invoicesApi', () => ({
  getPaymentSettings: mocks.getPaymentSettings,
  getBusinessPage: mocks.getBusinessPage,
  updatePaymentSettings: mocks.updatePaymentSettings,
  createBusiness: vi.fn(),
  updateBusiness: vi.fn(),
  deleteBusiness: mocks.deleteBusiness,
  uploadBusinessLogo: vi.fn(),
}));

const settings: PaymentSettings = {
  organization_id: 42,
  stripe_connected: false,
  invoice_prefix: 'INV-',
  next_invoice_number: 1,
  default_payment_terms: 30,
  default_tax_rate: 10,
  default_currency: 'USD',
};

describe('usePaymentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useOrganization.mockReturnValue({
      organizationId: 42,
      organization: { id: 42 },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    mocks.getPaymentSettings.mockResolvedValue(settings);
    mocks.getBusinessPage.mockResolvedValue({
      businesses: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    mocks.updatePaymentSettings.mockResolvedValue(settings);
    mocks.deleteBusiness.mockResolvedValue(undefined);
  });

  it('keeps payment settings usable when business profiles fail to load', async () => {
    mocks.getBusinessPage.mockRejectedValue(new Error('business query failed'));

    const { result } = renderHook(() => usePaymentsTab());

    await waitFor(() => expect(result.current.initialLoad).toBe(false));

    expect(result.current.settings).toEqual(settings);
    expect(result.current.loadError).toBeNull();
    expect(result.current.businesses).toEqual([]);
    expect(result.current.businessesLoadError).toBe(true);
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Failed to load payment data. Please try again.' }),
    );
  });

  it('shows a settings-specific recovery state when the core query fails', async () => {
    mocks.getPaymentSettings.mockRejectedValue(new Error('settings query failed'));

    const { result } = renderHook(() => usePaymentsTab());

    await waitFor(() => expect(result.current.initialLoad).toBe(false));

    expect(result.current.settings).toBeNull();
    expect(result.current.loadError).toBe('settings');
    expect(result.current.businessesLoadError).toBe(false);
  });

  it('distinguishes a plan restriction from missing payment data', async () => {
    mocks.getPaymentSettings.mockRejectedValue(
      new GraphqlRequestError(
        'This feature requires the Solo plan or higher',
        200,
        'FORBIDDEN',
        'SUBSCRIPTION_REQUIRED',
      ),
    );

    const { result } = renderHook(() => usePaymentsTab());

    await waitFor(() => expect(result.current.initialLoad).toBe(false));

    expect(result.current.settings).toBeNull();
    expect(result.current.loadError).toBe('subscription');
  });

  it('does not request protected payment data when the plan gate is closed', async () => {
    renderHook(() => usePaymentsTab({ enabled: false }));

    await Promise.resolve();

    expect(mocks.getPaymentSettings).not.toHaveBeenCalled();
    expect(mocks.getBusinessPage).not.toHaveBeenCalled();
  });

  it('finishes loading with an organization recovery state when no organization exists', async () => {
    mocks.useOrganization.mockReturnValue({
      organizationId: null,
      organization: null,
      isLoading: false,
      error: 'Failed to initialize organization.',
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => usePaymentsTab());

    await waitFor(() => expect(result.current.initialLoad).toBe(false));

    expect(result.current.loadError).toBe('organization');
    expect(mocks.getPaymentSettings).not.toHaveBeenCalled();
    expect(mocks.getBusinessPage).not.toHaveBeenCalled();
  });

  it('continues loading when organization refresh repairs the account', async () => {
    const refresh = vi.fn().mockResolvedValue({ id: 84 });
    mocks.useOrganization.mockReturnValue({
      organizationId: null,
      organization: null,
      isLoading: false,
      error: null,
      refresh,
    });

    const { result } = renderHook(() => usePaymentsTab());

    await waitFor(() => expect(result.current.initialLoad).toBe(false));

    expect(refresh).toHaveBeenCalledOnce();
    expect(mocks.getPaymentSettings).toHaveBeenCalledWith(84);
    expect(mocks.getBusinessPage).toHaveBeenCalledWith(1, 20, 84);
    expect(result.current.settings).toEqual(settings);
    expect(result.current.loadError).toBeNull();
  });

  it('loads additional business pages only when requested', async () => {
    const business = {
      id: 1, organization_id: 42, name: 'Primary', is_active: true,
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
    };
    mocks.getBusinessPage
      .mockResolvedValueOnce({
        businesses: [business],
        pagination: { page: 1, limit: 20, total: 21, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        businesses: [{ ...business, id: 2, name: 'Secondary' }],
        pagination: { page: 2, limit: 20, total: 21, totalPages: 2 },
      });
    const { result } = renderHook(() => usePaymentsTab());
    await waitFor(() => expect(result.current.hasMoreBusinesses).toBe(true));

    await act(async () => result.current.loadMoreBusinesses());

    expect(mocks.getBusinessPage).toHaveBeenLastCalledWith(2, 20, 42);
    expect(result.current.businesses.map((item) => item.name)).toEqual(['Primary', 'Secondary']);
    expect(result.current.hasMoreBusinesses).toBe(false);
  });

  it('admits only one settings save before pending state renders', async () => {
    let resolveSave!: (value: PaymentSettings) => void;
    mocks.updatePaymentSettings.mockImplementation(() => new Promise<PaymentSettings>((resolve) => {
      resolveSave = resolve;
    }));
    const { result } = renderHook(() => usePaymentsTab());
    await waitFor(() => expect(result.current.initialLoad).toBe(false));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.handleSaveSettings();
      second = result.current.handleSaveSettings();
    });

    expect(mocks.updatePaymentSettings).toHaveBeenCalledTimes(1);
    resolveSave(settings);
    await act(async () => Promise.all([first, second]));
  });

  it('deletes the business selected for deletion rather than the last edited profile', async () => {
    const business = {
      id: 7, organization_id: 42, name: 'Selected business', is_active: true,
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
    };
    mocks.getBusinessPage.mockResolvedValue({
      businesses: [business],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const { result } = renderHook(() => usePaymentsTab());
    await waitFor(() => expect(result.current.businesses).toHaveLength(1));

    act(() => result.current.handleDeleteClick(business));
    await act(async () => result.current.handleDeleteBusiness());

    expect(mocks.deleteBusiness).toHaveBeenCalledWith(7, 42);
    expect(result.current.businesses).toEqual([]);
  });
});
