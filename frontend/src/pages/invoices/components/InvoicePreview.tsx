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
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col w-[95vw] sm:w-full">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Eye className="h-5 w-5 text-blue-600" />
                        Invoice Preview
                    </DialogTitle>
                    <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
                        This is exactly how your invoice PDF will appear
                    </DialogDescription>
                </DialogHeader>

                {/* Invoice Preview Content - matches PDF exactly */}
                {/* Note: Raleway font should be loaded in index.html for full parity */}
                <style>{`
                    @media (max-width: 768px) {
                        .invoice-preview-container {
                            padding: 20px !important;
                            height: auto !important;
                            min-height: auto !important;
                            font-size: 12px !important;
                        }
                        .invoice-preview-header {
                            flex-direction: column !important;
                            gap: 16px !important;
                            margin-bottom: 24px !important;
                        }
                        .invoice-preview-header > div:last-child {
                            text-align: left !important;
                        }
                        .invoice-preview-header h1 {
                            font-size: 24px !important;
                        }
                        .invoice-preview-header .invoice-preview-business-info {
                            font-size: 12px !important;
                        }
                        .invoice-preview-header .invoice-preview-business-details {
                            font-size: 11px !important;
                        }
                        .invoice-preview-header .invoice-preview-invoice-number {
                            font-size: 12px !important;
                        }
                        .invoice-preview-addresses {
                            flex-direction: column !important;
                            gap: 16px !important;
                            margin-bottom: 24px !important;
                        }
                        .invoice-preview-addresses > div {
                            width: 100% !important;
                        }
                        .invoice-preview-addresses .invoice-preview-dates {
                            text-align: left !important;
                        }
                        .invoice-preview-addresses .invoice-preview-date-row {
                            justify-content: flex-start !important;
                            flex-wrap: wrap !important;
                            font-size: 12px !important;
                        }
                        .invoice-preview-addresses .invoice-preview-customer-details {
                            font-size: 12px !important;
                        }
                        .invoice-preview-table {
                            margin-bottom: 24px !important;
                        }
                        .invoice-preview-table th {
                            font-size: 9px !important;
                            padding: 6px 2px !important;
                            white-space: normal !important;
                            word-break: break-word !important;
                            line-height: 1.3 !important;
                        }
                        .invoice-preview-table th:nth-child(3) {
                            white-space: normal !important;
                        }
                        .invoice-preview-table td {
                            padding: 8px 2px !important;
                            font-size: 12px !important;
                        }
                        .invoice-preview-table td:first-child {
                            min-width: 120px !important;
                        }
                        .invoice-preview-table .invoice-preview-item-description {
                            font-size: 11px !important;
                        }
                        .invoice-preview-totals-container {
                            justify-content: flex-start !important;
                            margin-bottom: 24px !important;
                        }
                        .invoice-preview-totals {
                            width: 100% !important;
                            max-width: 100% !important;
                        }
                        .invoice-preview-totals .invoice-preview-total-row {
                            font-size: 12px !important;
                        }
                        .invoice-preview-totals .invoice-preview-grand-total {
                            font-size: 16px !important;
                        }
                        .invoice-preview-notes {
                            font-size: 12px !important;
                            margin-bottom: 12px !important;
                        }
                        .invoice-preview-notes .invoice-preview-notes-label {
                            font-size: 10px !important;
                        }
                        .invoice-preview-footer {
                            font-size: 11px !important;
                            margin-top: 24px !important;
                        }
                        .invoice-preview-powered-footer {
                            margin-left: -20px !important;
                            margin-right: -20px !important;
                            width: calc(100% + 40px) !important;
                            padding: 12px 16px !important;
                            font-size: 11px !important;
                        }
                    }
                `}</style>
                <div className="invoice-preview-container" style={{
                    fontFamily: "'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    fontSize: '14px',
                    lineHeight: 1.5,
                    color: '#111827',
                    background: 'white',
                    padding: '40px',
                    paddingBottom: 0,
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    display: 'flex',
                    flexDirection: 'column',
                    /* Fixed height for Letter page (8.5x11) aspect ratio: width * (11/8.5) ≈ 990px for ~765px width */
                    height: '990px',
                    boxSizing: 'border-box'
                }}>
                    <div style={{ flex: 1 }}>
                    {/* Header */}
                    <div className="invoice-preview-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                        <div className="invoice-preview-business-info" style={{ fontSize: '14px' }}>
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
                                    <div className="invoice-preview-business-details" style={{ color: '#6b7280', fontSize: '12px' }}>
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
                                <div className="invoice-preview-invoice-number" style={{ fontSize: '14px', color: '#6b7280' }}>{invoiceNumber}</div>
                            )}
                        </div>
                    </div>

                    {/* Addresses and Dates */}
                    <div className="invoice-preview-addresses" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px' }}>
                        <div style={{ width: '50%' }}>
                            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
                                Bill To
                            </div>
                            {customerName && <div style={{ fontWeight: 600, marginBottom: '4px' }}>{customerName}</div>}
                            <div className="invoice-preview-customer-details" style={{ color: '#6b7280', fontSize: '14px' }}>
                                {customerEmail && <div>{customerEmail}</div>}
                                {customerPhone && <div>{customerPhone}</div>}
                                {customerAddress && <div style={{ whiteSpace: 'pre-line' }}>{customerAddress}</div>}
                            </div>
                        </div>
                        <div className="invoice-preview-dates" style={{ width: '50%', textAlign: 'right' }}>
                            <div className="invoice-preview-date-row" style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginBottom: '4px', fontSize: '14px' }}>
                                <span style={{ color: '#6b7280' }}>Issue Date:</span>
                                <span style={{ fontWeight: 500 }}>{formatDate(issueDate)}</span>
                            </div>
                            <div className="invoice-preview-date-row" style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', fontSize: '14px' }}>
                                <span style={{ color: '#6b7280' }}>Due Date:</span>
                                <span style={{ fontWeight: 500 }}>{formatDate(dueDate)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Line Items Table */}
                    <table className="invoice-preview-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '32px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                <th style={{ padding: '8px 0', textAlign: 'left', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.5px', width: '50%' }}>Description</th>
                                <th style={{ padding: '8px 0', textAlign: 'right', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.5px' }}>Qty</th>
                                <th style={{ padding: '8px 0', textAlign: 'right', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Unit Price</th>
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
                                                <p className="invoice-preview-item-description" style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>{itemDesc}</p>
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
                    <div className="invoice-preview-totals-container" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '32px' }}>
                        <div className="invoice-preview-totals" style={{ width: '256px' }}>
                            <div className="invoice-preview-total-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                                <span>Subtotal</span>
                                <span>{formatCurrency(subtotal)}</span>
                            </div>
                            {taxAmount > 0 && (
                                <div className="invoice-preview-total-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                                    <span>Tax</span>
                                    <span>{formatCurrency(taxAmount)}</span>
                                </div>
                            )}
                            {discountAmount > 0 && (
                                <div className="invoice-preview-total-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                                    <span>Discount</span>
                                    <span>-{formatCurrency(discountAmount)}</span>
                                </div>
                            )}
                            <div style={{ borderTop: '1px solid #e5e7eb', margin: '8px 0' }} />
                            <div className="invoice-preview-grand-total" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '18px', fontWeight: 700 }}>
                                <span>Total</span>
                                <span>{formatCurrency(total)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    {notes && (
                        <div className="invoice-preview-notes" style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                            <div className="invoice-preview-notes-label" style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>Notes</div>
                            <div style={{ fontSize: '14px', whiteSpace: 'pre-line' }}>{notes}</div>
                        </div>
                    )}

                    {/* Terms & Conditions */}
                    {termsAndConditions && (
                        <div className="invoice-preview-notes" style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                            <div className="invoice-preview-notes-label" style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>Terms & Conditions</div>
                            <div style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'pre-line' }}>{termsAndConditions}</div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="invoice-preview-footer" style={{ textAlign: 'center', color: '#6b7280', fontSize: '12px', marginTop: '32px' }}>
                        {business?.tax_id && <div>Tax ID: {business.tax_id}</div>}
                        <div style={{ marginTop: '8px' }}>Thank you for your business!</div>
                    </div>
                    </div>
                    {/* /.invoice-content */}

                    {/* Powered By Footer */}
                    <div className="invoice-preview-powered-footer" style={{
                        marginTop: 'auto',
                        marginLeft: '-40px',
                        marginRight: '-40px',
                        marginBottom: '0',
                        padding: '16px 24px',
                        backgroundColor: '#2563eb',
                        borderRadius: '0',
                        textAlign: 'center',
                        color: '#ffffff',
                        fontSize: '14px',
                        width: 'calc(100% + 80px)'
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
