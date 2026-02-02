import { useState } from 'react';

export function useInvoiceModalStates() {
  // Expanded invoice
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);
  const [expandedInvoiceData, setExpandedInvoiceData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  // Send invoice modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedInvoiceForSend, setSelectedInvoiceForSend] = useState<any>(null);
  const [fullInvoiceDataForSend, setFullInvoiceDataForSend] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const [isResend, setIsResend] = useState(false);
  
  // Recurring modal
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [selectedInvoiceForRecurring, setSelectedInvoiceForRecurring] = useState<any>(null);
  const [fullInvoiceDataForRecurring, setFullInvoiceDataForRecurring] = useState<any>(null);
  const [converting, setConverting] = useState(false);
  
  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any>(null);
  const [fullInvoiceDataForPayment, setFullInvoiceDataForPayment] = useState<any>(null);
  const [recordingPayment, setRecordingPayment] = useState(false);
  
  // Payment link modal
  const [showPaymentLinkModal, setShowPaymentLinkModal] = useState(false);
  const [selectedInvoiceForPaymentLink, setSelectedInvoiceForPaymentLink] = useState<any>(null);
  
  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<any>(null);
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