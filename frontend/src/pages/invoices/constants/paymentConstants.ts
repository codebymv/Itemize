import {
  Ban,
  CheckCircle,
  Clock,
  LoaderCircle,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { InvoicePayment } from '@/services/invoicePaymentsApi';
import {
  defineStatus,
  getUnknownStatusVisual,
  type StatusVisual,
} from './statusVisualPrimitives';

export type PaymentStatus = InvoicePayment['status'];

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, StatusVisual> = {
  pending: defineStatus('Pending', 'orange', Clock),
  processing: defineStatus('Processing', 'orange', LoaderCircle),
  succeeded: defineStatus('Succeeded', 'green', CheckCircle),
  failed: defineStatus('Failed', 'red', XCircle),
  refunded: defineStatus('Refunded', 'gray', RotateCcw),
  cancelled: defineStatus('Cancelled', 'red', Ban),
};

export function getPaymentStatusVisual(status: string): StatusVisual {
  const visual = PAYMENT_STATUS_CONFIG[status.toLowerCase() as PaymentStatus];
  return visual ?? getUnknownStatusVisual(status);
}
