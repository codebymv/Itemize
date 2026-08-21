import React from 'react';
import { AlertTriangle, Building2, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { PaymentsLoadError } from '../hooks/usePaymentsTab';

export function PaymentsTabLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Skeleton className="h-6 w-24 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Payment Settings Card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Invoice Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>

          {/* Payment Terms */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full md:w-1/2" />
          </div>

          {/* Tax Rate */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full md:w-1/3" />
          </div>

          {/* Currency */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-full md:w-1/3" />
          </div>

          {/* Default Notes */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-20 w-full" />
          </div>

          {/* Default Terms */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>

      {/* Business Profile Card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          {/* Business List Skeleton */}
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div>
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
            ))}
          </div>

          {/* Add Business Button */}
          <Skeleton className="h-10 w-40 mt-4" />
        </CardContent>
      </Card>

      {/* Stripe Connection Card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div>
                <Skeleton className="h-4 w-32 mb-1" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-9 w-32" />
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

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className={subscriptionRequired
          ? 'mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary'
          : 'mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive'}>
          {subscriptionRequired ? (
            <Zap className="h-5 w-5" aria-hidden="true" />
          ) : organizationUnavailable ? (
            <Building2 className="h-5 w-5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <h3 className="text-lg font-medium text-foreground">
          {subscriptionRequired
            ? 'Unlock invoicing tools'
            : organizationUnavailable
              ? 'Workspace unavailable'
              : 'Unable to load payment settings'}
        </h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {subscriptionRequired
            ? 'Business profiles, invoice defaults, and payment collection are available on the Solo plan and above.'
            : organizationUnavailable
            ? 'We could not load or repair a workspace for this account. Try again to restore access.'
            : 'Your workspace is available, but its invoicing settings could not be loaded. Try again before making changes.'}
        </p>
        <Button onClick={subscriptionRequired ? onUpgrade : onRetry} className="mt-5">
          {subscriptionRequired ? 'View plans' : 'Try Again'}
        </Button>
      </CardContent>
    </Card>
  );
}
