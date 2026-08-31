/**
 * Customer information section for invoice editor
 * Allows selecting from existing contacts or manual entry
 */

import React from 'react';
import { UserRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { JsonRecord } from '@/types';

interface Contact {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address?: string | JsonRecord | {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}

interface CustomerInfoSectionProps {
  idPrefix?: string;
  contacts: Contact[];
  contactId?: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  onContactChange: (contactIdStr: string) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerEmailChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onCustomerAddressChange: (value: string) => void;
}

export function CustomerInfoSection({
  idPrefix = 'invoice',
  contacts,
  contactId,
  customerName,
  customerEmail,
  customerPhone,
  customerAddress,
  onContactChange,
  onCustomerNameChange,
  onCustomerEmailChange,
  onCustomerPhoneChange,
  onCustomerAddressChange,
}: CustomerInfoSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          Customer Information
        </CardTitle>
      </CardHeader>
      <CardContent surface="inset">
        <div className="space-y-4">
          {/* Contact selector */}
          {contacts.length > 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-contact`}>Existing contact</Label>
                <Select
                  value={contactId?.toString() || 'none'}
                  onValueChange={onContactChange}
                >
                  <SelectTrigger id={`${idPrefix}-contact`} className="w-full">
                    <SelectValue placeholder="Select existing customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Or enter manually below</SelectItem>
                    {contacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id.toString()}>
                        {contact.first_name} {contact.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
            </>
          )}
          {/* Manual entry fields - always visible */}
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-customer-name`}>Customer name</Label>
                <Input
                  id={`${idPrefix}-customer-name`}
                  value={customerName}
                  onChange={(e) => onCustomerNameChange(e.target.value)}
                  placeholder="Customer name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-customer-email`}>Email</Label>
                <Input
                  id={`${idPrefix}-customer-email`}
                  type="email"
                  value={customerEmail}
                  onChange={(e) => onCustomerEmailChange(e.target.value)}
                  placeholder="Email"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-customer-phone`}>Phone</Label>
              <Input
                id={`${idPrefix}-customer-phone`}
                value={customerPhone}
                onChange={(e) => onCustomerPhoneChange(e.target.value)}
                placeholder="Phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-customer-address`}>Address</Label>
              <Textarea
                id={`${idPrefix}-customer-address`}
                value={customerAddress}
                onChange={(e) => onCustomerAddressChange(e.target.value)}
                placeholder="Address"
                rows={2}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
