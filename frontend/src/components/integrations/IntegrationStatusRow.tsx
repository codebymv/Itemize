import type { ReactNode } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export type IntegrationStatus =
  | 'connected'
  | 'disconnected'
  | 'inactive'
  | 'soon'
  | 'available'
  | 'unavailable';

const INTEGRATION_STATUS_VISUALS: Record<IntegrationStatus, {label: string; dotClass: string}> = {
  connected: {label: 'Connected', dotClass: 'bg-green-500'},
  disconnected: {label: 'Not connected', dotClass: 'bg-muted-foreground/60'},
  inactive: {label: 'Inactive', dotClass: 'bg-orange-500'},
  soon: {label: 'Soon', dotClass: 'bg-muted-foreground/60'},
  available: {label: 'Available', dotClass: 'bg-icon-accent'},
  unavailable: {label: 'Unavailable', dotClass: 'bg-destructive'},
};

interface IntegrationStatusRowProps {
  name: string;
  description: string;
  status: IntegrationStatus;
  detail?: string;
  icon: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryVariant?: ButtonProps['variant'];
  secondaryLabel?: string;
  onSecondary?: () => void;
  disconnectLabel?: string;
  onDisconnect?: () => void;
  busy?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  controlsId?: string;
}

function StatusIndicator({ status }: { status: IntegrationStatus }) {
  const visual = INTEGRATION_STATUS_VISUALS[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('h-2 w-2 rounded-full', visual.dotClass)} aria-hidden="true" />
      {visual.label}
    </span>
  );
}

export function IntegrationStatusRow({
  name,
  description,
  status,
  detail,
  icon,
  primaryLabel,
  onPrimary,
  primaryVariant,
  secondaryLabel,
  onSecondary,
  disconnectLabel = 'Disconnect',
  onDisconnect,
  busy = false,
  expanded = false,
  onToggle,
  controlsId,
}: IntegrationStatusRowProps) {
  const primaryIsConnection = status === 'disconnected';

  const summary = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
        {icon}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">{name}</h3>
          <StatusIndicator status={status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {detail ? (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      {onToggle ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-expanded={expanded}
          aria-controls={controlsId}
          onClick={onToggle}
        >
          {summary}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3">{summary}</div>
      )}

      <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:shrink-0 sm:justify-end">
        {onSecondary && secondaryLabel ? (
          <Button variant="outline" size="sm" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        ) : null}

        {onDisconnect ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={busy}
              >
                {disconnectLabel}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Itemize will stop using this connection. You can reconnect it
                  later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground interaction-button--destructive"
                  onClick={onDisconnect}
                >
                  {disconnectLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}

        {primaryLabel ? (
          <Button
            size="sm"
            variant={
              primaryVariant ?? (primaryIsConnection ? 'default' : 'outline')
            }
            className={cn(
              primaryIsConnection &&
                'bg-primary text-primary-foreground interaction-button--primary',
            )}
            onClick={onPrimary}
            disabled={status === 'soon' || busy || !onPrimary}
            aria-busy={busy || undefined}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {primaryLabel}
          </Button>
        ) : null}

        {onToggle ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
            aria-expanded={expanded}
            aria-controls={controlsId}
            onClick={onToggle}
          >
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                expanded && 'rotate-180',
              )}
            />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
