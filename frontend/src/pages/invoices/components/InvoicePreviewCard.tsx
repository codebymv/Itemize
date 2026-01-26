import React from 'react';
import { Separator } from '@/components/ui/separator';
import { getAssetUrl } from '@/lib/api';
import { Business } from '@/services/invoicesApi';

export interface PreviewLineItem {
    name: string;
    description?: string;
    quantity: number;
    unit_price: number;
    tax_rate?: number;
}

interface InvoicePreviewCardProps {
    // Display mode
    variant?: 'invoice' | 'template';
    
    // Business info
    business?: Business;
    
    // Document info
    documentNumber?: string; // invoice_number or template name
    
    // For invoices: dates
    issueDate?: string;
    dueDate?: string;
    
    // For recurring: next run date to calculate Issue/Due dates
    nextRunDate?: string;
    
    // Customer info
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    customerAddress?: string;
    
    // Line items and totals
    items: PreviewLineItem[];
    subtotal: number;
    taxAmount?: number;
    discountAmount?: number;
    total: number;
    currency?: string;
    
    // Additional content
    notes?: string;
    
    // Styling
    className?: string;
}

export function InvoicePreviewCard({
    variant = 'invoice',
    business,
    documentNumber,
    issueDate,
    dueDate,
    nextRunDate,
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
    items,
    subtotal,
    taxAmount = 0,
    discountAmount = 0,
    total,
    currency = 'USD',
    notes,
    className = '',
}: InvoicePreviewCardProps) {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount || 0);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const isTemplate = variant === 'template';
    // Always show "INVOICE" in blue - the preview shows what the generated invoice will look like
    const headerTitle = 'INVOICE';
    const headerColor = 'text-blue-600';

    // Light mode color constants - invoice should always look professional/printable
    const colors = {
        bg: 'bg-white',
        text: 'text-gray-900',
        textMuted: 'text-gray-500',
        border: 'border-gray-200',
    };

    return (
        <div 
            className={`${colors.bg} ${colors.text} rounded-lg border ${colors.border} p-6 pb-0 shadow-sm flex flex-col ${className}`}
            style={{ 
                fontFamily: "'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                height: '850px',
                colorScheme: 'light', // Force light color scheme
            }}
        >
            <div className="flex-1">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        {business?.logo_url && (
                            <img
                                src={getAssetUrl(business.logo_url)}
                                alt="Business Logo"
                                className="h-10 w-auto object-contain mb-2"
                            />
                        )}
                        {business?.name && (
                            <div className="text-sm">
                                <p className="font-semibold">{business.name}</p>
                                {business.email && (
                                    <p className={colors.textMuted}>{business.email}</p>
                                )}
                                {business.phone && (
                                    <p className={colors.textMuted}>{business.phone}</p>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="text-right">
                        <h2 className={`text-2xl font-light ${headerColor} mb-1`}>{headerTitle}</h2>
                        {documentNumber && (
                            <p className={`text-sm ${colors.textMuted}`}>{documentNumber}</p>
                        )}
                    </div>
                </div>

                {/* Bill To & Dates/Schedule */}
                <div className="flex justify-between mb-6">
                    <div className="w-1/2">
                        <p className={`text-xs ${colors.textMuted} uppercase mb-1`}>Bill To</p>
                        <div className="text-sm">
                            {customerName && <p className="font-semibold">{customerName}</p>}
                            {customerEmail && <p className={colors.textMuted}>{customerEmail}</p>}
                            {customerPhone && <p className={colors.textMuted}>{customerPhone}</p>}
                            {customerAddress && <p className={`${colors.textMuted} whitespace-pre-line`}>{customerAddress}</p>}
                            {!customerName && !customerEmail && (
                                <p className={`${colors.textMuted} italic`}>No customer assigned</p>
                            )}
                        </div>
                    </div>
                    <div className="w-1/2 text-right text-sm space-y-1">
                        {isTemplate ? (
                            // Template: show what the actual generated invoice will show
                            // Issue Date = next run date, Due Date = next run date + payment terms (default 30 days)
                            <>
                                {nextRunDate && (
                                    <div className="flex justify-end gap-4">
                                        <span className={colors.textMuted}>Issue Date:</span>
                                        <span className="font-medium">{formatDate(nextRunDate)}</span>
                                    </div>
                                )}
                                {nextRunDate && (
                                    <div className="flex justify-end gap-4">
                                        <span className={colors.textMuted}>Due Date:</span>
                                        <span className="font-medium">{(() => {
                                            // Calculate due date as issue date + 30 days (default payment terms)
                                            const [year, month, day] = nextRunDate.split('T')[0].split('-').map(Number);
                                            const dueDate = new Date(year, month - 1, day);
                                            dueDate.setDate(dueDate.getDate() + 30);
                                            return dueDate.toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            });
                                        })()}</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            // Invoice: show dates
                            <>
                                {issueDate && (
                                    <div className="flex justify-end gap-4">
                                        <span className={colors.textMuted}>Issue Date:</span>
                                        <span className="font-medium">{formatDate(issueDate)}</span>
                                    </div>
                                )}
                                {dueDate && (
                                    <div className="flex justify-end gap-4">
                                        <span className={colors.textMuted}>Due Date:</span>
                                        <span className="font-medium">{formatDate(dueDate)}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Line Items Table */}
                <table className="w-full mb-6 text-sm">
                    <thead>
                        <tr className={`border-b-2 ${colors.border} text-xs ${colors.textMuted} uppercase`}>
                            <th className="text-left py-2 w-1/2">Description</th>
                            <th className="text-right py-2">Qty</th>
                            <th className="text-right py-2">Unit Price</th>
                            <th className="text-right py-2">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length > 0 ? (
                            items.map((item, idx) => (
                                <tr key={idx} className={`border-b ${colors.border}`}>
                                    <td className="py-2">
                                        <p className="font-medium">{item.name}</p>
                                        {item.description && <p className={`text-xs ${colors.textMuted}`}>{item.description}</p>}
                                    </td>
                                    <td className="text-right py-2">{item.quantity}</td>
                                    <td className="text-right py-2">{formatCurrency(item.unit_price)}</td>
                                    <td className="text-right py-2">{formatCurrency(item.quantity * item.unit_price)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} className={`py-4 text-center ${colors.textMuted} italic`}>
                                    No line items
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end mb-6">
                    <div className="w-56 space-y-1 text-sm">
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
                        <Separator className="bg-gray-200" />
                        <div className="flex justify-between font-bold text-base">
                            <span>Total</span>
                            <span>{formatCurrency(total)}</span>
                        </div>
                    </div>
                </div>

                {/* Notes */}
                {notes && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <p className={`text-xs ${colors.textMuted} uppercase mb-1`}>Notes</p>
                        <p className="text-sm whitespace-pre-line">{notes}</p>
                    </div>
                )}

                {/* Footer Message */}
                <div className={`text-center text-xs ${colors.textMuted} pt-4`}>
                    <p>Thank you for your business!</p>
                </div>
            </div>

            {/* Powered By Footer */}
            <div className="mt-auto -mx-6 py-4 px-6 bg-blue-600 rounded-b-lg text-center text-sm text-white">
                <span className="mr-2">Powered by</span>
                <div className="bg-white py-2 px-3 rounded-md inline-flex items-center gap-1.5 shadow-sm">
                    <img
                        src="/icon.png"
                        alt="itemize"
                        className="h-6 w-auto inline-block align-middle"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                    <img
                        src="/textblack.png"
                        alt="itemize.cloud"
                        className="h-5 w-auto inline-block align-middle"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            if (!target.parentElement?.querySelector('span.fallback-text')) {
                                const fallback = document.createElement('span');
                                fallback.textContent = 'itemize.cloud';
                                fallback.className = 'fallback-text text-gray-900 font-medium';
                                target.parentElement?.appendChild(fallback);
                            }
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

export default InvoicePreviewCard;
