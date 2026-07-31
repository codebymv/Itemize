/**
 * Invoices API Service
 * Handles invoicing, payments, and Stripe integration
 */
import api from '@/lib/api';
import type { JsonRecord } from '@/types';
import {
    createInvoiceBusinessViaGraphql,
    deleteInvoiceBusinessViaGraphql,
    removeInvoiceBusinessLogoViaGraphql,
    getInvoiceBusinessesViaGraphql,
    getInvoiceBusinessViaGraphql,
    updateInvoiceBusinessViaGraphql,
} from './invoiceBusinessesGraphql';
import {
    createProductViaGraphql,
    deleteProductViaGraphql,
    getProductsViaGraphql,
    updateProductViaGraphql,
} from './productsGraphql';
import { recordInvoicePaymentViaGraphql } from './invoicePaymentsApi';
import {
    createInvoiceViaGraphql,
    deleteInvoiceViaGraphql,
    getInvoiceViaGraphql,
    getInvoicesViaGraphql,
    updateInvoiceViaGraphql,
    sendInvoiceViaGraphql,
    createInvoicePaymentLinkViaGraphql,
} from './invoicesGraphql';
import { createRecurringInvoiceFromInvoiceViaGraphql } from './recurringInvoicesGraphql';
import {
    getInvoiceSettingsViaGraphql,
    updateInvoiceSettingsViaGraphql,
    removeInvoiceSettingsLogoViaGraphql,
} from './invoiceSettingsGraphql';
import { previewInvoiceEmailViaGraphql } from './invoiceEmailPreviewGraphql';

const unwrapResponse = <T>(payload: unknown): T => {
    if (payload && typeof payload === 'object' && 'data' in payload) {
        return payload.data as T;
    }
    return payload as T;
};

// ======================
// Types
// ======================

export interface Product {
    id: number;
    organization_id: number;
    name: string;
    description?: string;
    sku?: string;
    price: number;
    currency: string;
    product_type: 'one_time' | 'recurring';
    billing_period?: 'monthly' | 'yearly' | 'weekly' | 'quarterly';
    tax_rate: number;
    taxable: boolean;
    stripe_product_id?: string;
    stripe_price_id?: string;
    is_active: boolean;
    created_by?: number;
    created_at: string;
    updated_at: string;
}

export interface InvoiceItem {
    id?: number;
    invoice_id?: number;
    product_id?: number;
    name: string;
    description?: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    tax_amount?: number;
    discount_amount?: number;
    total?: number;
    sort_order?: number;
    product_name?: string;
}

export interface Invoice {
    id: number;
    organization_id: number;
    invoice_number: string;
    contact_id?: number;
    business_id?: number;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    customer_address?: string;
    issue_date: string;
    due_date: string;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    discount_type?: 'fixed' | 'percent';
    discount_value: number;
    total: number;
    amount_paid: number;
    amount_due: number;
    currency: string;
    status: 'draft' | 'sent' | 'viewed' | 'paid' | 'partial' | 'overdue' | 'cancelled' | 'refunded';
    payment_terms?: string;
    payment_instructions?: string;
    notes?: string;
    terms_and_conditions?: string;
    stripe_invoice_id?: string;
    stripe_payment_intent_id?: string;
    stripe_hosted_invoice_url?: string;
    stripe_pdf_url?: string;
    sent_at?: string;
    viewed_at?: string;
    paid_at?: string;
    is_recurring: boolean;
    recurring_interval?: string;
    parent_invoice_id?: number;
    custom_fields: JsonRecord;
    created_by?: number;
    created_at: string;
    updated_at: string;
    
    // From joins
    contact_first_name?: string;
    contact_last_name?: string;
    contact_email?: string;
    items?: InvoiceItem[];
    payments?: Payment[];
    business?: Business;
}

export interface Payment {
    id: number;
    organization_id: number;
    invoice_id?: number;
    contact_id?: number;
    amount: number;
    currency: string;
    payment_method: 'card' | 'bank_transfer' | 'cash' | 'check' | 'other' | 'stripe';
    status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
    stripe_payment_intent_id?: string;
    stripe_charge_id?: string;
    stripe_refund_id?: string;
    card_last4?: string;
    card_brand?: string;
    description?: string;
    notes?: string;
    receipt_url?: string;
    refund_amount: number;
    refunded_at?: string;
    refund_reason?: string;
    paid_at?: string;
    created_at: string;
    updated_at: string;
}

