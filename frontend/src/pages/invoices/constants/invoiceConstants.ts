import {
  AlertCircle,
  Ban,
  CheckCircle,
  Clock,
  Eye,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';
import {
  defineStatus,
  getUnknownStatusVisual,
  type StatusVisual,
} from './statusVisualPrimitives';

export const INVOICE_STATUS_FILTERS = [
  'all',
  'draft',
  'sent',
  'viewed',
  'paid',
  'partial',
  'overdue',
  'cancelled',
  'refunded',
] as const;

export type InvoiceStatusFilter = typeof INVOICE_STATUS_FILTERS[number];
export type InvoiceStatus = Exclude<InvoiceStatusFilter, 'all'>;

export type InvoiceStatusVisual = StatusVisual;

export const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, InvoiceStatusVisual> = {
  draft: defineStatus('Draft', 'blue', Clock),
  sent: defineStatus('Sent', 'orange', Send),
  viewed: defineStatus('Viewed', 'orange', Eye),
  paid: defineStatus('Paid', 'green', CheckCircle),
  partial: defineStatus('Partial', 'orange', AlertCircle),
  overdue: defineStatus('Overdue', 'red', XCircle),
  cancelled: defineStatus('Cancelled', 'red', Ban),
  refunded: defineStatus('Refunded', 'gray', RotateCcw),
};

export function getInvoiceStatusVisual(status: string): InvoiceStatusVisual {
  const normalizedStatus = status.toLowerCase().replace(/[- ]/g, '_') as InvoiceStatus;
  const visual = INVOICE_STATUS_CONFIG[normalizedStatus];

  if (visual) return visual;
  return getUnknownStatusVisual(status);
}
