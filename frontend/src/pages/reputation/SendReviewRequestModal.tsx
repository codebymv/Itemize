import React, { useState, useEffect, useCallback } from 'react';
import { Send, User, Users, Mail, MessageSquare, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { sendReviewRequest, sendBulkReviewRequests } from '@/services/reputationApi';
import { getContacts } from '@/services/contactsApi';
import { debounce } from 'lodash';

interface SendReviewRequestModalProps {
  organizationId: number;
  onClose: () => void;
  onSent: () => void;
}

interface Contact {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
}

const REVIEW_PLATFORMS = [
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'yelp', label: 'Yelp' },
  { value: 'trustpilot', label: 'Trustpilot' },
  { value: 'g2', label: 'G2' },
  { value: 'capterra', label: 'Capterra' },
];

export function SendReviewRequestModal({
  organizationId,
  onClose,
  onSent,
}: SendReviewRequestModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  
  // Contact search state
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  
  // Single request form
  const [singleForm, setSingleForm] = useState({
    useExistingContact: true,
    contact_id: null as number | null,
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    channel: 'email' as 'email' | 'sms' | 'both',
    custom_message: '',
    preferred_platform: '',
  });
  
  // Bulk request form
  const [bulkForm, setBulkForm] = useState({
    selectedContactIds: [] as number[],
    channel: 'email' as 'email' | 'sms' | 'both',
    custom_message: '',
    preferred_platform: '',
  });
  
  // Selected contact for display
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Fetch contacts for search/selection
  const fetchContacts = useCallback(
    debounce(async (search: string) => {
      setContactsLoading(true);
      try {
        const response = await getContacts({
          organization_id: organizationId,
          search: search || undefined,
          limit: 50,
        });
        setContacts(response.contacts || []);
      } catch (error) {
        console.error('Error fetching contacts:', error);
      } finally {
        setContactsLoading(false);
      }
    }, 300),
    [organizationId]
  );

  useEffect(() => {
    fetchContacts(searchQuery);
  }, [searchQuery, fetchContacts]);

  // Initial fetch
  useEffect(() => {
    fetchContacts('');
  }, []);

  const getContactDisplayName = (contact: Contact) => {
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
    return name || contact.email || contact.phone || 'Unknown Contact';
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setSingleForm(prev => ({
      ...prev,
      contact_id: contact.id,
      contact_name: getContactDisplayName(contact),
      contact_email: contact.email || '',
      contact_phone: contact.phone || '',
    }));
  };

  const handleToggleBulkContact = (contactId: number) => {
    setBulkForm(prev => ({
      ...prev,
      selectedContactIds: prev.selectedContactIds.includes(contactId)
        ? prev.selectedContactIds.filter(id => id !== contactId)
        : [...prev.selectedContactIds, contactId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'single') {
      // Validation for single request
      if (singleForm.useExistingContact && !singleForm.contact_id) {
        toast({
          title: 'Error',
          description: 'Please select a contact',
          variant: 'destructive',
        });
        return;
      }
      
      if (!singleForm.useExistingContact) {
        if (singleForm.channel === 'email' && !singleForm.contact_email) {
          toast({
            title: 'Error',
            description: 'Email is required for email requests',
            variant: 'destructive',
          });
          return;
        }
        if (singleForm.channel === 'sms' && !singleForm.contact_phone) {
          toast({
            title: 'Error',
            description: 'Phone number is required for SMS requests',
            variant: 'destructive',
          });
          return;
        }
        if (singleForm.channel === 'both' && (!singleForm.contact_email || !singleForm.contact_phone)) {
          toast({
            title: 'Error',
            description: 'Both email and phone are required for dual channel',
            variant: 'destructive',
          });
          return;
        }
      }

      setLoading(true);
      try {
        await sendReviewRequest({
          contact_id: singleForm.useExistingContact ? singleForm.contact_id || undefined : undefined,
          contact_email: !singleForm.useExistingContact ? singleForm.contact_email : undefined,
          contact_phone: !singleForm.useExistingContact ? singleForm.contact_phone : undefined,
          contact_name: !singleForm.useExistingContact ? singleForm.contact_name : undefined,
          channel: singleForm.channel,
          custom_message: singleForm.custom_message || undefined,
          preferred_platform: singleForm.preferred_platform || undefined,
        }, organizationId);
        
        toast({ title: 'Request sent', description: 'Review request has been sent successfully' });
        onSent();
      } catch (error: any) {
        console.error('Error sending request:', error);
        toast({
          title: 'Error',
          description: error.response?.data?.error || 'Failed to send request',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    } else {
      // Bulk request
      if (bulkForm.selectedContactIds.length === 0) {
        toast({
          title: 'Error',
          description: 'Please select at least one contact',
          variant: 'destructive',
        });
        return;
      }

      setLoading(true);
      try {
        const result = await sendBulkReviewRequests({
          contact_ids: bulkForm.selectedContactIds,
          channel: bulkForm.channel,
          custom_message: bulkForm.custom_message || undefined,
          preferred_platform: bulkForm.preferred_platform || undefined,
        }, organizationId);
        
        toast({ 
          title: 'Requests sent', 
          description: `Successfully sent ${result.sent} review request${result.sent !== 1 ? 's' : ''}` 
        });
        onSent();
      } catch (error: any) {
        console.error('Error sending bulk requests:', error);
        toast({
          title: 'Error',
          description: error.response?.data?.error || 'Failed to send requests',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-600" />
            Send Review Request
          </DialogTitle>
          <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            Request reviews from your customers via email or SMS
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'bulk')} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Single Request
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Bulk Requests
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            <TabsContent value="single" className="flex-1 overflow-auto mt-4 space-y-4">
              {/* Contact Selection Toggle */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useExisting"
                  checked={singleForm.useExistingContact}
                  onCheckedChange={(checked) => {
                    setSingleForm(prev => ({ ...prev, useExistingContact: checked as boolean }));
                    if (checked) {
                      setSelectedContact(null);
                    }
                  }}
                />
                <Label
                  htmlFor="useExisting"
                  className="text-sm font-normal cursor-pointer"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  Select from existing contacts
                </Label>
              </div>

              {singleForm.useExistingContact ? (
                <div className="space-y-2">
                  <Label style={{ fontFamily: '"Raleway", sans-serif' }}>
                    Select Contact <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <ScrollArea className="h-[150px] border rounded-md">
                    {contactsLoading ? (
                      <div className="p-4 text-center text-muted-foreground">Loading...</div>
                    ) : contacts.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">No contacts found</div>
                    ) : (
                      <div className="p-2">
                        {contacts.map((contact) => (
                          <div
                            key={contact.id}
                            onClick={() => handleSelectContact(contact)}
                            className={`p-2 rounded cursor-pointer flex items-center justify-between ${
                              selectedContact?.id === contact.id 
                                ? 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800' 
                                : 'hover:bg-muted'
                            }`}
                          >
                            <div>
                              <p className="font-medium text-sm">{getContactDisplayName(contact)}</p>
                              <p className="text-xs text-muted-foreground">
                                {[contact.email, contact.phone].filter(Boolean).join(' • ')}
                              </p>
                            </div>
                            {selectedContact?.id === contact.id && (
                              <Badge variant="secondary">Selected</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact_name" style={{ fontFamily: '"Raleway", sans-serif' }}>
                      Contact Name
                    </Label>
                    <Input
                      id="contact_name"
                      value={singleForm.contact_name}
                      onChange={(e) => setSingleForm(prev => ({ ...prev, contact_name: e.target.value }))}
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contact_email" style={{ fontFamily: '"Raleway", sans-serif' }}>
                        Email {singleForm.channel !== 'sms' && <span className="text-red-500">*</span>}
                      </Label>
                      <Input
                        id="contact_email"
                        type="email"
                        value={singleForm.contact_email}
                        onChange={(e) => setSingleForm(prev => ({ ...prev, contact_email: e.target.value }))}
                        placeholder="john@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact_phone" style={{ fontFamily: '"Raleway", sans-serif' }}>
                        Phone {singleForm.channel !== 'email' && <span className="text-red-500">*</span>}
                      </Label>
                      <Input
                        id="contact_phone"
                        type="tel"
                        value={singleForm.contact_phone}
                        onChange={(e) => setSingleForm(prev => ({ ...prev, contact_phone: e.target.value }))}
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Channel Selection */}
              <div className="space-y-2">
                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Send Via <span className="text-red-500">*</span>
                </Label>
                <RadioGroup
                  value={singleForm.channel}
                  onValueChange={(v) => setSingleForm(prev => ({ ...prev, channel: v as 'email' | 'sms' | 'both' }))}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="email" id="channel-email" />
                    <Label htmlFor="channel-email" className="flex items-center gap-1 cursor-pointer">
                      <Mail className="h-4 w-4" /> Email
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sms" id="channel-sms" />
                    <Label htmlFor="channel-sms" className="flex items-center gap-1 cursor-pointer">
                      <MessageSquare className="h-4 w-4" /> SMS
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="both" id="channel-both" />
                    <Label htmlFor="channel-both" className="cursor-pointer">Both</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Platform and Message */}
              <div className="space-y-2">
                <Label htmlFor="platform" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Preferred Review Platform
                </Label>
                <Select
                  value={singleForm.preferred_platform}
                  onValueChange={(v) => setSingleForm(prev => ({ ...prev, preferred_platform: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select platform (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {REVIEW_PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Custom Message (Optional)
                </Label>
                <Textarea
                  id="message"
                  value={singleForm.custom_message}
                  onChange={(e) => setSingleForm(prev => ({ ...prev, custom_message: e.target.value }))}
                  placeholder="Add a personal message to your review request..."
                  className="min-h-[80px]"
                />
              </div>
            </TabsContent>

            <TabsContent value="bulk" className="flex-1 overflow-auto mt-4 space-y-4">
              {/* Contact Multi-Select */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label style={{ fontFamily: '"Raleway", sans-serif' }}>
                    Select Contacts <span className="text-red-500">*</span>
                  </Label>
                  <Badge variant="secondary">
                    {bulkForm.selectedContactIds.length} selected
                  </Badge>
                </div>
                <Input
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <ScrollArea className="h-[200px] border rounded-md">
                  {contactsLoading ? (
                    <div className="p-4 text-center text-muted-foreground">Loading...</div>
                  ) : contacts.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">No contacts found</div>
                  ) : (
                    <div className="p-2">
                      {contacts.map((contact) => {
                        const isSelected = bulkForm.selectedContactIds.includes(contact.id);
                        return (
                          <div
                            key={contact.id}
                            onClick={() => handleToggleBulkContact(contact.id)}
                            className={`p-2 rounded cursor-pointer flex items-center gap-3 ${
                              isSelected 
                                ? 'bg-blue-50 dark:bg-blue-950' 
                                : 'hover:bg-muted'
                            }`}
                          >
                            <Checkbox checked={isSelected} />
                            <div className="flex-1">
                              <p className="font-medium text-sm">{getContactDisplayName(contact)}</p>
                              <p className="text-xs text-muted-foreground">
                                {[contact.email, contact.phone].filter(Boolean).join(' • ')}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Channel Selection */}
              <div className="space-y-2">
                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Send Via <span className="text-red-500">*</span>
                </Label>
                <RadioGroup
                  value={bulkForm.channel}
                  onValueChange={(v) => setBulkForm(prev => ({ ...prev, channel: v as 'email' | 'sms' | 'both' }))}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="email" id="bulk-channel-email" />
                    <Label htmlFor="bulk-channel-email" className="flex items-center gap-1 cursor-pointer">
                      <Mail className="h-4 w-4" /> Email
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sms" id="bulk-channel-sms" />
                    <Label htmlFor="bulk-channel-sms" className="flex items-center gap-1 cursor-pointer">
                      <MessageSquare className="h-4 w-4" /> SMS
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="both" id="bulk-channel-both" />
                    <Label htmlFor="bulk-channel-both" className="cursor-pointer">Both</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Platform and Message */}
              <div className="space-y-2">
                <Label htmlFor="bulk-platform" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Preferred Review Platform
                </Label>
                <Select
                  value={bulkForm.preferred_platform}
                  onValueChange={(v) => setBulkForm(prev => ({ ...prev, preferred_platform: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select platform (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {REVIEW_PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bulk-message" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Custom Message (Optional)
                </Label>
                <Textarea
                  id="bulk-message"
                  value={bulkForm.custom_message}
                  onChange={(e) => setBulkForm(prev => ({ ...prev, custom_message: e.target.value }))}
                  placeholder="Add a personal message to your review requests..."
                  className="min-h-[80px]"
                />
              </div>
            </TabsContent>

            <DialogFooter className="mt-4 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                {loading ? 'Sending...' : mode === 'single' ? 'Send Request' : `Send ${bulkForm.selectedContactIds.length} Request${bulkForm.selectedContactIds.length !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default SendReviewRequestModal;
