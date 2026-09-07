import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useManageSubscription } from './useManageSubscription';

/** One cell of the Manage account row: change plan, payment method, or invoices. */
export function ManageSubscriptionAction() {
  const { opening, open } = useManageSubscription();
  return (
    <section className="space-y-3" aria-labelledby="manage-subscription-title">
      <div className="space-y-1.5">
        <h3 id="manage-subscription-title" className="text-sm font-medium">Subscription</h3>
        <p className="text-sm text-muted-foreground">
          Change your plan, payment method, or invoices in the billing portal.
        </p>
      </div>
      <Button
        className="bg-primary text-primary-foreground interaction-button--primary"
        onClick={() => void open()}
        disabled={opening}
        aria-busy={opening}
      >
        {opening ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ExternalLink className="mr-2 h-4 w-4" />
        )}
        {opening ? 'Opening billing…' : 'Manage subscription'}
      </Button>
    </section>
  );
}
