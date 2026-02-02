import { Clock, Send, Eye, CheckCircle, AlertCircle, XCircle, X } from 'lucide-react';

export const INVOICE_STATUS_FILTERS = ['all', 'draft', 'sent', 'viewed', 'paid', 'partial', 'overdue', 'cancelled'] as const;
export type InvoiceStatusFilter = typeof INVOICE_STATUS_FILTERS[number];

export const INVOICE_STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800', icon: Clock },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-800', icon: Send },
  viewed: { label: 'Viewed', color: 'bg-purple-100 text-purple-800', icon: Eye },
  paid: { label: 'Paid', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  partial: { label: 'Partial', color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
  overdue: { label: 'Overdue', color: 'bg-red-100 text-red-800', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-400 text-white', icon: X },
} as const;