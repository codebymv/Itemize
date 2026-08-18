import React from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export type IntegrationCardStatus = 'connected' | 'disconnected' | 'soon' | 'available';

interface IntegrationStatusCardProps {
  name: string;
  description: string;
  status: IntegrationCardStatus;
  detail?: string;
  icon: React.ReactNode;
  primaryLabel: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  disconnectLabel?: string;
  onDisconnect?: () => void;
  busy?: boolean;
}

export function IntegrationStatusCard({
  name,
  description,
  status,
  detail,
  icon,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  disconnectLabel = 'Disconnect',
  onDisconnect,
  busy = false,
}: IntegrationStatusCardProps) {
  const connected = status === 'connected';
  const soon = status === 'soon';
  const available = status === 'available';

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-foreground">{name}</h3>
                {connected ? (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                ) : soon ? (
                  <Badge variant="secondary" className="text-xs">Soon</Badge>
                ) : available ? (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Available
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    <XCircle className="h-3 w-3 mr-1" />
                    Not connected
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
              {detail ? (
                <p className="text-xs text-muted-foreground mt-1 truncate">{detail}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
            {onSecondary && secondaryLabel ? (
              <Button variant="outline" size="sm" onClick={onSecondary}>
                {secondaryLabel}
              </Button>
            ) : null}
            {onDisconnect ? (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={onDisconnect}
                disabled={busy}
              >
                {disconnectLabel}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={connected || soon || available ? 'outline' : 'default'}
              className={!connected && !soon && !available ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
              onClick={onPrimary}
              disabled={soon || busy || !onPrimary}
            >
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {primaryLabel}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
