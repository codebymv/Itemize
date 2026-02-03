/**
 * Hook for managing contact selection and customer data
 */

import { useState, useCallback } from 'react';
import { formatAddress } from '../utils/invoiceFormatters';

export interface Contact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  address?: string | {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  } | Record<string, any>;
}

interface UseContactSelectionReturn {
  contactId: number | undefined;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  setContactId: (id: number | undefined) => void;
  setCustomerName: (name: string) => void;
  setCustomerEmail: (email: string) => void;
  setCustomerPhone: (phone: string) => void;
  setCustomerAddress: (address: string) => void;
  handleContactChange: (contactIdStr: string, contacts: Contact[]) => void;
  loadContactData: (contact: {
    id?: number;
    name?: string;
    email?: string;
    phone?: string;
    address?: any;
  }) => void;
}

export function useContactSelection(): UseContactSelectionReturn {
  const [contactId, setContactId] = useState<number | undefined>();
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  const handleContactChange = useCallback(
    (contactIdStr: string, contacts: Contact[]) => {
      if (contactIdStr === 'none') {
        setContactId(undefined);
        return;
      }
      const selectedContact = contacts.find(
        (c) => c.id === parseInt(contactIdStr)
      );
      if (selectedContact) {
        setContactId(selectedContact.id);
        setCustomerName(
          `${selectedContact.first_name} ${selectedContact.last_name}`.trim()
        );
        setCustomerEmail(selectedContact.email || '');
        setCustomerPhone(selectedContact.phone || '');
        setCustomerAddress(formatAddress(selectedContact.address));
      }
    },
    []
  );

  const loadContactData = useCallback(
    (contact: {
      id?: number;
      name?: string;
      email?: string;
      phone?: string;
      address?: any;
    }) => {
      if (contact.id) setContactId(contact.id);
      if (contact.name) setCustomerName(contact.name);
      if (contact.email) setCustomerEmail(contact.email);
      if (contact.phone) setCustomerPhone(contact.phone);
      if (contact.address) setCustomerAddress(formatAddress(contact.address));
    },
    []
  );

  return {
    contactId,
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
    setContactId,
    setCustomerName,
    setCustomerEmail,
    setCustomerPhone,
    setCustomerAddress,
    handleContactChange,
    loadContactData,
  };
}
