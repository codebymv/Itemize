import { useState } from 'react';
import type { Invoice } from '@/services/invoicesApi';

export function useInvoiceModalStates() {
  // Expanded invoice
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);
  const [expandedInvoiceData, setExpandedInvoiceData] = useState<Invoice | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  // Send invoice modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedInvoiceForSend, setSelectedInvoiceForSend] = useState<Invoice | null>(null);
  const [fullInvoiceDataForSend, setFullInvoiceDataForSend] = useState<Invoice | null>(null);
  const [sending, setSending] = useState(false);
  const [isResend, setIsResend] = useState(false);
  
  // Recurring modal
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [selectedInvoiceForRecurring, setSelectedInvoiceForRecurring] = useState<Invoice | null>(null);
  const [fullInvoiceDataForRecurring, setFullInvoiceDataForRecurring] = useState<Invoice | null>(null);
  const [converting, setConverting] = useState(false);
  
  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);
  const [fullInvoiceDataForPayment, setFullInvoiceDataForPayment] = useState<Invoice | null>(null);
  const [recordingPayment, setRecordingPayment] = useState(false);
  
  // Payment link modal
  const [showPaymentLinkModal, setShowPaymentLinkModal] = useState(false);
  const [selectedInvoiceForPaymentLink, setSelectedInvoiceForPaymentLink] = useState<Invoice | null>(null);
  
  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  return {
    // Expanded invoice
    expandedInvoiceId,
    setExpandedInvoiceId,
    expandedInvoiceData,
    setExpandedInvoiceData,
    loadingPreview,
    setLoadingPreview,
    
    // Send invoice
    showSendModal,
    setShowSendModal,
    selectedInvoiceForSend,
    setSelectedInvoiceForSend,
    fullInvoiceDataForSend,
    setFullInvoiceDataForSend,
    sending,
    setSending,
    isResend,
    setIsResend,
    
    // Recurring
    showRecurringModal,
    setShowRecurringModal,
    selectedInvoiceForRecurring,
    setSelectedInvoiceForRecurring,
    fullInvoiceDataForRecurring,
    setFullInvoiceDataForRecurring,
    converting,
    setConverting,
    
    // Payment
    showPaymentModal,
    setShowPaymentModal,
    selectedInvoiceForPayment,
    setSelectedInvoiceForPayment,
    fullInvoiceDataForPayment,
    setFullInvoiceDataForPayment,
    recordingPayment,
    setRecordingPayment,
    
    // Payment link
    showPaymentLinkModal,
    setShowPaymentLinkModal,
    selectedInvoiceForPaymentLink,
    setSelectedInvoiceForPaymentLink,
    
    // Delete
    deleteDialogOpen,
    setDeleteDialogOpen,
    invoiceToDelete,
    setInvoiceToDelete,
    deleting,
    setDeleting,
  };
}
