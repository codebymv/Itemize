import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useSubscriptionFeatures, useSubscriptionState } from '@/contexts/SubscriptionContext';

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * The billing portal action, shared by the Manage account row and the quiet
 * link in the plan card. Available only for a live paid plan: trials keep
 * their own Subscribe call to action, and cancelled or free plans have no
 * portal to manage.
 */
export function useManageSubscription() {
  const { subscription, planName } = useSubscriptionState();
  const { openBillingPortal } = useSubscriptionFeatures();
  const { toast } = useToast();
  const [opening, setOpening] = useState(false);

  const plan = planName?.toLowerCase() || 'free';
  const available = plan !== 'free' && subscription?.status === 'active';

  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      await openBillingPortal();
    } catch (error) {
      setOpening(false);
      toast({
        title: 'Error',
        description: getErrorMessage(error, 'Failed to open billing portal'),
        variant: 'destructive',
      });
    }
  };

  return { available, opening, open };
}
