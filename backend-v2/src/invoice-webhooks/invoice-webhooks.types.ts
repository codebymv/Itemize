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
};

export type StripeInvoiceWebhookResult = {
  received: true;
  duplicateEvent: boolean;
  handled: boolean;
  duplicatePayment?: boolean;
  reason?: string;
};
