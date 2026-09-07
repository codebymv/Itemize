import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  Zap,
  Crown,
  Building2,
  User,
} from "lucide-react";
import { useSubscriptionState } from "@/contexts/SubscriptionContext";
import { Plan, PLAN_METADATA, PLAN_PRICING } from "@/lib/subscription";
import { Spinner } from "@/components/ui/Spinner";
import { useManageSubscription } from "@/pages/settings/components/useManageSubscription";

const PLAN_ICONS = {
  free: User,
  starter: Zap,
  unlimited: Crown,
  pro: Building2,
};

export function SubscriptionStatus() {
  const { subscription, planName, isLoading } = useSubscriptionState();
  const manage = useManageSubscription();

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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-6">
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
          {manage.available && (
            <button
              type="button"
              onClick={() => void manage.open()}
              disabled={manage.opening}
              className="interaction-button--link inline-flex min-h-11 items-center gap-1 text-sm text-icon-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              {manage.opening ? "Opening billing…" : "Manage"}
            </button>
          )}
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
    </div>
  );
}
