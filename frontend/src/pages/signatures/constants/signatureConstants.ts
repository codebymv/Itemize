import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Send,
  XCircle,
} from 'lucide-react';
import { defineStatus, getUnknownStatusVisual } from '@/lib/statusVisuals';
import type { SignatureStatus } from '@/services/signaturesApi';

export const SIGNATURE_STATUS_VISUALS = {
  draft: defineStatus('Draft', 'blue', FileText),
  sent: defineStatus('Sent', 'orange', Send),
  in_progress: defineStatus('In progress', 'orange', Clock),
  completed: defineStatus('Completed', 'green', CheckCircle),
  cancelled: defineStatus('Cancelled', 'red', XCircle),
  expired: defineStatus('Expired', 'red', XCircle),
} satisfies Record<SignatureStatus, ReturnType<typeof defineStatus>>;

export const getSignatureStatusVisual = (status: string) =>
  SIGNATURE_STATUS_VISUALS[status as SignatureStatus] ?? getUnknownStatusVisual(status);

export const getSignatureOperationalVisual = (
  document: Pick<import('@/services/signaturesApi').SignatureDocument,
    'status' | 'delivery_state' | 'completion_state'>,
) => {
  if (document.completion_state === 'dead_letter') {
    return defineStatus('Finalization failed', 'red', AlertCircle);
  }
  if (document.completion_state === 'retry') {
    return defineStatus('Finalization retrying', 'orange', Clock);
  }
  if (['queued', 'processing'].includes(document.completion_state || '')) {
    return defineStatus('Finalizing', 'orange', Clock);
  }
  if (document.delivery_state === 'failed') {
    return defineStatus('Delivery failed', 'red', AlertCircle);
  }
  if (document.delivery_state === 'retrying') {
    return defineStatus('Delivery retrying', 'orange', Clock);
  }
  if (document.delivery_state === 'sending') {
    return defineStatus('Sending', 'orange', Send);
  }
  return getSignatureStatusVisual(document.status);
};

export const getRecipientStatusVisual = (
  recipient: Pick<import('@/services/signaturesApi').SignatureRecipient, 'status' | 'delivery_state'>,
) => {
  if (recipient.delivery_state === 'dead_letter') {
    return defineStatus('Delivery failed', 'red', AlertCircle);
  }
  if (recipient.delivery_state === 'retry') {
    return defineStatus('Retrying', 'orange', Clock);
  }
  if (['queued', 'processing'].includes(recipient.delivery_state || '')) {
    return defineStatus('Sending', 'orange', Send);
  }
  if (recipient.status === 'signed') return defineStatus('Signed', 'green', CheckCircle);
  if (recipient.status === 'declined') return defineStatus('Declined', 'red', XCircle);
  if (recipient.status === 'viewed') return defineStatus('Viewed', 'orange', Clock);
  if (recipient.status === 'sent') return defineStatus('Sent', 'orange', Send);
  return defineStatus('Waiting', 'blue', Clock);
};

export const getTemplateReadinessVisual = (isReady: boolean) => (
  isReady
    ? defineStatus('Ready to use', 'green', CheckCircle)
    : defineStatus('Setup needed', 'orange', FileText)
);
