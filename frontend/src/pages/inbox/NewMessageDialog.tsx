import { useEffect, useState } from 'react';
import { Loader2, Mail, MessageSquareText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useStableMutationKey } from '@/hooks/useStableMutationKey';
import { cn } from '@/lib/utils';
import { sendEmailToContact } from '@/services/emailApi';
import { sendSmsToContact } from '@/services/smsApi';
import type { Contact } from '@/types';
import { ContactCatalogPicker } from '@/components/ContactCatalogPicker';
import { plainTextToEmailHtml } from './messageContent';

type Channel = 'email' | 'sms';

const contactName = (contact: Contact) =>
  `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()
  || contact.email
  || contact.phone
  || 'Unnamed contact';

interface NewMessageDialogProps {
  open: boolean;
  organizationId: number;
  onOpenChange: (open: boolean) => void;
  onQueued: (conversationId?: number) => void | Promise<void>;
}

export function NewMessageDialog({
  open,
  organizationId,
  onOpenChange,
  onQueued,
}: NewMessageDialogProps) {
  const { toast } = useToast();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [channel, setChannel] = useState<Channel>('email');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const {
    begin: beginDeliveryAttempt,
    release: releaseDeliveryAttempt,
    reset: resetDeliveryAttempt,
  } =
    useStableMutationKey('new-message');

  useEffect(() => {
    if (open) return;
    setSelectedContact(null);
    setChannel('email');
    setSubject('');
    setMessage('');
    resetDeliveryAttempt();
  }, [open, resetDeliveryAttempt]);
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
    const normalizedSubject = subject.trim();
    const normalizedMessage = message.trim();
    const idempotencyKey = beginDeliveryAttempt(JSON.stringify({
      organizationId,
      contactId: selectedContact.id,
      channel,
      subject: channel === 'email' ? normalizedSubject : undefined,
      message: normalizedMessage,
    }));
    if (!idempotencyKey) return;
    setSending(true);
    try {
      const result = channel === 'email'
        ? await sendEmailToContact({
            contact_id: selectedContact.id,
            subject: normalizedSubject,
            body_text: normalizedMessage,
            body_html: plainTextToEmailHtml(normalizedMessage),
          }, organizationId, idempotencyKey)
        : await sendSmsToContact({
            contact_id: selectedContact.id,
            message: normalizedMessage,
            organization_id: organizationId,
          }, idempotencyKey);

      resetDeliveryAttempt();
      if (!result.success) throw new Error(result.error || 'The message could not be queued.');
      toast({ title: 'Message queued', description: `${channel === 'email' ? 'Email' : 'SMS'} to ${contactName(selectedContact)}` });
      onOpenChange(false);
      try {
        await onQueued(result.conversation_id);
      } catch {
        toast({
          title: 'Message queued',
          description: 'The inbox refresh is delayed, but the delivery was accepted.',
        });
      }
    } catch (error) {
      releaseDeliveryAttempt();
      toast({
        title: 'Message not sent',
        description: error instanceof Error ? error.message : 'Retrying will safely reuse this delivery attempt.',
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
            <ContactCatalogPicker
              organizationId={organizationId}
              selectedContact={selectedContact}
              onSelect={setSelectedContact}
              status="active"
              allowNone={false}
            />
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
          <Button type="button" onClick={() => void handleSend()} disabled={!canSend || sending} aria-busy={sending} className="bg-blue-600 text-white interaction-button--primary">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
