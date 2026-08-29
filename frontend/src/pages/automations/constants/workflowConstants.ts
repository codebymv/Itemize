import { CheckCircle, Clock, Pause, Play, XCircle } from 'lucide-react';
import {
  defineStatus,
  getUnknownStatusVisual,
  type StatusVisual,
} from '@/lib/statusVisuals';
import type { WorkflowEnrollment } from '@/services/automationsApi';

export type WorkflowDefinitionStatus = 'active' | 'inactive';

export const WORKFLOW_STATUS_CONFIG: Record<WorkflowDefinitionStatus, StatusVisual> = {
  active: defineStatus('Active', 'blue', Play),
  inactive: defineStatus('Inactive', 'orange', Pause),
};

export const WORKFLOW_ENROLLMENT_STATUS_CONFIG: Record<WorkflowEnrollment['status'], StatusVisual> = {
  active: defineStatus('Running', 'orange', Clock),
  paused: defineStatus('Paused', 'orange', Pause),
  completed: defineStatus('Completed', 'green', CheckCircle),
  failed: defineStatus('Failed', 'red', XCircle),
  cancelled: defineStatus('Cancelled', 'red', XCircle),
};

export function getWorkflowStatusVisual(active: boolean): StatusVisual {
  return WORKFLOW_STATUS_CONFIG[active ? 'active' : 'inactive'];
}

export function getWorkflowEnrollmentStatusVisual(status: string): StatusVisual {
  return WORKFLOW_ENROLLMENT_STATUS_CONFIG[status.toLowerCase() as WorkflowEnrollment['status']]
    ?? getUnknownStatusVisual(status);
}
