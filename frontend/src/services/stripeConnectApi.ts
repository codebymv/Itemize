import api from '@/lib/api';

const orgHeaders = (organizationId?: number) => (
  organizationId ? { 'x-organization-id': organizationId.toString() } : {}
);

export const initiateStripeConnect = async (
  organizationId?: number,
  returnUrl?: string,
): Promise<{ authUrl: string }> => {
  const response = await api.get('/api/invoice-integrations/stripe/connect', {
    params: { return_url: returnUrl },
    headers: orgHeaders(organizationId),
  });
  return response.data;
};

export const disconnectStripeConnect = async (
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const response = await api.post('/api/invoice-integrations/stripe/disconnect', {}, {
    headers: orgHeaders(organizationId),
  });
  return response.data;
};