export interface PaymentSettings {
    id?: number;
    organization_id?: number;
    stripe_account_id?: string;
    stripe_publishable_key?: string;
    stripe_connected: boolean;
    stripe_connected_at?: string;
    invoice_prefix: string;
    next_invoice_number: number;
    default_payment_terms: number;
    default_notes?: string;
    default_terms?: string;
    default_tax_rate: number;
    tax_id?: string;
    business_name?: string;
    business_address?: string;
    business_phone?: string;
    business_email?: string;
    logo_url?: string;
    default_currency: string;
    created_at?: string;
    updated_at?: string;
}

export interface Business {
    id: number;
    organization_id: number;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    tax_id?: string;
    logo_url?: string;
    is_active: boolean;
    last_used_at?: string;
    created_at: string;
    updated_at: string;
}

// ======================
// Product API Functions
// ======================

export const getProducts = async (
    params: { is_active?: boolean; search?: string } = {},
    organizationId?: number
): Promise<Product[]> => {
    return getProductsViaGraphql(params, organizationId);
};

export const createProduct = async (
    product: Partial<Product>,
    organizationId?: number
): Promise<Product> => {
    return createProductViaGraphql(product, organizationId);
};

export const updateProduct = async (
    productId: number,
    product: Partial<Product>,
    organizationId?: number
): Promise<Product> => {
    return updateProductViaGraphql(productId, product, organizationId);
};

export const deleteProduct = async (
    productId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    return deleteProductViaGraphql(productId, organizationId);
};

// ======================
// Invoice API Functions
// ======================

export const getInvoices = async (
    params: {
        status?: Invoice['status'] | 'all';
        contact_id?: number;
        page?: number;
        limit?: number;
        search?: string;
    } = {},
    organizationId?: number
): Promise<{ invoices: Invoice[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    return getInvoicesViaGraphql(params, organizationId);
};

export const getInvoice = async (
    invoiceId: number,
    organizationId?: number
): Promise<Invoice> => {
    return getInvoiceViaGraphql(invoiceId, organizationId);
};

export const createInvoice = async (
    invoice: {
        contact_id?: number;
        business_id?: number;
        customer_name?: string;
        customer_email?: string;
        customer_phone?: string;
        customer_address?: string;
        issue_date?: string;
        due_date?: string;
        items: InvoiceItem[];
        discount_type?: 'fixed' | 'percent';
        discount_value?: number;
        tax_rate?: number;
        notes?: string;
        terms_and_conditions?: string;
        payment_terms?: number | string;
    },
    organizationId?: number
): Promise<Invoice> => {
    return createInvoiceViaGraphql(invoice, organizationId);
};

export const updateInvoice = async (
    invoiceId: number,
    invoice: Partial<Omit<Invoice, 'payment_terms'>> & { payment_terms?: number | string; items?: InvoiceItem[] },
    organizationId?: number
): Promise<Invoice> => {
    return updateInvoiceViaGraphql(invoiceId, invoice, organizationId);
};

export const deleteInvoice = async (
    invoiceId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    return deleteInvoiceViaGraphql(invoiceId, organizationId);
};

export interface SendInvoiceOptions {
    subject?: string;
    message?: string;
    ccEmails?: string[];
    includePaymentLink?: boolean;
    resend?: boolean;
}

export interface SendInvoiceResponse extends Invoice {
    emailSent?: boolean;
    emailError?: string;
}

export const sendInvoice = async (
    invoiceId: number,
    organizationId?: number,
    options?: SendInvoiceOptions
): Promise<SendInvoiceResponse> => {
    return sendInvoiceViaGraphql(invoiceId, options ?? {}, organizationId);
};

/**
 * Invoice Email Preview
 */
export interface InvoiceEmailPreviewRequest {
    message: string;
    subject: string;
    includePaymentLink?: boolean;
    baseUrl?: string;
}

export interface InvoiceEmailPreviewResponse {
    html: string;
}

export const getInvoiceEmailPreview = async (
    data: InvoiceEmailPreviewRequest,
    organizationId?: number
): Promise<InvoiceEmailPreviewResponse> => {
    return previewInvoiceEmailViaGraphql(data, organizationId);
};

export const recordPayment = async (
    invoiceId: number,
    payment: {
        amount: number;
        payment_method?: Payment['payment_method'];
        notes?: string;
    },
    organizationId?: number
): Promise<{ payment: Payment; invoice: { amount_paid: number; amount_due: number; status: string } }> => {
    const result = await recordInvoicePaymentViaGraphql(
        invoiceId,
        payment,
        organizationId
    );
    return {
        payment: {
            ...result.payment,
            refund_amount: 0,
            updated_at: result.payment.updated_at ?? result.payment.created_at
        },
        invoice: result.invoice
    };
};

export const createPaymentLink = async (
    invoiceId: number,
    organizationId?: number
): Promise<{ url: string; session_id: string }> => {
    return createInvoicePaymentLinkViaGraphql(invoiceId, organizationId);
};

export const createRecurringTemplateFromInvoice = async (
    invoiceId: number,
    data: {
        template_name: string;
        frequency: string;
        start_date: string;
        end_date?: string;
    },
    organizationId?: number
): Promise<{ recurring_template_id: number }> => {
    return createRecurringInvoiceFromInvoiceViaGraphql(
        invoiceId,
        data,
        organizationId
    );
};

// ======================
// Settings API Functions
// ======================

export const getPaymentSettings = async (organizationId?: number): Promise<PaymentSettings> => {
    return getInvoiceSettingsViaGraphql(organizationId);
};

export const updatePaymentSettings = async (
    settings: Partial<PaymentSettings>,
    organizationId?: number
): Promise<PaymentSettings> => {
    return updateInvoiceSettingsViaGraphql(settings, organizationId);
};

export const uploadLogo = async (
    file: File,
    organizationId?: number
): Promise<{ success: boolean; logo_url: string }> => {
    const formData = new FormData();
    formData.append('logo', file);
    const response = await api.post('/api/invoices/settings/logo', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
            ...(organizationId ? { 'x-organization-id': organizationId.toString() } : {})
        }
    });
    return unwrapResponse<{ success: boolean; logo_url: string }>(response.data);
};

