import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  Loader2,
  Zap,
  Crown,
  Building2,
  User,
} from "lucide-react";
import {
  useSubscriptionFeatures,
  useSubscriptionState,
} from "@/contexts/SubscriptionContext";
import { Plan, PLAN_METADATA, PLAN_PRICING } from "@/lib/subscription";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/Spinner";

const PLAN_ICONS = {
  free: User,
  starter: Zap,
  unlimited: Crown,
  pro: Building2,
};

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export function SubscriptionStatus() {
  const { subscription, planName, isLoading } = useSubscriptionState();
  const { openBillingPortal } = useSubscriptionFeatures();
  const { toast } = useToast();
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Spinner size="md" variant="brand" />
      </div>
    );
  }

  // Default to free if no plan or no subscription
  const currentPlan = (planName?.toLowerCase() as Plan) || "free";
  const planMetadata = PLAN_METADATA[currentPlan] || PLAN_METADATA.free;
  const planPricing = PLAN_PRICING[currentPlan] || PLAN_PRICING.free;
  const PlanIcon = PLAN_ICONS[currentPlan] || User;

  // Calculate renewal date
  const getRenewalDate = () => {
    if (
      !subscription ||
      subscription.status === "canceled" ||
      subscription.status === "unpaid"
    ) {
      return null;
    }

    if (subscription.currentPeriod?.end) {
      try {
        const renewalDate = new Date(subscription.currentPeriod.end);
        return renewalDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      } catch {
        return null;
      }
    }
    return null;
  };

  const renewalDate = getRenewalDate();
  const isPaidPlan =
    currentPlan !== "free" && subscription?.status === "active";

  const handleManageSubscription = async () => {
    if (isOpeningPortal) return;

    setIsOpeningPortal(true);
    try {
      await openBillingPortal();
    } catch (error) {
      setIsOpeningPortal(false);
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to open billing portal"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-6 border-b border-border pb-5">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Current Plan
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <PlanIcon className="icon-accent h-5 w-5" />
            <span className="truncate text-2xl font-semibold">
              {planMetadata.displayName}
            </span>
          </div>
        </div>
        <div className="space-y-2 text-right">
          <p className="text-sm font-medium text-muted-foreground">Price</p>
          <div className="whitespace-nowrap text-2xl font-semibold text-foreground">
            {currentPlan === "free" ? "$0" : `$${planPricing.monthly}/month`}
          </div>
        </div>
      </div>

      {(renewalDate ||
        subscription?.status === "trialing" ||
        subscription?.status === "past_due") && (
        <div className="space-y-1">
          {renewalDate && (
            <div className="text-xs text-muted-foreground">
              Renews on {renewalDate}
            </div>
          )}
          {subscription?.status === "trialing" && (
            <Badge variant="outline" className="mt-2">
              Trial Active
            </Badge>
          )}
          {subscription?.status === "past_due" && (
            <Badge variant="destructive" className="mt-2">
              Payment Required
            </Badge>
          )}
        </div>
      )}

      {isPaidPlan && subscription?.status !== "canceled" && (
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          onClick={handleManageSubscription}
          disabled={isOpeningPortal}
          aria-busy={isOpeningPortal}
        >
          {isOpeningPortal ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="mr-2 h-4 w-4" />
          )}
          {isOpeningPortal ? "Opening billing…" : "Manage Subscription"}
        </Button>
      )}
    </div>
  );
}
