/**
 * Invoices API Service
 * Handles invoicing, payments, and Stripe integration
 */
import api from '@/lib/api';

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
    custom_fields: Record<string, any>;
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
    const response = await api.get('/api/invoices/products', {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const createProduct = async (
    product: Partial<Product>,
    organizationId?: number
): Promise<Product> => {
    const response = await api.post('/api/invoices/products', product, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const updateProduct = async (
    productId: number,
    product: Partial<Product>,
    organizationId?: number
): Promise<Product> => {
    const response = await api.put(`/api/invoices/products/${productId}`, product, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const deleteProduct = async (
    productId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    const response = await api.delete(`/api/invoices/products/${productId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
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
    const response = await api.get('/api/invoices', {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const getInvoice = async (
    invoiceId: number,
    organizationId?: number
): Promise<Invoice> => {
    const response = await api.get(`/api/invoices/${invoiceId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
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
        payment_terms?: number;
    },
    organizationId?: number
): Promise<Invoice> => {
    const response = await api.post('/api/invoices', invoice, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const updateInvoice = async (
    invoiceId: number,
    invoice: Partial<Invoice> & { items?: InvoiceItem[] },
    organizationId?: number
): Promise<Invoice> => {
    const response = await api.put(`/api/invoices/${invoiceId}`, invoice, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const deleteInvoice = async (
    invoiceId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    const response = await api.delete(`/api/invoices/${invoiceId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export interface SendInvoiceOptions {
    subject?: string;
    message?: string;
    ccEmails?: string[];
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
    const response = await api.post(`/api/invoices/${invoiceId}/send`, options || {}, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
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
    const response = await api.post(`/api/invoices/${invoiceId}/record-payment`, payment, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const createPaymentLink = async (
    invoiceId: number,
    organizationId?: number
): Promise<{ client_secret: string; payment_intent_id: string }> => {
    const response = await api.post(`/api/invoices/${invoiceId}/create-payment-link`, {}, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Settings API Functions
// ======================

export const getPaymentSettings = async (organizationId?: number): Promise<PaymentSettings> => {
    const response = await api.get('/api/invoices/settings', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const updatePaymentSettings = async (
    settings: Partial<PaymentSettings>,
    organizationId?: number
): Promise<PaymentSettings> => {
    const response = await api.put('/api/invoices/settings', settings, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
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
    return response.data;
};

export const deleteLogo = async (organizationId?: number): Promise<{ success: boolean }> => {
    const response = await api.delete('/api/invoices/settings/logo', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Business API Functions
// ======================

export const getBusinesses = async (organizationId?: number): Promise<Business[]> => {
    const response = await api.get('/api/invoices/businesses', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const getBusiness = async (
    businessId: number,
    organizationId?: number
): Promise<Business> => {
    const response = await api.get(`/api/invoices/businesses/${businessId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const createBusiness = async (
    business: Partial<Business>,
    organizationId?: number
): Promise<Business> => {
    const response = await api.post('/api/invoices/businesses', business, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const updateBusiness = async (
    businessId: number,
    business: Partial<Business>,
    organizationId?: number
): Promise<Business> => {
    const response = await api.put(`/api/invoices/businesses/${businessId}`, business, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const deleteBusiness = async (
    businessId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    const response = await api.delete(`/api/invoices/businesses/${businessId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
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
    const response = await api.delete(`/api/invoices/businesses/${businessId}/logo`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
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
