import React, { useState, useEffect } from 'react';
import { CreditCard, Copy, Check, ExternalLink, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';

interface PaymentLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceNumber: string;
    invoiceTotal: number;
    amountDue: number;
    customerName: string;
    dueDate: string;
    currency?: string;
    onGenerateLink: () => Promise<{ url: string }>;
}

export const PaymentLinkModal: React.FC<PaymentLinkModalProps> = ({
    isOpen,
    onClose,
    invoiceNumber,
    invoiceTotal,
    amountDue,
    customerName,
    dueDate,
    currency = 'USD',
    onGenerateLink,
}) => {
    const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
        }).format(amount);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    // Auto-generate payment link when modal opens
    useEffect(() => {
        if (isOpen) {
            setPaymentUrl(null);
            setCopied(false);
            setError(null);
            generateLink();
        }
    }, [isOpen]);

    const generateLink = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await onGenerateLink();
            setPaymentUrl(result.url);
        } catch (err: any) {
            const errorMessage = err?.response?.data?.error || 'Failed to generate payment link';
            setError(errorMessage);
            toast({
                title: 'Error',
                description: errorMessage,
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopyLink = async () => {
        if (!paymentUrl) return;

        try {
            await navigator.clipboard.writeText(paymentUrl);
            setCopied(true);
            toast({
                title: 'Link copied',
                description: 'Payment link copied to clipboard.',
            });
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            toast({
                title: 'Failed to copy',
                description: 'Could not copy link to clipboard.',
                variant: 'destructive',
            });
        }
    };

    const handleOpenLink = () => {
        if (paymentUrl) {
            window.open(paymentUrl, '_blank');
        }
    };

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                        <CreditCard className="h-5 w-5 text-blue-500" />
                        Payment Link
                    </DialogTitle>
                    <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
                        Share this link with your customer to collect payment
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Invoice info display */}
                    <div className="space-y-2">
                        <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Invoice</Label>
                        <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-md">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-slate-500" />
                                    <span className="font-medium text-sm" style={{ fontFamily: '"Raleway", sans-serif' }}>
                                        {invoiceNumber}
                                    </span>
                                </div>
                                <span className="font-semibold text-sm text-green-600">
                                    {formatCurrency(amountDue)}
                                </span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground" style={{ fontFamily: '"Raleway", sans-serif' }}>
                                {customerName} • Due {formatDate(dueDate)}
                            </div>
                        </div>
                    </div>

                    {/* Payment link section */}
                    <div className="space-y-2">
                        <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Payment Link</Label>
                        <div className="flex space-x-2">
                            <Input
                                value={isLoading ? 'Generating payment link...' : (error ? 'Failed to generate link' : (paymentUrl || ''))}
                                readOnly
                                className="flex-1"
                                placeholder="Generating payment link..."
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={handleCopyLink}
                                disabled={isLoading || !paymentUrl}
                                aria-label="Copy link"
                            >
                                {copied ? (
                                    <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                    <Copy className="h-4 w-4" />
                                )}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={handleOpenLink}
                                disabled={isLoading || !paymentUrl}
                                aria-label="Open link"
                            >
                                <ExternalLink className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="text-xs text-gray-500" style={{ fontFamily: '"Raleway", sans-serif' }}>
                            Send this link to your customer to accept payment via Stripe
                        </p>
                    </div>

                    {/* Error state with retry */}
                    {error && (
                        <div className="flex justify-center">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={generateLink}
                                disabled={isLoading}
                                style={{ fontFamily: '"Raleway", sans-serif' }}
                            >
                                Try Again
                            </Button>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end pt-2">
                        <Button
                            type="button"
                            onClick={onClose}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            style={{ fontFamily: '"Raleway", sans-serif' }}
                        >
                            Done
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default PaymentLinkModal;
