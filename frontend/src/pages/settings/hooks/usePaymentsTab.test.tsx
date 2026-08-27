import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentSettings } from '@/services/invoicesApi';
import { GraphqlRequestError } from '@/services/graphqlClient';
import { usePaymentsTab } from './usePaymentsTab';

const mocks = vi.hoisted(() => ({
  getPaymentSettings: vi.fn(),
  getBusinesses: vi.fn(),
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
  getBusinesses: mocks.getBusinesses,
  updatePaymentSettings: vi.fn(),
  createBusiness: vi.fn(),
  updateBusiness: vi.fn(),
  deleteBusiness: vi.fn(),
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
    mocks.getBusinesses.mockResolvedValue([]);
  });

  it('keeps payment settings usable when business profiles fail to load', async () => {
    mocks.getBusinesses.mockRejectedValue(new Error('business query failed'));

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
    expect(mocks.getBusinesses).not.toHaveBeenCalled();
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
    expect(mocks.getBusinesses).toHaveBeenCalledWith(84);
    expect(result.current.settings).toEqual(settings);
    expect(result.current.loadError).toBeNull();
  });
});
