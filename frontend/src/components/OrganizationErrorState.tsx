import type { LucideIcon } from 'lucide-react';
import { ErrorState, type ErrorStateKind } from '@/components/ErrorState';
import { useOrganizationContext } from '@/contexts/organization-context';

interface OrganizationErrorStateProps {
  title: string;
  icon?: LucideIcon;
  className?: string;
  kind?: ErrorStateKind;
}

export function OrganizationErrorState({ title, icon, className, kind = 'page' }: OrganizationErrorStateProps) {
  const { refresh } = useOrganizationContext();

  return (
    <ErrorState
      kind={kind}
      title={title}
      description="We couldn't load your organization. Check your connection and try again."
      icon={icon}
      onAction={() => void refresh()}
      className={className}
    />
  );
}
