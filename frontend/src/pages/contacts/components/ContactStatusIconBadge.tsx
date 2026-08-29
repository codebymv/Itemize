import {
  AlertCircle,
  Archive,
  CheckCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getContactStatusBadgeClass } from '@/lib/badge-utils';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; icon: LucideIcon }> = {
  active: { label: 'Active', icon: CheckCircle },
  inactive: { label: 'Inactive', icon: AlertCircle },
  archived: { label: 'Archived', icon: Archive },
};

export function ContactStatusIconBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const normalizedStatus = status.toLowerCase();
  const config = statusConfig[normalizedStatus];

  if (!config) return null;

  const Icon = config.icon;

  return (
    <Badge
      className={cn(
        'h-6 w-6 shrink-0 justify-center p-0',
        getContactStatusBadgeClass(normalizedStatus),
        className,
      )}
      aria-label={`${config.label} contact`}
      title={config.label}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{config.label}</span>
    </Badge>
  );
}
