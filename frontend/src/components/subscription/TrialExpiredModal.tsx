import { AlertTriangle, ArrowRight } from 'lucide-react';
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

interface TrialExpiredModalProps {
  open: boolean;
  onClose: () => void;
  billing: BillingStatus | null;
}

export function TrialExpiredModal({ open, onClose, billing }: TrialExpiredModalProps) {
  const navigate = useNavigate();
  const trialPlanId = (billing?.plan || 'starter') as Plan;
  const trialPlanMeta = PLAN_METADATA[trialPlanId] || PLAN_METADATA.starter;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center items-center">
          <div className="w-16 h-16 mx-auto mb-3">
            <img src="/icon.png" alt="Itemize" className="w-full h-full object-contain" />
          </div>
          <DialogTitle className="text-xl font-bold">
            Trial Period Ended
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex items-start gap-2 justify-center rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-700 dark:text-amber-300">
              <p>Your {trialPlanMeta.displayName} trial has ended.</p>
              <p>Your account has been moved to the Free plan with limited access.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              onClick={() => { onClose(); navigate('/payment-settings'); }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Upgrade Now
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="w-full"
            >
              Continue on Free
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
