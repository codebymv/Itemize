import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '@/components/AppShell';
import { useOrganization } from '@/hooks/useOrganization';
import { ClientFollowUpsPage } from './ClientFollowUpsPage';

/** Resolve an exact task's organization before checking the active organization's plan. */
export default function ClientTaskOrganizationGate({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const { organizationId, isLoading, error } = useOrganization();
  const focused = params.get('view') === 'follow-ups' && params.has('taskId');
  const needsOrganization = focused && (
    isLoading || error || !organizationId || params.get('organizationId') !== String(organizationId)
  );

  if (needsOrganization) {
    // The page validates the link and never mounts its task panel for another organization.
    return <AppShell><ClientFollowUpsPage /></AppShell>;
  }

  return <>{children}</>;
}
