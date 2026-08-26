import { getApiUrl } from '@/lib/api';

export type PublicInvoicePaymentResult = {
  invoiceNumber: string;
  businessName: string;
  amount: string;
  currency: string;
  status: 'processing' | 'paid' | 'refunded';
  updatedAt: string;
};

type Envelope = {
  success?: boolean;
  data?: PublicInvoicePaymentResult;
  error?: { message?: string };
  message?: string;
};

export async function getPublicInvoicePaymentResult(
  sessionId: string,
): Promise<PublicInvoicePaymentResult> {
  const response = await fetch(
    `${getApiUrl()}/api/public/invoice-payments/${encodeURIComponent(sessionId)}`,
    {
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      referrerPolicy: 'no-referrer',
    },
  );
  const payload = await response.json().catch(() => ({})) as Envelope;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(
      payload.error?.message || payload.message || 'Payment confirmation is unavailable',
    );
  }
  return payload.data;
}
