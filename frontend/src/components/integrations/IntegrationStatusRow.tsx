import type { ReactNode } from 'react';
import { CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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

export type IntegrationStatus = 'connected' | 'disconnected' | 'inactive' | 'soon' | 'available';

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
}

function StatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === 'connected') {
    return (
      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-400">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Connected
      </Badge>
    );
  }

  if (status === 'inactive') return <Badge variant="destructive">Inactive</Badge>;

  if (status === 'soon') {
    return (
      <Badge variant="secondary">
        <Clock3 className="mr-1 h-3 w-3" />
        Soon
      </Badge>
    );
  }

  if (status === 'available') return <Badge variant="secondary">Available</Badge>;

  return <Badge variant="outline" className="text-muted-foreground">Not connected</Badge>;
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
}: IntegrationStatusRowProps) {
  const primaryIsConnection = status === 'disconnected';

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{name}</h3>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {detail ? <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:shrink-0 sm:justify-end">
        {onSecondary && secondaryLabel ? (
          <Button variant="outline" size="sm" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        ) : null}

        {onDisconnect ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={busy}>
                {disconnectLabel}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Itemize will stop using this connection. You can reconnect it later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
            variant={primaryVariant ?? (primaryIsConnection ? 'default' : 'outline')}
            className={cn(primaryIsConnection && 'bg-blue-600 text-white hover:bg-blue-700')}
            onClick={onPrimary}
            disabled={status === 'soon' || busy || !onPrimary}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {primaryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
