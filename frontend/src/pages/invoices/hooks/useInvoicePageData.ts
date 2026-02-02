import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import { getInvoices, Invoice as ApiInvoice } from '@/services/invoicesApi';

export function useInvoicePageData(organizationId: number | null | undefined, orgLoading: boolean) {
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchInvoices = useCallback(async () => {
    if (!organizationId || orgLoading) {
      return;
    }
    setLoading(true);
    try {
      const response = await getInvoices({}, organizationId);
      setInvoices(response.invoices || []);
    } catch (error) {
      toast({ title: 'Error', description: toastMessages.failedToLoad('invoices'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [organizationId, orgLoading, toast]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Handle payment success/cancelled query params from Stripe redirect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const invoiceId = params.get('invoice');
    
    if (paymentStatus === 'success') {
      toast({ 
        title: 'Payment Successful', 
        description: invoiceId 
          ? `Payment for invoice #${invoiceId} has been processed.`
          : 'The invoice payment has been processed.'
      });
      window.history.replaceState({}, '', window.location.pathname);
      fetchInvoices();
    } else if (paymentStatus === 'cancelled') {
      toast({ 
        title: 'Payment Cancelled', 
        description: 'The payment was cancelled. You can try again anytime.',
        variant: 'destructive'
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast, fetchInvoices]);

  useEffect(() => {
    if (!orgLoading && !organizationId) {
      setLoading(false);
    }
  }, [orgLoading, organizationId]);

  return {
    invoices,
    loading,
    fetchInvoices,
  };
}