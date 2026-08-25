import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Info } from 'lucide-react';
import { CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function SettingsInfoTooltip({
  children,
  label = 'More information',
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            aria-label={label}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72 leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SettingsSectionTitle({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <CardTitle className={cn('flex items-center gap-2 text-base', className)}>
      <Icon className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
      {children}
    </CardTitle>
  );
}

export function SettingsFieldLabel({
  help,
  helpLabel,
  children,
  className,
  ...props
}: ComponentProps<typeof Label> & {
  help?: ReactNode;
  helpLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label className={className} {...props}>{children}</Label>
      {help ? <SettingsInfoTooltip label={helpLabel}>{help}</SettingsInfoTooltip> : null}
    </div>
  );
}