export const deleteLogo = async (organizationId?: number): Promise<{ success: boolean }> => {
    return removeInvoiceSettingsLogoViaGraphql(organizationId);
};

// ======================
// Business API Functions
// ======================

export const getBusinesses = async (organizationId?: number): Promise<Business[]> => {
    return getInvoiceBusinessesViaGraphql(organizationId);
};

export const getBusiness = async (
    businessId: number,
    organizationId?: number
): Promise<Business> => {
    return getInvoiceBusinessViaGraphql(businessId, organizationId);
};

export const createBusiness = async (
    business: Partial<Business>,
    organizationId?: number
): Promise<Business> => {
    return createInvoiceBusinessViaGraphql(business, organizationId);
};

export const updateBusiness = async (
    businessId: number,
    business: Partial<Business>,
    organizationId?: number
): Promise<Business> => {
    return updateInvoiceBusinessViaGraphql(businessId, business, organizationId);
};

export const deleteBusiness = async (
    businessId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    return deleteInvoiceBusinessViaGraphql(businessId, organizationId);
};

export const uploadBusinessLogo = async (
    businessId: number,
    file: File,
    organizationId?: number
): Promise<{ logo_url: string }> => {
    const formData = new FormData();
    formData.append('logo', file);
    const response = await api.post(`/api/invoices/businesses/${businessId}/logo`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
            ...(organizationId ? { 'x-organization-id': organizationId.toString() } : {})
        }
    });
    return response.data;
};

export const deleteBusinessLogo = async (
    businessId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    return removeInvoiceBusinessLogoViaGraphql(businessId, organizationId);
};

const invoicePdfFilename = (contentDisposition: unknown, invoiceId: number): string => {
    const match = typeof contentDisposition === 'string'
        ? contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i)
        : null;
    const candidate = match?.[1]
        ?.trim()
        .replace(/[\\/]/g, '')
        .replace(/^[.\s-]+/, '')
        .slice(0, 124);
    return candidate || `invoice-${invoiceId}.pdf`;
};

export const downloadInvoicePdf = async (
    invoiceId: number,
    organizationId?: number
): Promise<void> => {
    const response = await api.get(`/api/invoices/${invoiceId}/pdf`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
        responseType: 'blob'
    });
    const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], {
            type: response.headers?.['content-type'] || 'application/pdf'
        });
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = invoicePdfFilename(
        response.headers?.['content-disposition'],
        invoiceId
    );
    try {
        document.body.appendChild(anchor);
        anchor.click();
    } finally {
        anchor.remove();
        window.URL.revokeObjectURL(objectUrl);
    }
};

export default {
    // Products
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    // Invoices
    getInvoices,
    getInvoice,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    sendInvoice,
    recordPayment,
    createPaymentLink,
    createRecurringTemplateFromInvoice,
    downloadInvoicePdf,
    // Settings
    getPaymentSettings,
    updatePaymentSettings,
    uploadLogo,
    deleteLogo,
    // Businesses
    getBusinesses,
    getBusiness,
    createBusiness,
    updateBusiness,
    deleteBusiness,
    uploadBusinessLogo,
    deleteBusinessLogo
};
