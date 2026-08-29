import type { ButtonHTMLAttributes } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface ShellBackButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  label: string;
}

/**
 * The only Back control allowed in PageLayout.leading.
 * PageLayout owns its 44px slot; this component owns visual and accessible behavior.
 */
export function ShellBackButton({ label, className, type = 'button', ...props }: ShellBackButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...props}
          type={type}
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn(
            'h-11 w-11 shrink-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300',
            className,
          )}
        >
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
