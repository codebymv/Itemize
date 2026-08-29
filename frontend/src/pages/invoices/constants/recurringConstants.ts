import { CheckCircle, Pause, Play } from 'lucide-react';
import type { RecurringStatus } from '@/services/recurringInvoicesApi';
import {
  defineStatus,
  getUnknownStatusVisual,
  type StatusVisual,
} from './statusVisualPrimitives';

export const RECURRING_STATUS_CONFIG: Record<RecurringStatus, StatusVisual> = {
  active: defineStatus('Active', 'blue', Play),
  paused: defineStatus('Paused', 'orange', Pause),
  completed: defineStatus('Completed', 'green', CheckCircle),
};

export function getRecurringStatusVisual(status: string): StatusVisual {
  return RECURRING_STATUS_CONFIG[status.toLowerCase() as RecurringStatus]
    ?? getUnknownStatusVisual(status);
}
