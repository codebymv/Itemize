import { useEffect, useState } from "react";
import { CheckCircle, Clock, ArrowRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { billingApi, BillingStatus } from "@/services/billingApi";
import { PLAN_METADATA, type Plan } from "@/lib/subscription";

interface CheckoutSuccessModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmed?: () => void | Promise<void>;
}

const CONFIRMATION_ATTEMPTS = 5;
const CONFIRMATION_DELAY_MS = 1500;

const isConfirmedSubscription = (billing: BillingStatus): boolean =>
  Boolean(billing.stripe_subscription_id) &&
  ["active", "trialing"].includes(billing.subscription_status);

export function CheckoutSuccessModal({
  open,
  onClose,
  onConfirmed,
}: CheckoutSuccessModalProps) {
  const navigate = useNavigate();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [confirmationState, setConfirmationState] = useState<
    "checking" | "confirmed" | "delayed"
  >("checking");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    setBilling(null);
    setConfirmationState("checking");

    const checkSubscription = async (attempt: number): Promise<void> => {
      const response = await billingApi.getBillingStatus().catch(() => null);
      if (canceled) return;

      if (
        response?.success &&
        response.data &&
        isConfirmedSubscription(response.data)
      ) {
        setBilling(response.data);
        setConfirmationState("confirmed");
        await onConfirmed?.();
        return;
      }

      if (attempt >= CONFIRMATION_ATTEMPTS) {
        setConfirmationState("delayed");
        return;
      }

      timer = setTimeout(
        () => void checkSubscription(attempt + 1),
        CONFIRMATION_DELAY_MS,
      );
    };

    void checkSubscription(1);
    return () => {
      canceled = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, onConfirmed, retryKey]);

  const planId = (billing?.plan || "starter") as Plan;
  const planMeta = PLAN_METADATA[planId] || PLAN_METADATA.starter;
  const isTrialing = billing?.subscription_status === "trialing";
  const trialEndDate = billing?.trial_ends_at
    ? new Date(billing.trial_ends_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const PLAN_HIGHLIGHTS: Record<string, string[]> = {
    starter: [
      "Contacts and pipelines",
      "Invoices and e-signatures",
      "Inbox, forms, and landing pages",
      "Full workspace included",
    ],
    unlimited: [
      "Everything in Solo",
      "Unlimited e-signatures",
      "Automations",
      "Room for a studio team",
    ],
    pro: ["Everything in Studio", "Legacy agency features"],
    free: ["Basic access"],
  };

  const highlights = PLAN_HIGHLIGHTS[planId] || PLAN_HIGHLIGHTS.starter;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center items-center">
          <div className="w-16 h-16 mx-auto mb-3">
            <img
              src="/icon.png"
              alt="Itemize"
              className="w-full h-full object-contain"
            />
          </div>
          <DialogTitle className="text-xl font-bold">
            {confirmationState === "confirmed"
              ? `Welcome to ${planMeta.displayName}`
              : confirmationState === "delayed"
                ? "Still waiting for confirmation"
                : "Confirming your subscription..."}
          </DialogTitle>
        </DialogHeader>

        {confirmationState === "checking" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <p className="text-sm text-muted-foreground">
              Stripe is securely confirming your subscription.
            </p>
          </div>
        )}

        {confirmationState === "delayed" && (
          <div className="space-y-4 py-3 text-center">
            <p className="text-sm text-muted-foreground">
              We haven&apos;t received confirmation from Stripe yet. If you
              completed checkout, wait a moment and check again.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={onClose}>
                Back to billing
              </Button>
              <Button onClick={() => setRetryKey((value) => value + 1)}>
                Check again
              </Button>
            </div>
          </div>
        )}

        {confirmationState === "confirmed" && (
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
              <p className="text-sm font-medium text-muted-foreground">
                Your plan includes:
              </p>
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
              onClick={() => {
                onClose();
                navigate("/dashboard");
              }}
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
