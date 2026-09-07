import { UserCog } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SettingsSectionTitle } from '@/components/settings/SettingsPrimitives';
import { cn } from '@/lib/utils';
import { AccountDataExportAction } from './AccountDataExportCard';
import { AccountDeletionAction } from './AccountDeletionCard';
import { ManageSubscriptionAction } from './ManageSubscriptionCard';
import { useManageSubscription } from './useManageSubscription';

/**
 * The account-level actions on one row: subscription (when there is a live
 * paid plan), export, delete. Left to right they escalate from primary to
 * neutral to destructive.
 */
export function ManageAccountCard() {
  const { available: canManageSubscription } = useManageSubscription();
  const cell = 'border-t pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0';
  return (
    <Card>
      <CardHeader>
        <SettingsSectionTitle icon={UserCog}>Manage account</SettingsSectionTitle>
      </CardHeader>
      <CardContent surface="inset">
        <div className={cn('grid gap-5 md:gap-0', canManageSubscription ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
          {canManageSubscription && (
            <div className="md:pr-6">
              <ManageSubscriptionAction />
            </div>
          )}
          <div className={canManageSubscription ? cn(cell, 'md:pr-6') : 'md:pr-6'}>
            <AccountDataExportAction />
          </div>
          <div className={cell}>
            <AccountDeletionAction />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
