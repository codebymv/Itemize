import { AlertCircle, Archive, CheckCircle } from 'lucide-react';
import {
  defineStatus,
  getUnknownStatusVisual,
  type StatusVisual,
} from '@/lib/statusVisuals';

export type ContactStatus = 'active' | 'inactive' | 'archived';

export const CONTACT_STATUS_CONFIG: Record<ContactStatus, StatusVisual> = {
  active: defineStatus('Active', 'blue', CheckCircle),
  inactive: defineStatus('Inactive', 'orange', AlertCircle),
  archived: defineStatus('Archived', 'red', Archive),
};

export function getContactStatusVisual(status: string): StatusVisual {
  return CONTACT_STATUS_CONFIG[status.toLowerCase() as ContactStatus]
    ?? getUnknownStatusVisual(status);
}
