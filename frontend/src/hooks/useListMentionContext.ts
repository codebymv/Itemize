import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MentionContext } from '@/components/workspace/MentionInput';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useOrganization } from '@/hooks/useOrganization';

/** The `@`/`$` context a list card hands to its item inputs; same gate as the client chip. */
export const useListMentionContext = (contactId: number | null | undefined): MentionContext => {
  const { hasFeature } = useSubscription();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const canBind = hasFeature('contacts') && organizationId !== null;
  return useMemo(
    () => ({
      organizationId,
      canBind,
      contactId: contactId ?? null,
      triggers: ['@', '$'] as const,
      onUpgrade: () => navigate('/settings'),
    }),
    [canBind, contactId, navigate, organizationId],
  );
};
