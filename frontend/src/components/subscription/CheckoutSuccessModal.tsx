import { useEffect, useState } from 'react';
import { CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { billingApi, BillingStatus } from '@/services/billingApi';
import { PLAN_METADATA, type Plan } from '@/lib/subscription';

interface CheckoutSuccessModalProps {
  open: boolean;
  onClose: () => void;
}

export function CheckoutSuccessModal({ open, onClose }: CheckoutSuccessModalProps) {
  const navigate = useNavigate();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    billingApi.getBillingStatus()
      .then(res => {
        if (res.success && res.data) setBilling(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const planId = (billing?.plan || 'starter') as Plan;
  const planMeta = PLAN_METADATA[planId] || PLAN_METADATA.starter;
  const isTrialing = billing?.subscription_status === 'trialing';
  const trialEndDate = billing?.trial_ends_at
    ? new Date(billing.trial_ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const PLAN_HIGHLIGHTS: Record<string, string[]> = {
    starter: ['Contact management', 'Sales pipelines', 'Form builder', 'Email templates'],
    unlimited: ['Everything in Starter', 'Advanced workflows', 'API access', 'Unlimited organizations'],
    pro: ['Everything in Growth', 'White labeling', 'SaaS mode', 'Priority support'],
    free: ['Basic access'],
  };

  const highlights = PLAN_HIGHLIGHTS[planId] || PLAN_HIGHLIGHTS.starter;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center items-center">
          <div className="w-16 h-16 mx-auto mb-3">
            <img src="/icon.png" alt="Itemize" className="w-full h-full object-contain" />
          </div>
          <DialogTitle className="text-xl font-bold">
            {loading ? 'Setting up your plan...' : `Welcome to ${planMeta.displayName}`}
          </DialogTitle>
        </DialogHeader>

        {!loading && (
          <div className="space-y-4 pt-2">
            {isTrialing && trialEndDate && (
              <div className="flex items-start gap-2 justify-center rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-4 py-2.5">
                <Clock className="h-4 w-4 text-blue-700 dark:text-blue-300 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p>Your 14-day free trial is active.</p>
                  <p>Trial ends {trialEndDate}.</p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Your plan includes:</p>
              <ul className="space-y-2">
                {highlights.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Button
              onClick={() => { onClose(); navigate('/dashboard'); }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
