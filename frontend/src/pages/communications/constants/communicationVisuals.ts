import { CheckCircle2, MessageCircle, PauseCircle, Radio } from 'lucide-react';
import { defineStatus, getUnknownStatusVisual, type StatusVisual } from '@/lib/statusVisuals';

const CONVERSATION_STATUS: Record<'open' | 'closed', StatusVisual> = {
  open: defineStatus('Open', 'blue', MessageCircle),
  closed: defineStatus('Closed', 'green', CheckCircle2),
};

const AVAILABILITY_STATUS: Record<'active' | 'inactive', StatusVisual> = {
  active: defineStatus('Active', 'blue', Radio),
  inactive: defineStatus('Inactive', 'orange', PauseCircle),
};

export function getCommunicationConversationStatusVisual(status: string): StatusVisual {
  return CONVERSATION_STATUS[status as keyof typeof CONVERSATION_STATUS]
    ?? getUnknownStatusVisual(status);
}

export function getCommunicationAvailabilityVisual(isActive: boolean): StatusVisual {
  return AVAILABILITY_STATUS[isActive ? 'active' : 'inactive'];
}
