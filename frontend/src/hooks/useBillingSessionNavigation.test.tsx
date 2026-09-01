import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { billingApi } from '@/services/billingApi';
import { useBillingSessionNavigation } from './useBillingSessionNavigation';

vi.mock('@/services/billingApi', () => ({
  billingApi: {
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
  },
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('useBillingSessionNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let sequence = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `billing-request-${++sequence}` });
  });

  it('coalesces duplicate checkout events into one provider-session request', async () => {
    const request = deferred<{
      success: boolean;
      data: { url: string };
    }>();
    vi.mocked(billingApi.createCheckoutSession).mockReturnValue(request.promise);
    const navigate = vi.fn();
    const { result } = renderHook(() => useBillingSessionNavigation(7, navigate));

    const first = result.current.startCheckout('starter', 'monthly');
    const duplicate = result.current.startCheckout('starter', 'monthly');
    expect(duplicate).toBe(first);
    expect(billingApi.createCheckoutSession).toHaveBeenCalledTimes(1);

    request.resolve({ success: true, data: { url: 'https://stripe.test/checkout' } });
    await act(async () => first);

    expect(billingApi.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'starter',
        billingPeriod: 'monthly',
        idempotencyKey: 'billing-request-1',
      }),
    );
    expect(navigate).toHaveBeenCalledWith('https://stripe.test/checkout');
  });

  it('reuses the key after an ambiguous failure and rotates it when the payload changes', async () => {
    vi.mocked(billingApi.createCheckoutSession)
      .mockResolvedValueOnce({ success: false, error: 'Network interrupted' })
      .mockResolvedValueOnce({ success: false, error: 'Network interrupted again' })
      .mockResolvedValueOnce({ success: false, error: 'Provider unavailable' });
    const { result } = renderHook(() => useBillingSessionNavigation(7, vi.fn()));

    await expect(result.current.startCheckout('starter', 'monthly'))
      .rejects.toThrow('Network interrupted');
    await expect(result.current.startCheckout('starter', 'monthly'))
      .rejects.toThrow('Network interrupted again');
    await expect(result.current.startCheckout('unlimited', 'monthly'))
      .rejects.toThrow('Provider unavailable');

    expect(vi.mocked(billingApi.createCheckoutSession).mock.calls.map(
      ([input]) => input.idempotencyKey,
    )).toEqual([
      'billing-request-1',
      'billing-request-1',
      'billing-request-2',
    ]);
  });

  it('reuses a confirmed session instead of creating another when navigation fails', async () => {
    vi.mocked(billingApi.createPortalSession).mockResolvedValue({
      success: true,
      data: { url: 'https://stripe.test/portal' },
    });
    const navigate = vi.fn()
      .mockImplementationOnce(() => { throw new Error('Navigation blocked'); });
    const { result } = renderHook(() => useBillingSessionNavigation(7, navigate));

    await expect(result.current.openBillingPortal()).rejects.toThrow(
      'secure billing portal session is ready',
    );
    await expect(result.current.openBillingPortal()).resolves.toBeUndefined();

    expect(billingApi.createPortalSession).toHaveBeenCalledTimes(1);
    expect(billingApi.createPortalSession).toHaveBeenCalledWith(
      expect.stringContaining('/payment-settings'),
      'billing-request-1',
    );
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('does not navigate to a session created for an organization that is no longer active', async () => {
    const firstRequest = deferred<{
      success: boolean;
      data: { url: string };
    }>();
    vi.mocked(billingApi.createCheckoutSession)
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce({
        success: true,
        data: { url: 'https://stripe.test/current-organization' },
      });
    const navigate = vi.fn();
    const { result, rerender } = renderHook(
      ({ organizationId }) => useBillingSessionNavigation(organizationId, navigate),
      { initialProps: { organizationId: 7 } },
    );

    const staleAttempt = result.current.startCheckout('starter', 'monthly');
    rerender({ organizationId: 8 });
    firstRequest.resolve({
      success: true,
      data: { url: 'https://stripe.test/stale-organization' },
    });

    await expect(staleAttempt).rejects.toThrow('active organization changed');
    expect(navigate).not.toHaveBeenCalled();
    await expect(result.current.startCheckout('starter', 'monthly')).resolves.toBeUndefined();
    expect(navigate).toHaveBeenCalledWith('https://stripe.test/current-organization');
  });
});
