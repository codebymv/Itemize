import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MentionContext } from '@/components/workspace/MentionInput';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useOrganization } from '@/hooks/useOrganization';

/** The `@` context a list card hands to its item inputs; same gate as the client chip. */
export const useListMentionContext = (): MentionContext => {
  const { hasFeature } = useSubscription();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const canBind = hasFeature('contacts') && organizationId !== null;
  return useMemo(
    () => ({ organizationId, canBind, onUpgrade: () => navigate('/settings') }),
    [canBind, navigate, organizationId],
  );
};
