export type IntegrationOAuthResult =
  | { ok: true; provider: 'google' | 'facebook' }
  | { ok: false; error: string };

export const INTEGRATIONS_PATH = '/calendar-integrations';
export const INTEGRATIONS_ALIAS_PATH = '/settings/integrations';

export function readIntegrationOAuthResult(search: string): IntegrationOAuthResult | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  if (params.get('google_connected') === 'true') {
    return { ok: true, provider: 'google' };
  }
  if (params.get('success') === 'facebook_connected') {
    return { ok: true, provider: 'facebook' };
  }

  const error = params.get('error');
  if (error) {
    return { ok: false, error };
  }

  return null;
}

export function integrationOAuthToast(result: IntegrationOAuthResult): {
  title: string;
  description: string;
  variant?: 'destructive';
} {
  if (result.ok && result.provider === 'google') {
    return {
      title: 'Google Calendar connected',
      description: 'Your Google Calendar is now linked and ready to sync.',
    };
  }
  if (result.ok) {
    return {
      title: 'Facebook connected',
      description: 'Your Facebook Page is now linked for inbox conversations.',
    };
  }

  return {
    title: 'Connection failed',
    description: result.error.replace(/_/g, ' '),
    variant: 'destructive',
  };
}
