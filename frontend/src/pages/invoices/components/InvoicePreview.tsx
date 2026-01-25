import React from 'react';
import { Eye } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getAssetUrl } from '@/lib/api';
import { Business } from '@/services/invoicesApi';

export interface LineItem {
    id: string;
    product_id?: number;
    name: string;
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
}

interface InvoicePreviewProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    business?: Business;
    invoiceNumber?: string;
    issueDate: string;
    dueDate: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerAddress: string;
    lineItems: LineItem[];
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    total: number;
    currency: string;
    notes: string;
    termsAndConditions: string;
    status?: string;
}

const STATUS_STYLES: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    viewed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
};

export function InvoicePreview({
    open,
    onOpenChange,
    business,
    invoiceNumber,
    issueDate,
    dueDate,
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
    lineItems,
    subtotal,
    taxAmount,
    discountAmount,
    total,
    currency,
    notes,
    termsAndConditions,
    status = 'draft',
}: InvoicePreviewProps) {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD'
        }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        // Parse date parts manually to avoid timezone issues
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day); // month is 0-indexed
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const validItems = lineItems.filter(item => item.name.trim());

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Eye className="h-5 w-5 text-blue-500" />
                        Invoice Preview
                    </DialogTitle>
                    <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
                        Preview how your invoice will appear to your customer
                    </DialogDescription>
                </DialogHeader>

                {/* Invoice Preview Content */}
                <div className="bg-white dark:bg-gray-900 p-8 rounded-lg border">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            {business?.logo_url && (
                                <img
                                    src={getAssetUrl(business.logo_url)}
                                    alt="Business Logo"
                                    className="h-12 w-auto object-contain mb-2"
                                />
                            )}
                            {business?.name && (
                                <div className="text-sm">
                                    <p className="font-semibold">{business.name}</p>
                                    {business.address && (
                                        <p className="text-muted-foreground whitespace-pre-line">
                                            {business.address}
                                        </p>
                                    )}
                                    {business.email && (
                                        <p className="text-muted-foreground">{business.email}</p>
                                    )}
                                    {business.phone && (
                                        <p className="text-muted-foreground">{business.phone}</p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="text-right">
                            <h1 className="text-3xl font-light text-blue-600 mb-1">INVOICE</h1>
                            {invoiceNumber && (
                                <p className="text-sm text-muted-foreground">{invoiceNumber}</p>
                            )}
                            <Badge className={`mt-2 ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>
                                {status.toUpperCase()}
                            </Badge>
                        </div>
                    </div>

                    {/* Addresses and Dates */}
                    <div className="flex justify-between mb-8">
                        <div className="w-1/2">
                            <p className="text-xs text-muted-foreground uppercase mb-2">Bill To</p>
                            <div className="text-sm">
                                {customerName && <p className="font-semibold">{customerName}</p>}
                                {customerEmail && <p className="text-muted-foreground">{customerEmail}</p>}
                                {customerPhone && <p className="text-muted-foreground">{customerPhone}</p>}
                                {customerAddress && (
                                    <p className="text-muted-foreground whitespace-pre-line">{customerAddress}</p>
                                )}
                            </div>
                        </div>
                        <div className="w-1/2 text-right">
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-end gap-4">
                                    <span className="text-muted-foreground">Issue Date:</span>
                                    <span className="font-medium">{formatDate(issueDate)}</span>
                                </div>
                                <div className="flex justify-end gap-4">
                                    <span className="text-muted-foreground">Due Date:</span>
                                    <span className="font-medium">{formatDate(dueDate)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Line Items Table */}
                    <table className="w-full mb-8">
                        <thead>
                            <tr className="border-b-2 text-xs text-muted-foreground uppercase">
                                <th className="text-left py-2 w-1/2">Description</th>
                                <th className="text-right py-2">Qty</th>
                                <th className="text-right py-2">Unit Price</th>
                                <th className="text-right py-2">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {validItems.map((item) => {
                                const lineTotal = item.quantity * item.unit_price;
                                return (
                                    <tr key={item.id} className="border-b">
                                        <td className="py-3">
                                            <p className="font-medium">{item.name}</p>
                                            {item.description && (
                                                <p className="text-xs text-muted-foreground">{item.description}</p>
                                            )}
                                        </td>
                                        <td className="text-right py-3">{item.quantity}</td>
                                        <td className="text-right py-3">{formatCurrency(item.unit_price)}</td>
                                        <td className="text-right py-3">{formatCurrency(lineTotal)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Totals */}
                    <div className="flex justify-end mb-8">
                        <div className="w-64 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span>Subtotal</span>
                                <span>{formatCurrency(subtotal)}</span>
                            </div>
                            {taxAmount > 0 && (
                                <div className="flex justify-between">
                                    <span>Tax</span>
                                    <span>{formatCurrency(taxAmount)}</span>
                                </div>
                            )}
                            {discountAmount > 0 && (
                                <div className="flex justify-between">
                                    <span>Discount</span>
                                    <span>-{formatCurrency(discountAmount)}</span>
                                </div>
                            )}
                            <Separator />
                            <div className="flex justify-between text-lg font-bold">
                                <span>Total</span>
                                <span>{formatCurrency(total)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Notes and Terms */}
                    {notes && (
                        <div className="mb-6 p-4 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground uppercase mb-1">Notes</p>
                            <p className="text-sm whitespace-pre-line">{notes}</p>
                        </div>
                    )}

                    {termsAndConditions && (
                        <div className="p-4 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground uppercase mb-1">Terms & Conditions</p>
                            <p className="text-xs whitespace-pre-line text-muted-foreground">{termsAndConditions}</p>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="mt-8 text-center text-xs text-muted-foreground">
                        {business?.tax_id && <p>Tax ID: {business.tax_id}</p>}
                        <p className="mt-2">Thank you for your business!</p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default InvoicePreview;
