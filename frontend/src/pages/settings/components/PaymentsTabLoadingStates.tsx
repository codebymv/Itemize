import React from 'react';
import { AlertTriangle, Building2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SettingsPlanGate } from '@/components/settings/SettingsPrimitives';
import type { PaymentsLoadError } from '../hooks/usePaymentsTab';

export function PaymentsTabLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-32" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
          {[0, 1].map((index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-24" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-32" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-full max-w-sm" />
            </div>
            <Skeleton className="h-9 w-20" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-32" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[0, 1].map((index) => (
              <div key={index} className="flex items-center gap-3 rounded-lg border p-3">
                <Skeleton className="h-12 w-12" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function PaymentsTabErrorState({
  error,
  onRetry,
  onUpgrade,
}: {
  error: Exclude<PaymentsLoadError, null>;
  onRetry: () => void;
  onUpgrade?: () => void;
}) {
  const organizationUnavailable = error === 'organization';
  const subscriptionRequired = error === 'subscription';

  if (subscriptionRequired) {
    return (
      <SettingsPlanGate
        title="Unlock invoicing tools"
        description="Solo unlocks profiles, invoice defaults, and payments."
        onViewPlans={onUpgrade ?? onRetry}
      />
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          {organizationUnavailable ? (
            <Building2 className="h-5 w-5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <h3 className="text-lg font-medium text-foreground">
          {organizationUnavailable
              ? 'Organization unavailable'
              : 'Unable to load payment settings'}
        </h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {organizationUnavailable
            ? "We couldn't restore this account's organization. Try again."
            : "Invoicing settings couldn't load. Retry before editing."}
        </p>
        <Button onClick={onRetry} className="mt-5">Try Again</Button>
      </CardContent>
    </Card>
  );
}
