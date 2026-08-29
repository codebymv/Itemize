import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getContactStatusVisual } from '../constants/contactStatusConstants';

export function ContactStatusIconBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const statusVisual = getContactStatusVisual(status);
  const Icon = statusVisual.icon;

  return (
    <Badge
      className={cn(
        'h-6 w-6 shrink-0 justify-center p-0',
        statusVisual.badgeClass,
        className,
      )}
      aria-label={`${statusVisual.label} contact`}
      title={statusVisual.label}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{statusVisual.label}</span>
    </Badge>
  );
}
