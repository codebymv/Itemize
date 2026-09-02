import { getApiUrl } from '@/lib/api';

export type PublicEstimateStatus = 'sent' | 'accepted' | 'declined';

export interface PublicEstimateData {
  estimate: {
    number: string;
    status: PublicEstimateStatus;
    issue_date: string;
    valid_until: string;
    currency: string;
    subtotal: string;
    tax_amount: string;
    discount_amount: string;
    total: string;
    notes: string | null;
    terms_and_conditions: string | null;
    sent_at: string | null;
    viewed_at: string | null;
    accepted_at: string | null;
    declined_at: string | null;
  };
  customer: { name: string | null };
  business: { name: string; email: string | null };
  items: Array<{
    name: string;
    description: string | null;
    quantity: string;
    unit_price: string;
    tax_rate: string;
    tax_amount: string;
    total: string;
  }>;
}

type Envelope = {
  success?: boolean;
  data?: PublicEstimateData;
  error?: { message?: string };
};

const MAX_NETWORK_RETRIES = 2;

const networkRetryDelay = (attempt: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, 200 * (2 ** attempt)));

const request = async (
  token: string,
  action?: 'accept' | 'decline',
): Promise<PublicEstimateData> => {
  const suffix = action ? `/${action}` : '';
  let response: Response | null = null;
  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt += 1) {
    try {
      response = await fetch(
        `${getApiUrl()}/api/public/estimates/${encodeURIComponent(token)}${suffix}`,
        {
          method: action ? 'POST' : 'GET',
          credentials: 'omit',
          headers: { Accept: 'application/json' },
          referrerPolicy: 'no-referrer',
        },
      );
      break;
    } catch (error) {
      if (attempt === MAX_NETWORK_RETRIES) throw error;
      await networkRetryDelay(attempt);
    }
  }
  if (!response) throw new Error('This estimate is unavailable');
  const payload = await response.json().catch(() => ({})) as Envelope;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'This estimate is unavailable');
  }
  return payload.data;
};

export const getPublicEstimate = (token: string) => request(token);

export const acceptPublicEstimate = (token: string) => request(token, 'accept');

export const declinePublicEstimate = (token: string) => request(token, 'decline');
