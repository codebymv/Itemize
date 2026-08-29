import {
  AlertCircle,
  CheckCircle,
  Clock,
  Send,
  XCircle,
} from 'lucide-react';
import type { EstimateStatus } from '@/services/estimatesApi';
import {
  defineStatus,
  getUnknownStatusVisual,
  type StatusVisual,
} from './statusVisualPrimitives';

export const ESTIMATE_STATUS_CONFIG: Record<EstimateStatus, StatusVisual> = {
  draft: defineStatus('Draft', 'blue', Clock),
  sent: defineStatus('Sent', 'orange', Send),
  accepted: defineStatus('Accepted', 'green', CheckCircle),
  declined: defineStatus('Declined', 'red', XCircle),
  expired: defineStatus('Expired', 'red', AlertCircle),
};

export function getEstimateStatusVisual(status: string): StatusVisual {
  const visual = ESTIMATE_STATUS_CONFIG[status.toLowerCase() as EstimateStatus];
  return visual ?? getUnknownStatusVisual(status);
}
