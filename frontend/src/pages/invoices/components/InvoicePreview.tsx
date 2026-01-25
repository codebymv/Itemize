import React from 'react';
import { Eye } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
}

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
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const validItems = lineItems.filter(item => item.name.trim());

    // These styles MUST match the backend pdf.service.js generateInvoiceHTML exactly
    // Any changes here should be mirrored in the backend
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Eye className="h-5 w-5 text-blue-500" />
                        Invoice Preview
                    </DialogTitle>
                    <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
                        This is exactly how your invoice PDF will appear
                    </DialogDescription>
                </DialogHeader>

                {/* Invoice Preview Content - matches PDF exactly */}
                {/* Note: Raleway font should be loaded in index.html for full parity */}
                <div style={{
                    fontFamily: "'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    fontSize: '14px',
                    lineHeight: 1.5,
                    color: '#111827',
                    background: 'white',
                    padding: '40px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                        <div style={{ fontSize: '14px' }}>
                            {business?.logo_url && (
                                <img
                                    src={getAssetUrl(business.logo_url)}
                                    alt="Logo"
                                    style={{ maxHeight: '48px', maxWidth: '180px', objectFit: 'contain', marginBottom: '8px', display: 'block' }}
                                />
                            )}
                            {business?.name && (
                                <>
                                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{business.name}</div>
                                    <div style={{ color: '#6b7280', fontSize: '12px' }}>
                                        {business.address && (
                                            <div style={{ whiteSpace: 'pre-line' }}>{business.address}</div>
                                        )}
                                        {business.email && <div>{business.email}</div>}
                                        {business.phone && <div>{business.phone}</div>}
                                    </div>
                                </>
                            )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <h1 style={{ fontSize: '32px', fontWeight: 300, color: '#2563eb', margin: '0 0 4px 0' }}>INVOICE</h1>
                            {invoiceNumber && (
                                <div style={{ fontSize: '14px', color: '#6b7280' }}>{invoiceNumber}</div>
                            )}
                        </div>
                    </div>

                    {/* Addresses and Dates */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px' }}>
                        <div style={{ width: '50%' }}>
                            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
                                Bill To
                            </div>
                            {customerName && <div style={{ fontWeight: 600, marginBottom: '4px' }}>{customerName}</div>}
                            <div style={{ color: '#6b7280', fontSize: '14px' }}>
                                {customerEmail && <div>{customerEmail}</div>}
                                {customerPhone && <div>{customerPhone}</div>}
                                {customerAddress && <div style={{ whiteSpace: 'pre-line' }}>{customerAddress}</div>}
                            </div>
                        </div>
                        <div style={{ width: '50%', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginBottom: '4px', fontSize: '14px' }}>
                                <span style={{ color: '#6b7280' }}>Issue Date:</span>
                                <span style={{ fontWeight: 500 }}>{formatDate(issueDate)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', fontSize: '14px' }}>
                                <span style={{ color: '#6b7280' }}>Due Date:</span>
                                <span style={{ fontWeight: 500 }}>{formatDate(dueDate)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Line Items Table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '32px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                <th style={{ padding: '8px 0', textAlign: 'left', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.5px', width: '50%' }}>Description</th>
                                <th style={{ padding: '8px 0', textAlign: 'right', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.5px' }}>Qty</th>
                                <th style={{ padding: '8px 0', textAlign: 'right', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.5px' }}>Unit Price</th>
                                <th style={{ padding: '8px 0', textAlign: 'right', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.5px' }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {validItems.map((item) => {
                                const lineTotal = item.quantity * item.unit_price;
                                const itemDesc = item.description && item.name !== item.description ? item.description : '';
                                return (
                                    <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                        <td style={{ padding: '12px 0' }}>
                                            <p style={{ margin: 0, fontWeight: 500 }}>{item.name}</p>
                                            {itemDesc && (
                                                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>{itemDesc}</p>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 0', textAlign: 'right' }}>{item.quantity}</td>
                                        <td style={{ padding: '12px 0', textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
                                        <td style={{ padding: '12px 0', textAlign: 'right' }}>{formatCurrency(lineTotal)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Totals */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '32px' }}>
                        <div style={{ width: '256px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                                <span>Subtotal</span>
                                <span>{formatCurrency(subtotal)}</span>
                            </div>
                            {taxAmount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                                    <span>Tax</span>
                                    <span>{formatCurrency(taxAmount)}</span>
                                </div>
                            )}
                            {discountAmount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                                    <span>Discount</span>
                                    <span>-{formatCurrency(discountAmount)}</span>
                                </div>
                            )}
                            <div style={{ borderTop: '1px solid #e5e7eb', margin: '8px 0' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '18px', fontWeight: 700 }}>
                                <span>Total</span>
                                <span>{formatCurrency(total)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    {notes && (
                        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>Notes</div>
                            <div style={{ fontSize: '14px', whiteSpace: 'pre-line' }}>{notes}</div>
                        </div>
                    )}

                    {/* Terms & Conditions */}
                    {termsAndConditions && (
                        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>Terms & Conditions</div>
                            <div style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'pre-line' }}>{termsAndConditions}</div>
                        </div>
                    )}

                    {/* Footer */}
                    <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '12px', marginTop: '32px' }}>
                        {business?.tax_id && <div>Tax ID: {business.tax_id}</div>}
                        <div style={{ marginTop: '8px' }}>Thank you for your business!</div>
                    </div>

                    {/* Powered By Footer */}
                    <div style={{
                        marginTop: '48px',
                        marginLeft: '-40px',
                        marginRight: '-40px',
                        padding: '16px 24px',
                        backgroundColor: '#2563eb',
                        borderRadius: '0',
                        textAlign: 'center',
                        color: '#ffffff',
                        fontSize: '14px'
                    }}>
                        <span style={{ marginRight: '8px' }}>Powered by</span>
                        <div
                            style={{
                                backgroundColor: '#ffffff',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                            }}
                        >
                            <img
                                src="/icon.png"
                                alt="itemize"
                                style={{
                                    height: '24px',
                                    width: 'auto',
                                    display: 'inline-block',
                                    verticalAlign: 'middle'
                                }}
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                }}
                            />
                            <img
                                src="/textblack.png"
                                alt="itemize.cloud"
                                style={{
                                    height: '20px',
                                    width: 'auto',
                                    display: 'inline-block',
                                    verticalAlign: 'middle'
                                }}
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    // Only add fallback if both images fail
                                    if (!target.parentElement?.querySelector('span.fallback-text')) {
                                        const fallback = document.createElement('span');
                                        fallback.textContent = 'itemize.cloud';
                                        fallback.className = 'fallback-text';
                                        fallback.style.color = '#111827';
                                        fallback.style.fontWeight = '500';
                                        target.parentElement?.appendChild(fallback);
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default InvoicePreview;
