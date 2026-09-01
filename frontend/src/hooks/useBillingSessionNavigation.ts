import { useCallback, useEffect, useRef } from 'react';
import type { Plan } from '@/lib/subscription';
import { billingApi } from '@/services/billingApi';
import { useStableMutationKey } from './useStableMutationKey';

type BillingSessionKind = 'checkout' | 'portal';
type NavigateToSession = (url: string) => void;

type ConfirmedSession = {
  signature: string;
  url: string;
};

type PendingSession = {
  signature: string;
  promise: Promise<void>;
};

const defaultNavigate: NavigateToSession = (url) => {
  window.location.assign(url);
};

const navigationError = (kind: BillingSessionKind, cause: unknown): Error => {
  const label = kind === 'checkout' ? 'checkout' : 'billing portal';
  const error = new Error(
    `Your secure ${label} session is ready, but this browser could not open it. Try again.`,
  );
  error.cause = cause;
  return error;
};

const billingContextChanged = (): Error => new Error(
  'The active organization changed before the billing session was ready. Try again.',
);

/**
 * Owns Stripe-session attempts above the transport layer.
 *
 * An ambiguous request failure retains its key, duplicate events share one
 * in-flight promise, and a confirmed session is reused if navigation fails.
 */
export const useBillingSessionNavigation = (
  organizationId: number | null,
  navigate: NavigateToSession = defaultNavigate,
) => {
  const {
    begin: beginCheckout,
    release: releaseCheckout,
    reset: resetCheckout,
  } = useStableMutationKey('billing-checkout');
  const {
    begin: beginPortal,
    release: releasePortal,
    reset: resetPortal,
  } = useStableMutationKey('billing-portal');
  const checkoutPending = useRef<PendingSession | null>(null);
  const portalPending = useRef<PendingSession | null>(null);
  const checkoutConfirmed = useRef<ConfirmedSession | null>(null);
  const portalConfirmed = useRef<ConfirmedSession | null>(null);
  const scopeGeneration = useRef(0);

  const clearSessions = useCallback(() => {
    resetCheckout();
    resetPortal();
    checkoutPending.current = null;
    portalPending.current = null;
    checkoutConfirmed.current = null;
    portalConfirmed.current = null;
  }, [resetCheckout, resetPortal]);

  useEffect(() => {
    scopeGeneration.current += 1;
    clearSessions();
    return () => {
      scopeGeneration.current += 1;
      clearSessions();
    };
  }, [organizationId, clearSessions]);

  const navigateConfirmed = useCallback((
    kind: BillingSessionKind,
    session: ConfirmedSession,
  ) => {
    try {
      navigate(session.url);
    } catch (error) {
      throw navigationError(kind, error);
    }
  }, [navigate]);

  const startCheckout = useCallback((
    planId: Exclude<Plan, 'free'>,
    billingPeriod: 'monthly' | 'yearly' = 'monthly',
  ): Promise<void> => {
    const generation = scopeGeneration.current;
    const signature = JSON.stringify({ organizationId, planId, billingPeriod });
    if (checkoutConfirmed.current?.signature === signature) {
      try {
        navigateConfirmed('checkout', checkoutConfirmed.current);
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    }
    if (checkoutPending.current?.signature === signature) {
      return checkoutPending.current.promise;
    }
    if (checkoutPending.current) {
      return Promise.reject(new Error('Another checkout session is already being created.'));
    }

    const idempotencyKey = beginCheckout(signature);
    if (!idempotencyKey) {
      return Promise.reject(new Error('A checkout session is already being created.'));
    }

    const promise = (async () => {
      let confirmed: ConfirmedSession;
      try {
        const result = await billingApi.createCheckoutSession({
          planId,
          billingPeriod,
          mode: 'subscription',
          successUrl: `${window.location.origin}/payment-settings?checkout=success`,
          cancelUrl: `${window.location.origin}/payment-settings?checkout=canceled`,
          idempotencyKey,
        });
        if (!result.success || !result.data?.url) {
          throw new Error(result.error || 'Failed to create checkout session');
        }
        if (generation !== scopeGeneration.current) throw billingContextChanged();
        confirmed = { signature, url: result.data.url };
        checkoutConfirmed.current = confirmed;
        resetCheckout();
      } catch (error) {
        if (generation === scopeGeneration.current) releaseCheckout();
        throw error;
      }
      navigateConfirmed('checkout', confirmed);
    })();

    checkoutPending.current = { signature, promise };
    void promise.finally(() => {
      if (checkoutPending.current?.promise === promise) checkoutPending.current = null;
    }).catch(() => undefined);
    return promise;
  }, [beginCheckout, navigateConfirmed, organizationId, releaseCheckout, resetCheckout]);

  const openBillingPortal = useCallback((): Promise<void> => {
    const generation = scopeGeneration.current;
    const returnUrl = `${window.location.origin}/payment-settings`;
    const signature = JSON.stringify({ organizationId, returnUrl });
    if (portalConfirmed.current?.signature === signature) {
      try {
        navigateConfirmed('portal', portalConfirmed.current);
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    }
    if (portalPending.current?.signature === signature) {
      return portalPending.current.promise;
    }

    const idempotencyKey = beginPortal(signature);
    if (!idempotencyKey) {
      return Promise.reject(new Error('A billing portal session is already being created.'));
    }

    const promise = (async () => {
      let confirmed: ConfirmedSession;
      try {
        const result = await billingApi.createPortalSession(returnUrl, idempotencyKey);
        if (!result.success || !result.data?.url) {
          throw new Error(result.error || 'Failed to create portal session');
        }
        if (generation !== scopeGeneration.current) throw billingContextChanged();
        confirmed = { signature, url: result.data.url };
        portalConfirmed.current = confirmed;
        resetPortal();
      } catch (error) {
        if (generation === scopeGeneration.current) releasePortal();
        throw error;
      }
      navigateConfirmed('portal', confirmed);
    })();

    portalPending.current = { signature, promise };
    void promise.finally(() => {
      if (portalPending.current?.promise === promise) portalPending.current = null;
    }).catch(() => undefined);
    return promise;
  }, [beginPortal, navigateConfirmed, organizationId, releasePortal, resetPortal]);

  return { startCheckout, openBillingPortal };
};
