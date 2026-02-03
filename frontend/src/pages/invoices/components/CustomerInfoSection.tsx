/**
 * Customer information section for invoice editor
 * Allows selecting from existing contacts or manual entry
 */

import React from 'react';
import { UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Contact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  address?: any;
}

interface CustomerInfoSectionProps {
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
    <Card className="border-2 border-dashed">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Contact selector */}
          {contacts.length > 0 && (
            <>
              <div className="flex flex-col items-center justify-center py-2 text-center">
                <UserPlus className="h-6 w-6 text-muted-foreground mb-2" />
                <Select
                  value={contactId?.toString() || 'none'}
                  onValueChange={onContactChange}
                >
                  <SelectTrigger className="w-full max-w-xs">
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
            <div className="grid grid-cols-2 gap-3">
              <Input
                value={customerName}
                onChange={(e) => onCustomerNameChange(e.target.value)}
                placeholder="Customer name"
              />
              <Input
                type="email"
                value={customerEmail}
                onChange={(e) => onCustomerEmailChange(e.target.value)}
                placeholder="Email"
              />
            </div>
            <Input
              value={customerPhone}
              onChange={(e) => onCustomerPhoneChange(e.target.value)}
              placeholder="Phone"
            />
            <Textarea
              value={customerAddress}
              onChange={(e) => onCustomerAddressChange(e.target.value)}
              placeholder="Address"
              rows={2}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
