/**
 * Hook for managing invoice form field state
 */

import { useState, useCallback, useEffect } from 'react';
import { calculateDueDate, getTodayDateString } from '../utils/invoiceFormatters';

interface UseInvoiceFormParams {
  isNew: boolean;
  defaultPaymentTerms?: number;
  defaultCurrency?: string;
  defaultNotes?: string;
  defaultTerms?: string;
}

interface UseInvoiceFormReturn {
  invoiceNumber: string;
  invoiceSummary: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: number;
  currency: string;
  notes: string;
  termsAndConditions: string;
  discountType: 'fixed' | 'percent';
  discountValue: number;
  taxRate: number;
  selectedBusinessId: number | undefined;
  setInvoiceNumber: (value: string) => void;
  setInvoiceSummary: (value: string) => void;
  setIssueDate: (value: string) => void;
  setDueDate: (value: string) => void;
  setPaymentTerms: (value: number) => void;
  setCurrency: (value: string) => void;
  setNotes: (value: string) => void;
  setTermsAndConditions: (value: string) => void;
  setDiscountType: (value: 'fixed' | 'percent') => void;
  setDiscountValue: (value: number) => void;
  setTaxRate: (value: number) => void;
  setSelectedBusinessId: (value: number | undefined) => void;
  handlePaymentTermsChange: (newTerms: number) => void;
  loadInvoiceData: (invoice: any) => void;
}

export function useInvoiceForm({
  isNew,
  defaultPaymentTerms = 30,
  defaultCurrency = 'USD',
  defaultNotes = '',
  defaultTerms = '',
}: UseInvoiceFormParams): UseInvoiceFormReturn {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceSummary, setInvoiceSummary] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<number>(defaultPaymentTerms);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [notes, setNotes] = useState(defaultNotes);
  const [termsAndConditions, setTermsAndConditions] = useState(defaultTerms);
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [selectedBusinessId, setSelectedBusinessId] = useState<number | undefined>();

  // Set default dates for new invoices
  useEffect(() => {
    if (isNew && !issueDate) {
      const todayStr = getTodayDateString();
      setIssueDate(todayStr);
      setDueDate(calculateDueDate(todayStr, paymentTerms));
    }
  }, [isNew, issueDate, paymentTerms]);

  // Handler for payment terms change - recalculate due date
  const handlePaymentTermsChange = useCallback(
    (newTerms: number) => {
      setPaymentTerms(newTerms);
      if (issueDate) {
        setDueDate(calculateDueDate(issueDate, newTerms));
      }
    },
    [issueDate]
  );

  // Load existing invoice data
  const loadInvoiceData = useCallback((invoice: any) => {
    setInvoiceNumber(invoice.invoice_number || '');
    setSelectedBusinessId(invoice.business_id);
    setIssueDate(invoice.issue_date?.split('T')[0] || invoice.created_at?.split('T')[0] || '');
    setDueDate(invoice.due_date?.split('T')[0] || '');
    setPaymentTerms(invoice.payment_terms || 30);
    setCurrency(invoice.currency || 'USD');
    setNotes(invoice.notes || '');
    setTermsAndConditions(invoice.terms_and_conditions || '');
    setDiscountType(invoice.discount_type || 'fixed');
    setDiscountValue(invoice.discount_value || 0);
    setTaxRate(invoice.tax_rate || 0);
  }, []);

  return {
    invoiceNumber,
    invoiceSummary,
    issueDate,
    dueDate,
    paymentTerms,
    currency,
    notes,
    termsAndConditions,
    discountType,
    discountValue,
    taxRate,
    selectedBusinessId,
    setInvoiceNumber,
    setInvoiceSummary,
    setIssueDate,
    setDueDate,
    setPaymentTerms,
    setCurrency,
    setNotes,
    setTermsAndConditions,
    setDiscountType,
    setDiscountValue,
    setTaxRate,
    setSelectedBusinessId,
    handlePaymentTermsChange,
    loadInvoiceData,
  };
}
