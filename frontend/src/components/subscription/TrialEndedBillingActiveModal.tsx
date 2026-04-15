import { CheckCircle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PLAN_METADATA, type Plan } from '@/lib/subscription';
import type { BillingStatus } from '@/services/billingApi';

interface TrialEndedBillingActiveModalProps {
  open: boolean;
  onClose: () => void;
  billing: BillingStatus | null;
}

export function TrialEndedBillingActiveModal({ open, onClose, billing }: TrialEndedBillingActiveModalProps) {
  const navigate = useNavigate();
  const planId = (billing?.plan || 'starter') as Plan;
  const planMeta = PLAN_METADATA[planId] || PLAN_METADATA.starter;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center items-center">
          <div className="w-16 h-16 mx-auto mb-3">
            <img src="/icon.png" alt="Itemize" className="w-full h-full object-contain" />
          </div>
          <DialogTitle className="text-xl font-bold">
            You&apos;re Now on {planMeta.displayName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex items-start gap-2 justify-center rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-4 py-2.5">
            <CheckCircle className="h-4 w-4 text-blue-700 dark:text-blue-300 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p>Your trial period has ended and your {planMeta.displayName} subscription is now active.</p>
              <p>Billing will continue according to your plan.</p>
            </div>
          </div>

          <Button
            onClick={() => { onClose(); navigate('/dashboard'); }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            Got it
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
