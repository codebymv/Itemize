export type StripeCheckoutSession = {
  id: string;
  invoiceId: number | null;
  metadataOrganizationId: string | null;
  paymentReference: string | null;
  paymentStatus: string | null;
  amount: string | null;
  currency: string | null;
};

export type StripeInvoiceEvent = {
  id: string;
  type: string;
  session: StripeCheckoutSession | null;
  connectedAccount: {
    stripeAccountId: string;
    connected: boolean | null;
  } | null;
  refund: {
    refundId: string;
    paymentReference: string;
    stripeAccountId: string;
    amount: string;
    currency: string;
    status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled';
    reason: string | null;
    failureCode: string | null;
  } | null;
};

export type StripeInvoiceWebhookResult = {
  received: true;
  duplicateEvent: boolean;
  handled: boolean;
  duplicatePayment?: boolean;
  reason?: string;
};

export type StripeInvoiceWebhookRepositoryResult = StripeInvoiceWebhookResult & {
  activation?: {
    organizationId: number;
    invoiceId: number;
  };
};
