/**
 * UsageIndicator Component
 *
 * Resource consumption against plan limits. Uses the same card chrome as
 * StatCard so the progress track stays visible in light and dark themes.
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useStatStyles, type StatTheme } from "@/hooks/useStatStyles";

export interface UsageIndicatorProps {
  resourceType: "emails" | "sms" | "apiCalls";
  used: number;
  limit: number;
  label: string;
  icon?: ReactNode;
  className?: string;
}

type UsageState =
  "normal" | "warning" | "critical" | "unlimited" | "unavailable";

const fillClass: Record<UsageState, string> = {
  normal: "bg-blue-600 dark:bg-blue-500",
  warning: "bg-amber-500",
  critical: "bg-red-600 dark:bg-red-500",
  unlimited: "",
  unavailable: "",
};

const iconTheme: Record<UsageState, StatTheme> = {
  normal: "blue",
  warning: "orange",
  critical: "red",
  unlimited: "blue",
  unavailable: "blue",
};

export function UsageIndicator({
  resourceType,
  used,
  limit,
  label,
  icon,
  className,
}: UsageIndicatorProps) {
  const isUnlimited = limit === -1;
  const isUnavailable = limit === 0;
  const percentage =
    isUnlimited || isUnavailable ? 0 : Math.round((used / limit) * 100);
  const state: UsageState = isUnavailable
    ? "unavailable"
    : isUnlimited
      ? "unlimited"
      : percentage < 70
        ? "normal"
        : percentage < 90
          ? "warning"
          : "critical";
  const { iconBgClass, iconClass } = useStatStyles(iconTheme[state]);
  const labelId = `usage-${resourceType}-label`;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-3">
        {icon && (
          <div
            className={cn(
              "h-10 w-10 shrink-0 rounded-full flex items-center justify-center",
              iconBgClass,
              iconClass,
            )}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3
            id={labelId}
            className="text-xs font-medium text-muted-foreground"
          >
            {label}
          </h3>
          {isUnavailable ? (
            <p className="text-xl font-semibold tracking-tight">Not included</p>
          ) : isUnlimited ? (
            <p className="text-xl font-semibold tracking-tight">Unlimited</p>
          ) : (
            <p className="text-xl font-semibold tracking-tight">
              {used.toLocaleString()}
              <span className="text-sm font-medium text-muted-foreground">
                {" "}
                / {limit.toLocaleString()}
              </span>
            </p>
          )}
        </div>
      </div>

      {isUnavailable ? (
        <p className="text-xs text-muted-foreground">
          {resourceType === "apiCalls"
            ? "Available on Studio"
            : "Available on Solo and Studio"}
        </p>
      ) : isUnlimited ? (
        <p className="text-xs text-muted-foreground">
          No monthly cap on this plan
        </p>
      ) : (
        <>
          <Progress
            value={Math.min(Math.max(percentage, 0), 100)}
            className="h-2.5"
            indicatorClassName={fillClass[state]}
            aria-labelledby={labelId}
          />
          <p className="text-xs text-muted-foreground">{percentage}% used</p>
        </>
      )}
    </div>
  );
}

export function UsageIndicatorGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
