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
import { Checkbox } from '@/components/ui/checkbox';
import { Send, Mail, Plus, X, CreditCard, Eye, EyeOff, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Business, Invoice } from '@/services/invoicesApi';
import { InvoiceEmailPreview } from './InvoiceEmailPreview';
import { InlineInvoicePreview } from './InlineInvoicePreview';

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
    invoice?: Invoice;
}

export interface SendOptions {
    subject: string;
    message: string;
    ccEmails: string[];
    includePaymentLink?: boolean;
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
    invoice,
}: SendInvoiceModalProps) {
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [ccEmails, setCcEmails] = useState<string[]>([]);
    const [newCc, setNewCc] = useState('');
    const [includePaymentLink, setIncludePaymentLink] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [showInvoicePreview, setShowInvoicePreview] = useState(false);

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
            setIncludePaymentLink(false);
            setShowPreview(true); // Default to showing preview
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
        onSend({ subject, message, ccEmails, includePaymentLink });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={showPreview ? "sm:max-w-[1200px]" : "sm:max-w-[550px]"}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Send className="h-5 w-5 text-blue-600" />
                        Send Invoice
                    </DialogTitle>
                    <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
                        Customize the email before sending the invoice to your customer.
                    </DialogDescription>
                </DialogHeader>

                <div className={`${showPreview ? 'grid grid-cols-2 gap-6 max-h-[70vh]' : 'space-y-4 max-h-[65vh]'} overflow-y-auto`}>
                    {/* Left Column - Form */}
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
                                rows={showPreview ? 12 : 8}
                            />
                        </div>

                        {/* Include Payment Link Option */}
                        <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
                            <Checkbox
                                id="includePaymentLink"
                                checked={includePaymentLink}
                                onCheckedChange={(checked) => setIncludePaymentLink(checked as boolean)}
                                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            />
                            <div className="flex-1">
                                <Label htmlFor="includePaymentLink" className="text-sm font-medium cursor-pointer" style={{ fontFamily: '"Raleway", sans-serif' }}>
                                    Include Payment Link
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Add a "Pay Now" button to the email for easy online payment
                                </p>
                            </div>
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                        </div>
                    </div>

                    {/* Right Column - Preview (only shown when showPreview is true) */}
                    {showPreview && (
                        <div className="space-y-2">
                            <Label className="text-slate-700 dark:text-slate-200">Preview</Label>
                            
                            {/* Email Preview */}
                            <InvoiceEmailPreview
                                subject={subject}
                                message={message}
                                includePaymentLink={includePaymentLink}
                            />
                            
                            {/* Invoice Attachment Preview - Collapsible */}
                            {invoice && (
                                <div className="mt-4 border rounded-lg">
                                    <button
                                        onClick={() => setShowInvoicePreview(!showInvoicePreview)}
                                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors rounded-lg"
                                        type="button"
                                    >
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm font-medium">
                                                {showInvoicePreview ? 'Hide' : 'View'} Invoice Attachment
                                            </span>
                                        </div>
                                        {showInvoicePreview ? (
                                            <ChevronUp className="h-4 w-4" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4" />
                                        )}
                                    </button>
                                    
                                    {showInvoicePreview && (
                                        <div className="p-4 border-t max-h-[500px] overflow-y-auto">
                                            <InlineInvoicePreview
                                                business={invoice.business || business}
                                                invoiceNumber={invoice.invoice_number}
                                                issueDate={invoice.issue_date}
                                                dueDate={invoice.due_date}
                                                customerName={invoice.customer_name || ''}
                                                customerEmail={invoice.customer_email || ''}
                                                customerPhone={invoice.customer_phone || ''}
                                                customerAddress={invoice.customer_address || ''}
                                                lineItems={invoice.items?.map(item => ({
                                                    id: item.id?.toString() || '',
                                                    product_id: item.product_id,
                                                    name: item.name,
                                                    description: item.description || '',
                                                    quantity: item.quantity,
                                                    unit_price: item.unit_price,
                                                    tax_rate: item.tax_rate
                                                })) || []}
                                                subtotal={invoice.subtotal}
                                                taxAmount={invoice.tax_amount}
                                                discountAmount={invoice.discount_amount}
                                                total={invoice.total}
                                                currency={invoice.currency}
                                                notes={invoice.notes || ''}
                                                termsAndConditions={invoice.terms_and_conditions || ''}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="flex items-center justify-between sm:justify-between">
                    {/* Preview Toggle Button - Left Side */}
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

                    {/* Action Buttons - Right Side */}
                    <div className="flex gap-2">
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
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default SendInvoiceModal;
