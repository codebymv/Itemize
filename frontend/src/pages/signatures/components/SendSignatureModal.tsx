import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { SignatureRecipient } from '@/services/signaturesApi';
import { SignatureEmailPreview } from './SignatureEmailPreview';

interface SendSignatureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (options: { message: string }) => void;
  sending: boolean;
  documentTitle?: string;
  senderName?: string;
  senderEmail?: string;
  recipients: SignatureRecipient[];
  message: string;
  onMessageChange: (value: string) => void;
  hasFile: boolean;
  expiresAt?: string | null;
  routingMode: 'parallel' | 'sequential';
  onRoutingModeChange: (value: 'parallel' | 'sequential') => void;
}

export function SendSignatureModal({
  open,
  onOpenChange,
  onSend,
  sending,
  documentTitle,
  senderName,
  senderEmail,
  recipients,
  message,
  onMessageChange,
  hasFile,
  expiresAt,
  routingMode,
  onRoutingModeChange
}: SendSignatureModalProps) {
  const [showPreview, setShowPreview] = useState(false);

  const subject = useMemo(() => {
    return `${senderEmail || senderName || 'Itemize'} wants your signature`;
  }, [senderEmail, senderName]);

  const recipientsWithEmail = useMemo(
    () => recipients.filter((recipient) => Boolean(recipient.email && recipient.email.trim())),
    [recipients]
  );

  const recipientsMissingEmail = useMemo(
    () => recipients.filter((recipient) => !recipient.email || !recipient.email.trim()),
    [recipients]
  );

  const previewRecipient = recipientsWithEmail[0];
  const recipientLabel = previewRecipient?.name || previewRecipient?.email || 'there';

  const defaultMessage = useMemo(() => {
    const senderLabel = senderName || senderEmail || 'Itemize';
    const titleLabel = documentTitle ? `"${documentTitle}"` : 'the document';
    return `Hi ${recipientLabel},\n\n${senderLabel} has requested your signature on ${titleLabel}.\n\nPlease review and sign at your earliest convenience.\n\nBest regards,\n${senderLabel}`;
  }, [documentTitle, senderEmail, senderName, recipientLabel]);

  useEffect(() => {
    if (open) {
      setShowPreview(true);
      if (!message.trim()) {
        onMessageChange(defaultMessage);
      }
    }
  }, [open, message, defaultMessage, onMessageChange]);

  const handleSend = () => {
    const nextMessage = message.trim() ? message : defaultMessage;
    if (!message.trim()) {
      onMessageChange(nextMessage);
    }
    onSend({ message: nextMessage });
  };

  const canSend = recipientsWithEmail.length > 0 && hasFile && !sending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={showPreview ? 'sm:max-w-[1200px]' : 'sm:max-w-[600px]'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-600" />
            Send Signature Request
          </DialogTitle>
          <DialogDescription>
            Customize the email before sending the signature request.
          </DialogDescription>
        </DialogHeader>

        <div className={`${showPreview ? 'grid grid-cols-2 gap-6 max-h-[70vh]' : 'space-y-4 max-h-[65vh]'} overflow-y-auto`}>
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">To:</span>
                {recipientsWithEmail.length === 0 ? (
                  <span className="font-medium">No recipients with email</span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {recipientsWithEmail.map((recipient) => (
                      <Badge key={recipient.id} variant="secondary">
                        {recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {recipientsMissingEmail.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{recipientsMissingEmail.length} recipient(s) are missing an email address.</span>
                </div>
              )}
              {!hasFile && (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>Upload a PDF before sending.</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={subject} disabled />
            </div>

            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder="Add a note for the recipients"
                rows={showPreview ? 12 : 8}
              />
            </div>

            <div className="space-y-2">
              <Label>Routing Mode</Label>
              <Select value={routingMode} onValueChange={(value) => onRoutingModeChange(value as 'parallel' | 'sequential')}>
                <SelectTrigger>
                  <SelectValue placeholder="Routing mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parallel">Parallel</SelectItem>
                  <SelectItem value="sequential">Sequential</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {routingMode === 'parallel'
                  ? 'Parallel sends requests to everyone at the same time.'
                  : 'Sequential sends to the first recipient, then the next after they sign.'}
              </p>
            </div>

            <Separator />
            <div className="text-xs text-muted-foreground">
              This email will include a secure signing link for each recipient.
            </div>
          </div>

          {showPreview && (
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-200">Preview</Label>
              <SignatureEmailPreview
                message={message.trim() ? message : defaultMessage}
                documentTitle={documentTitle}
                senderName={senderName}
                senderEmail={senderEmail}
                recipientName={previewRecipient?.name || previewRecipient?.email}
                expiresAt={expiresAt}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
            className="text-blue-600 border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            {showPreview ? (
              <>
                <EyeOff className="h-4 w-4 mr-1" />
                Hide Preview
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-1" />
                Show Preview
              </>
            )}
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={!canSend}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Sending...' : 'Send Request'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SendSignatureModal;
