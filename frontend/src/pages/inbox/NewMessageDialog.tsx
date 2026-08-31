import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Mail, MessageSquareText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getContacts } from '@/services/contactsApi';
import { sendEmailToContact } from '@/services/emailApi';
import { sendSmsToContact } from '@/services/smsApi';
import type { Contact } from '@/types';
import { plainTextToEmailHtml } from './messageContent';

type Channel = 'email' | 'sms';

interface NewMessageDialogProps {
  open: boolean;
  organizationId: number;
  onOpenChange: (open: boolean) => void;
  onQueued: (conversationId?: number) => void | Promise<void>;
}

const contactName = (contact: Contact) =>
  `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()
  || contact.email
  || contact.phone
  || 'Unnamed contact';

export function NewMessageDialog({
  open,
  organizationId,
  onOpenChange,
  onQueued,
}: NewMessageDialogProps) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactId, setContactId] = useState<number | null>(null);
  const [channel, setChannel] = useState<Channel>('email');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingContacts(true);
    void getContacts({ status: 'active', sort_by: 'first_name', sort_order: 'asc', limit: 100 }, organizationId)
      .then(response => {
        if (active) setContacts(response.contacts);
      })
      .catch(() => {
        if (active) {
          toast({
            title: 'Unable to load contacts',
            description: 'Try opening the composer again.',
            variant: 'destructive',
          });
        }
      })
      .finally(() => {
        if (active) setLoadingContacts(false);
      });
    return () => { active = false; };
  }, [open, organizationId, toast]);

  useEffect(() => {
    if (open) return;
    setContactId(null);
    setChannel('email');
    setSubject('');
    setMessage('');
    setContactPickerOpen(false);
  }, [open]);

  const selectedContact = useMemo(
    () => contacts.find(contact => contact.id === contactId) ?? null,
    [contacts, contactId],
  );
  const canEmail = Boolean(selectedContact?.email);
  const canSms = Boolean(selectedContact?.phone);
  const canSend = Boolean(
    selectedContact
    && message.trim()
    && (channel === 'email' ? canEmail && subject.trim() : canSms),
  );

  useEffect(() => {
    if (!selectedContact) return;
    if (channel === 'email' && !selectedContact.email && selectedContact.phone) setChannel('sms');
    if (channel === 'sms' && !selectedContact.phone && selectedContact.email) setChannel('email');
  }, [channel, selectedContact]);

  const handleSend = async () => {
    if (!selectedContact || !canSend) return;
    setSending(true);
    try {
      const result = channel === 'email'
        ? await sendEmailToContact({
            contact_id: selectedContact.id,
            subject: subject.trim(),
            body_text: message.trim(),
            body_html: plainTextToEmailHtml(message.trim()),
          }, organizationId)
        : await sendSmsToContact({
            contact_id: selectedContact.id,
            message: message.trim(),
            organization_id: organizationId,
          });

      if (!result.success) throw new Error(result.error || 'The message could not be queued.');
      await onQueued(result.conversation_id);
      toast({ title: 'Message queued', description: `${channel === 'email' ? 'Email' : 'SMS'} to ${contactName(selectedContact)}` });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Message not sent',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!sending) onOpenChange(value); }}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            New message
          </DialogTitle>
          <DialogDescription className="sr-only">
            Send an email or SMS to a contact.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-1">
          <div className="space-y-2">
            <Label>Contact</Label>
            <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={contactPickerOpen}
                  className="h-11 w-full justify-between bg-background px-3 font-normal"
                  disabled={loadingContacts}
                >
                  <span className="min-w-0 truncate">
                    {loadingContacts ? 'Loading contacts...' : selectedContact ? contactName(selectedContact) : 'Choose a contact'}
                  </span>
                  {loadingContacts
                    ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    : <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search contacts..." />
                  <CommandList>
                    <CommandEmpty>No contacts found.</CommandEmpty>
                    <CommandGroup>
                      {contacts.map(contact => (
                        <CommandItem
                          key={contact.id}
                          value={`${contactName(contact)} ${contact.email ?? ''} ${contact.phone ?? ''}`}
                          onSelect={() => {
                            setContactId(contact.id);
                            setContactPickerOpen(false);
                          }}
                          className="gap-3 py-3"
                        >
                          <Check className={cn('h-4 w-4 shrink-0', contact.id === contactId ? 'opacity-100' : 'opacity-0')} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{contactName(contact)}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[contact.email, contact.phone].filter(Boolean).join(' · ') || 'No email or phone'}
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <Tabs value={channel} onValueChange={value => setChannel(value as Channel)}>
            <TabsList className="grid h-11 w-full grid-cols-2">
              <TabsTrigger value="email" disabled={Boolean(selectedContact) && !canEmail} className="gap-2">
                <Mail className="h-4 w-4" />Email
              </TabsTrigger>
              <TabsTrigger value="sms" disabled={Boolean(selectedContact) && !canSms} className="gap-2">
                <MessageSquareText className="h-4 w-4" />SMS
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {channel === 'email' ? (
            <div className="space-y-2">
              <Label htmlFor="new-message-subject">Subject</Label>
              <Input
                id="new-message-subject"
                value={subject}
                onChange={event => setSubject(event.target.value)}
                placeholder="Email subject..."
                className="h-11"
              />
            </div>
          ) : null}

          <div className="space-y-2 pb-1">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="new-message-body">Message</Label>
              {channel === 'sms' ? (
                <span className={cn('text-xs text-muted-foreground', message.length > 160 && 'text-orange-600 dark:text-orange-400')}>
                  {message.length}/160{message.length > 160 ? ` · ${Math.ceil(message.length / 153)} segments` : ''}
                </span>
              ) : null}
            </div>
            <Textarea
              id="new-message-body"
              value={message}
              onChange={event => setMessage(event.target.value)}
              placeholder="Write your message..."
              rows={8}
              className="min-h-40 resize-y"
            />
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button type="button" onClick={() => void handleSend()} disabled={!canSend || sending} className="bg-blue-600 text-white interaction-button--primary">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
