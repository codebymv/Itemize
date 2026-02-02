import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import {
  getInvoice,
  sendInvoice,
  recordPayment,
  createPaymentLink,
  createRecurringTemplateFromInvoice,
  deleteInvoice,
  Invoice,
} from '@/services/invoicesApi';
import type { SendOptions, RecurringOptions, PaymentData } from '../components/SendInvoiceModal';

export interface InvoiceActions {
  handleOpenSendModal: (invoice: Invoice, setStates: (invoice: Invoice) => void) => Promise<void>;
  handleSendInvoice: (options: SendOptions, selectedInvoice: Invoice, isResend: boolean, setStates: () => void) => Promise<void>;
  handleOpenRecurringModal: (invoice: Invoice, setStates: (invoice: Invoice) => void) => void;
  handleMakeRecurring: (options: RecurringOptions, selectedInvoice: Invoice, setStates: () => void) => Promise<void>;
  handleOpenPaymentModal: (invoice: Invoice, setStates: (invoice: Invoice) => void) => void;
  handleRecordPayment: (paymentData: PaymentData, selectedInvoice: Invoice, setStates: () => void) => Promise<void>;
  handleCreatePaymentLink: (invoice: Invoice, setSelectedInvoice: (invoice: Invoice) => void) => void;
  generatePaymentLink: (invoiceId: number, organizationId: number) => Promise<{ url: string }>;
  handleDeleteClick: (invoice: Invoice, setInvoiceToDelete: (invoice: Invoice) => void, setDeleteDialogOpen: (open: boolean) => void) => void;
  confirmDelete: (invoice: Invoice, organizationId: number, setStates: () => void) => Promise<void>;
  handleToggleExpand: (invoiceId: number, organizationId: number, setExpandedInvoiceId: (id: number | null) => void, setExpandedInvoiceData: (data: any) => void, setLoadingPreview: (loading: boolean) => void) => Promise<void>;
}

