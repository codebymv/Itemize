import {
  CheckCircle,
  Clock,
  Pause,
  Pencil,
  Send,
  XCircle,
} from 'lucide-react';
import type { Campaign } from '@/types/campaigns';
import { defineStatus, type StatusVisual } from '@/lib/statusVisuals';

const CAMPAIGN_STATUS_VISUALS: Record<Campaign['status'], StatusVisual> = {
  draft: defineStatus('Draft', 'blue', Pencil),
  scheduled: defineStatus('Scheduled', 'orange', Clock),
  sending: defineStatus('Sending', 'orange', Send),
  paused: defineStatus('Paused', 'orange', Pause),
  sent: defineStatus('Delivered', 'green', CheckCircle),
  failed: defineStatus('Failed', 'red', XCircle),
  cancelled: defineStatus('Cancelled', 'red', XCircle),
};

export const CAMPAIGN_SUMMARY_VISUALS = {
  draft: CAMPAIGN_STATUS_VISUALS.draft,
  inProgress: CAMPAIGN_STATUS_VISUALS.sending,
  delivered: CAMPAIGN_STATUS_VISUALS.sent,
} as const;

export const ACTIVE_CATALOG_VISUAL = defineStatus('Available', 'blue', CheckCircle);
export const INACTIVE_CATALOG_VISUAL = defineStatus('Unavailable', 'orange', Pause);

export function getCampaignStatusVisual(status: Campaign['status']): StatusVisual {
  return CAMPAIGN_STATUS_VISUALS[status];
}

export function getCatalogStatusVisual(isActive: boolean): StatusVisual {
  return isActive ? ACTIVE_CATALOG_VISUAL : INACTIVE_CATALOG_VISUAL;
}
