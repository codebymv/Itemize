/**
 * Hook for invoice save and send operations
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import {
  createInvoice,
  updateInvoice,
  sendInvoice,
} from '@/services/invoicesApi';
import type { LineItem } from './useLineItems';

interface UseInvoiceSaveParams {
  organizationId: number | undefined;
  isNew: boolean;
  invoiceId?: string;
}

interface InvoiceData {
  contact_id?: number;
  business_id?: number;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  issue_date: string;
  due_date: string;
  payment_terms: number;
  currency: string;
  tax_rate: number;
  items: Array<{
    product_id?: number;
    name: string;
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
  }>;
  discount_type: 'fixed' | 'percent';
  discount_value: number;
  notes?: string;
  terms_and_conditions?: string;
}

interface SendOptions {
  subject: string;
  message: string;
  ccEmails?: string[];
  includePaymentLink?: boolean;
}

interface UseInvoiceSaveReturn {
  saving: boolean;
  handleSave: (data: InvoiceData, lineItems: LineItem[]) => Promise<void>;
  handleSendInvoice: (options: SendOptions) => Promise<void>;
}

export function useInvoiceSave({
  organizationId,
  isNew,
  invoiceId,
}: UseInvoiceSaveParams): UseInvoiceSaveReturn {
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSave = async (data: InvoiceData, lineItems: LineItem[]) => {
    if (!organizationId) return;

    const validItems = lineItems.filter((i) => i.name.trim());
    if (validItems.length === 0) {
      toast({
        title: 'Error',
        description: 'Add at least one line item',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const invoiceData = {
        ...data,
        items: validItems.map((item) => ({
          product_id: item.product_id,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: 0, // Individual item tax not used, using invoice-level tax
        })),
      };

      if (isNew) {
        await createInvoice(invoiceData, organizationId);
        toast({
          title: 'Created',
          description: toastMessages.created('invoice'),
        });
        navigate('/invoices');
      } else if (invoiceId) {
        await updateInvoice(parseInt(invoiceId), invoiceData, organizationId);
        toast({ title: 'Saved', description: toastMessages.saved('invoice') });
        navigate('/invoices');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: toastMessages.failedToSave('invoice'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendInvoice = async (options: SendOptions) => {
    if (!organizationId || !invoiceId || isNew) return;

    setSaving(true);
    try {
      const result = await sendInvoice(parseInt(invoiceId), organizationId, {
        subject: options.subject,
        message: options.message,
        ccEmails: options.ccEmails,
      });

      // Show appropriate toast based on email status
      if (result.emailSent) {
        toast({
          title: 'Sent',
          description: 'Invoice sent successfully and email delivered',
        });
      } else if (result.emailError) {
        toast({
          title: 'Sent with warning',
          description: `Invoice marked as sent but email failed: ${result.emailError}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Sent',
          description:
            'Invoice marked as sent (email service not configured)',
        });
      }

      navigate('/invoices');
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error || toastMessages.failedToSend('invoice');
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return {
    saving,
    handleSave,
    handleSendInvoice,
  };
}
