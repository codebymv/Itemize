import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Send, Mail, Paperclip, Plus, X } from 'lucide-react';
import { Business } from '@/services/invoicesApi';

interface SendInvoiceModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSend: (options: SendOptions) => void;
    sending: boolean;
    invoiceNumber?: string;
    customerName: string;
    customerEmail: string;
    total: number;
    currency: string;
    dueDate: string;
    business?: Business;
}

export interface SendOptions {
    subject: string;
    message: string;
    ccEmails: string[];
}

export function SendInvoiceModal({
    open,
    onOpenChange,
    onSend,
    sending,
    invoiceNumber,
    customerName,
    customerEmail,
    total,
    currency,
    dueDate,
    business,
}: SendInvoiceModalProps) {
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [ccEmails, setCcEmails] = useState<string[]>([]);
    const [newCc, setNewCc] = useState('');

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD'
        }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // Reset form when modal opens
    useEffect(() => {
        if (open) {
            const businessName = business?.name || 'Our Business';
            setSubject(`Invoice ${invoiceNumber || ''} from ${businessName}`);
            setMessage(
                `Hi ${customerName || 'there'},\n\n` +
                `Please find attached invoice ${invoiceNumber || ''} for ${formatCurrency(total)}.\n\n` +
                `Payment is due by ${formatDate(dueDate)}.\n\n` +
                `If you have any questions, please don't hesitate to reach out.\n\n` +
                `Thank you for your business!\n\n` +
                `Best regards,\n${businessName}`
            );
            setCcEmails([]);
            setNewCc('');
        }
    }, [open, invoiceNumber, customerName, total, dueDate, business]);

    const addCcEmail = () => {
        if (newCc && !ccEmails.includes(newCc) && newCc.includes('@')) {
            setCcEmails([...ccEmails, newCc]);
            setNewCc('');
        }
    };

    const removeCcEmail = (email: string) => {
        setCcEmails(ccEmails.filter(e => e !== email));
    };

    const handleSend = () => {
        onSend({ subject, message, ccEmails });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[550px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Send className="h-5 w-5 text-blue-500" />
                        Send Invoice
                    </DialogTitle>
                    <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
                        Customize the email before sending the invoice to your customer.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Recipient Info */}
                    <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">To:</span>
                            <span className="font-medium">{customerEmail || 'No email provided'}</span>
                        </div>
                        {!customerEmail && (
                            <p className="text-xs text-destructive">
                                Please add a customer email address before sending.
                            </p>
                        )}
                    </div>

                    {/* CC Recipients */}
                    <div>
                        <Label className="text-sm" style={{ fontFamily: '"Raleway", sans-serif' }}>CC (optional)</Label>
                        <div className="flex gap-2 mt-1">
                            <Input
                                value={newCc}
                                onChange={(e) => setNewCc(e.target.value)}
                                placeholder="Add CC email"
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCcEmail())}
                            />
                            <Button type="button" variant="outline" size="icon" onClick={addCcEmail}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        {ccEmails.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {ccEmails.map((email) => (
                                    <Badge key={email} variant="secondary" className="pr-1">
                                        {email}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-4 w-4 ml-1 hover:bg-transparent"
                                            onClick={() => removeCcEmail(email)}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    <Separator />

                    {/* Email Subject */}
                    <div className="space-y-2">
                        <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Subject</Label>
                        <Input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Email subject"
                        />
                    </div>

                    {/* Email Message */}
                    <div className="space-y-2">
                        <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Message</Label>
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Email message"
                            rows={8}
                        />
                    </div>

                    {/* Attachment Notice */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                        <Paperclip className="h-4 w-4" />
                        <span>Invoice PDF will be attached automatically</span>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={sending}
                        style={{ fontFamily: '"Raleway", sans-serif' }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSend}
                        disabled={sending || !customerEmail}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        style={{ fontFamily: '"Raleway", sans-serif' }}
                    >
                        <Send className="h-4 w-4 mr-2" />
                        {sending ? 'Sending...' : 'Send Invoice'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default SendInvoiceModal;
