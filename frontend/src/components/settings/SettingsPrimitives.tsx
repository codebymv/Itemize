import type { ComponentProps, ReactNode } from 'react';
import { Info, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
export { SectionCardTitle as SettingsSectionTitle } from '@/components/ui/section-card-title';

export function SettingsPlanGate({
  title,
  description,
  onViewPlans,
}: {
  title: string;
  description: string;
  onViewPlans: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Zap className="h-5 w-5" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-medium text-foreground">{title}</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
        <Button onClick={onViewPlans} className="mt-5">View plans</Button>
      </CardContent>
    </Card>
  );
}

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
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
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
