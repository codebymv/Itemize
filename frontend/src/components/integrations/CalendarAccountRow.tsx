import { useState } from 'react';
import { IntegrationProviderMark } from '@/components/brand/IntegrationProviderMark';
import { useToast } from '@/hooks/use-toast';
import { useStableMutationKey } from '@/hooks/useStableMutationKey';
import {
  syncCalendar,
  type CalendarConnection,
  type SyncResult,
} from '@/services/calendarIntegrationsApi';
import { IntegrationStatusRow } from './IntegrationStatusRow';

interface CalendarAccountRowProps {
  connection: CalendarConnection;
  organizationId: number;
  onDisconnect: () => void;
  onSyncConfirmed?: (result: SyncResult) => void | Promise<void>;
  externalBusy?: boolean;
}

const formatLastSync = (value: string | null) => {
  if (!value) return 'Not synced yet';
  return `Last synced ${new Date(value).toLocaleString()}`;
};

export function CalendarAccountRow({
  connection,
  organizationId,
  onDisconnect,
  onSyncConfirmed,
  externalBusy = false,
}: CalendarAccountRowProps) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const {
    begin: beginSync,
    release: releaseSync,
    reset: resetSync,
  } = useStableMutationKey('calendar-sync');

  const handleSync = async () => {
    const signature = `${organizationId}:${connection.id}`;
    const idempotencyKey = beginSync(signature);
    if (!idempotencyKey) return;

    setSyncing(true);
    let result: SyncResult;
    try {
      result = await syncCalendar(connection.id, organizationId, idempotencyKey);
    } catch (error) {
      releaseSync();
      toast({
        title: 'Unable to queue sync',
        description: error instanceof Error ? error.message : 'The sync request was not confirmed.',
        variant: 'destructive',
      });
      setSyncing(false);
      return;
    }

    resetSync();
    setSyncing(false);
    toast({
      title: result.created ? 'Sync queued' : 'Sync already queued',
      description: result.created
        ? 'Calendar sync will continue in the background.'
        : 'The existing calendar sync request is still active.',
    });
    try {
      await onSyncConfirmed?.(result);
    } catch (error) {
      console.error('Calendar sync queued, but follow-up UI work failed:', error);
    }
  };

  return (
    <IntegrationStatusRow
      name={connection.provider_email || 'Calendar account'}
      description={`${connection.provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'} · ${formatLastSync(connection.last_sync_at)}`}
      status={connection.is_active ? 'connected' : 'inactive'}
      detail={connection.error_message || undefined}
      icon={(
        <IntegrationProviderMark
          provider={connection.provider === 'outlook' ? 'outlook-calendar' : 'google-calendar'}
        />
      )}
      primaryLabel="Sync"
      primaryVariant="outline"
      onPrimary={() => void handleSync()}
      onDisconnect={onDisconnect}
      busy={syncing || externalBusy}
    />
  );
}
