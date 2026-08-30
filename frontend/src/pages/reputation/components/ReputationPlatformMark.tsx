import { Star } from 'lucide-react';
import { IntegrationProviderMark } from '@/components/brand/IntegrationProviderMark';
import { cn } from '@/lib/utils';
import { getReputationPlatformLabel } from '../constants/reputationVisuals';

export function ReputationPlatformMark({
  platform,
  className,
}: {
  platform?: string | null;
  className?: string;
}) {
  const normalized = platform?.toLowerCase();
  if (normalized === 'google') {
    return <IntegrationProviderMark provider="google-calendar" className={cn('h-5 w-5', className)} />;
  }
  if (normalized === 'facebook') {
    return <IntegrationProviderMark provider="facebook" className={cn('h-5 w-5', className)} />;
  }

  const label = getReputationPlatformLabel(platform);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-300',
        className,
      )}
    >
      {normalized === 'custom' || !platform ? <Star className="h-3 w-3" /> : label.slice(0, 1)}
    </span>
  );
}
