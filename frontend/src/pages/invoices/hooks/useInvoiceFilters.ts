import { useState, useMemo } from 'react';
import { Invoice as ApiInvoice } from '@/services/invoicesApi';

export type InvoiceStatusFilter = 'all' | 'draft' | 'sent' | 'viewed' | 'paid' | 'partial' | 'overdue' | 'cancelled';

export function useInvoiceFilters(invoices: ApiInvoice[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');

  const filteredInvoices = useMemo(() => {
    let filtered = invoices;

    // Apply status filter
    if (activeTab !== 'all') {
      filtered = filtered.filter(invoice => invoice.status === activeTab);
    }

    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(invoice =>
        invoice.invoice_number?.toLowerCase().includes(query) ||
        invoice.customer_name?.toLowerCase().includes(query) ||
        invoice.customer_email?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [invoices, activeTab, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: invoices.length,
      draft: invoices.filter((i: ApiInvoice) => i.status === 'draft').length,
      sent: invoices.filter((i: ApiInvoice) => i.status === 'sent').length,
      viewed: invoices.filter((i: ApiInvoice) => i.status === 'viewed').length,
      paid: invoices.filter((i: ApiInvoice) => i.status === 'paid').length,
      partial: invoices.filter((i: ApiInvoice) => i.status === 'partial').length,
      overdue: invoices.filter((i: ApiInvoice) => i.status === 'overdue').length,
      cancelled: invoices.filter((i: ApiInvoice) => i.status === 'cancelled').length,
    };
  }, [invoices]);

  return {
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    filteredInvoices,
    stats,
  };
}