export function useInvoiceActions(organizationId: number | null | undefined, fetchInvoices: () => void) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleOpenSendModal = useCallback(async (invoice: Invoice, setStates: (invoice: Invoice) => void) => {
    if (!organizationId) return;
    setStates(invoice);
  }, [organizationId]);

  const handleSendInvoice = useCallback(async (options: SendOptions, selectedInvoice: Invoice, isResend: boolean, setStates: () => void) => {
    if (!organizationId || !selectedInvoice) return;
    
    try {
      const result = await sendInvoice(selectedInvoice.id, organizationId, {
        subject: options.subject,
        message: options.message,
        ccEmails: options.ccEmails,
        includePaymentLink: options.includePaymentLink,
        resend: isResend
      });
       
      setStates();
       
      if (result.emailSent) {
        toast({ title: isResend ? 'Resent' : 'Sent', description: 'Invoice email delivered successfully' });
      } else if (result.emailError) {
        toast({ 
          title: 'Sent with warning', 
          description: `Invoice ${isResend ? 'resent' : 'marked as sent'} but email failed: ${result.emailError}`,
          variant: 'destructive'
        });
      } else {
        toast({ title: isResend ? 'Resent' : 'Sent', description: `Invoice ${isResend ? 'resent' : 'marked as sent'}` });
      }
       
      fetchInvoices();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Failed to send invoice';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  }, [organizationId, toast, fetchInvoices]);

  const handleOpenRecurringModal = useCallback((invoice: Invoice, setStates: (invoice: Invoice) => void) => {
    if (!organizationId) return;
    
    if (['cancelled', 'refunded'].includes(invoice.status)) {
      toast({ title: 'Cannot Convert', description: 'Cancelled or refunded invoices cannot be made recurring', variant: 'destructive' });
      return;
    }
    
    setStates(invoice);
  }, [organizationId, toast]);

  const handleMakeRecurring = useCallback(async (options: RecurringOptions, selectedInvoice: Invoice, setStates: () => void) => {
    if (!organizationId) return;
    
    try {
      await createRecurringTemplateFromInvoice(
        selectedInvoice.id,
        {
          template_name: options.template_name,
          frequency: options.frequency,
          start_date: options.start_date,
          end_date: options.end_date,
        },
        organizationId
      );
       
      toast({ title: 'Template Created', description: 'Recurring template created. Original invoice has been preserved.' });
      setStates();
       
      fetchInvoices();
      navigate('/recurring-invoices');
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Failed to create recurring template';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  }, [organizationId, toast, fetchInvoices, navigate]);

  const handleOpenPaymentModal = useCallback((invoice: Invoice, setStates: (invoice: Invoice) => void) => {
    if (!organizationId) return;

    if (invoice.amount_due <= 0 || ['cancelled', 'refunded', 'paid'].includes(invoice.status)) {
      toast({ title: 'Cannot Record Payment', description: 'This invoice is already paid or cancelled', variant: 'destructive' });
      return;
    }
    
    setStates(invoice);
  }, [organizationId, toast]);

  const handleRecordPayment = useCallback(async (paymentData: PaymentData, selectedInvoice: Invoice, setStates: () => void) => {
    if (!organizationId) return;
    
    try {
      await recordPayment(
        selectedInvoice.id,
        {
          amount: paymentData.amount,
          payment_method: paymentData.payment_method,
          notes: paymentData.notes,
        },
        organizationId
      );
       
      toast({ title: 'Payment Recorded', description: `Payment of $${paymentData.amount.toFixed(2)} has been recorded.` });
      setStates();
       
      fetchInvoices();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Failed to record payment';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  }, [organizationId, toast, fetchInvoices]);

  const handleCreatePaymentLink = useCallback((invoice: Invoice, setSelectedInvoice: (invoice: Invoice) => void) => {
    if (!organizationId) return;

    if (invoice.amount_due <= 0 || ['cancelled', 'refunded', 'paid'].includes(invoice.status)) {
      toast({ title: 'Cannot Create Payment Link', description: 'This invoice is already paid or cancelled', variant: 'destructive' });
      return;
    }
    
    setSelectedInvoice(invoice);
  }, [organizationId, toast]);

  const generatePaymentLink = useCallback(async (invoiceId: number, organizationId: number): Promise<{ url: string }> => {
    const { url } = await createPaymentLink(invoiceId, organizationId);
    
    if (!url) {
      throw new Error('No checkout URL returned');
    }
    
    return { url };
  }, []);

  const handleDeleteClick = useCallback((invoice: Invoice, setInvoiceToDelete: (invoice: Invoice) => void, setDeleteDialogOpen: (open: boolean) => void) => {
    setInvoiceToDelete(invoice);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDelete = useCallback(async (invoice: Invoice, organizationId: number, setStates: () => void) => {
    setDeleting(true);
    try {
      await deleteInvoice(invoice.id, organizationId);
      toast({ title: 'Deleted', description: `Invoice ${invoice.invoice_number} deleted successfully` });
      setStates();
      fetchInvoices();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete invoice', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }, [toast, fetchInvoices]);

  const handleToggleExpand = useCallback(async (invoiceId: number, orgId: number, setExpandedInvoiceId: (id: number | null) => void, setExpandedInvoiceData: (data: any) => void, setLoadingPreview: (loading: boolean) => void, currentExpandedId: number | null) => {
    if (currentExpandedId === invoiceId) {
      setExpandedInvoiceId(null);
      setExpandedInvoiceData(null);
      return;
    }
    
    setExpandedInvoiceId(invoiceId);
    setExpandedInvoiceData(null);
    setLoadingPreview(true);
    
    try {
      const invoice = await getInvoice(invoiceId, orgId);
      setExpandedInvoiceData(invoice);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load invoice details', variant: 'destructive' });
    } finally {
      setLoadingPreview(false);
    }
  }, [toast]);

  return {
    handleOpenSendModal,
    handleSendInvoice,
    handleOpenRecurringModal,
    handleMakeRecurring,
    handleOpenPaymentModal,
    handleRecordPayment,
    handleCreatePaymentLink,
    generatePaymentLink,
    handleDeleteClick,
    confirmDelete,
    handleToggleExpand,
  };
}