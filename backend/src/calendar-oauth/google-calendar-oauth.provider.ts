import { calendar } from '@googleapis/calendar';
import { oauth2 } from '@googleapis/oauth2';
import { Logger } from '@nestjs/common';
import { OAuth2Client } from 'googleapis-common';

export const GOOGLE_CALENDAR_OAUTH_PROVIDER = Symbol(
  'GOOGLE_CALENDAR_OAUTH_PROVIDER',
);

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;
const FALLBACK_PRODUCTION_API_ORIGIN =
  'https://itemize-backend-production-92ad.up.railway.app';
const RAILWAY_DOMAIN = /^[a-z0-9.-]+$/i;

export type GoogleTokens = {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
};

export type GoogleUserInfo = { id?: string | null; email?: string | null };

export type GoogleCalendarSummary = {
  id: string | null | undefined;
  summary: string | null | undefined;
  description: string | null | undefined;
  primary: boolean;
  backgroundColor: string | null | undefined;
  accessRole: string | null | undefined;
};

export interface GoogleCalendarOAuthProvider {
  getAuthUrl(state: string): string;
  exchangeCodeForTokens(code: string): Promise<GoogleTokens>;
  getUserInfo(accessToken: string): Promise<GoogleUserInfo>;
  refreshAccessToken(refreshToken: string): Promise<GoogleTokens>;
  listCalendars(
    accessToken: string,
    refreshToken: string | null,
  ): Promise<GoogleCalendarSummary[]>;
  needsTokenRefresh(tokenExpiresAt: Date | string | null): boolean;
}

const getProductionApiOrigin = (): string => {
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain && RAILWAY_DOMAIN.test(railwayDomain)) {
    return `https://${railwayDomain}`;
  }
  return FALLBACK_PRODUCTION_API_ORIGIN;
};

const getCalendarOAuthRedirectUri = (): string => {
  const configured = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  if (!configured) {
    return process.env.NODE_ENV === 'production'
      ? `${getProductionApiOrigin()}/api/calendar-integrations/google/callback`
      : 'http://localhost:3001/api/calendar-integrations/google/callback';
  }
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('GOOGLE_CALENDAR_REDIRECT_URI must be an absolute HTTP(S) URL');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
  ) {
    throw new Error(
      'GOOGLE_CALENDAR_REDIRECT_URI must be a credential-free HTTPS URL in production',
    );
  }
  return configured;
};

export class SdkGoogleCalendarOAuthProvider
  implements GoogleCalendarOAuthProvider
{
  private readonly logger = new Logger(SdkGoogleCalendarOAuthProvider.name);

  getAuthUrl(state: string): string {
    return this.oauthClient().generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'consent',
      state,
    });
  }

  async exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
    const { tokens } = await this.oauthClient().getToken(code);
    return tokens;
  }

  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const client = this.oauthClient();
    client.setCredentials({ access_token: accessToken });
    const api = oauth2({ version: 'v2', auth: client });
    const { data } = await api.userinfo.get();
    return data;
  }

  async refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
    return this.withRetry(async () => {
      const client = this.oauthClient();
      client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await client.refreshAccessToken();
      this.logger.log('GoogleCalendar: Access token refreshed successfully');
      return credentials;
    }, 'refreshAccessToken');
  }

  async listCalendars(
    accessToken: string,
    refreshToken: string | null,
  ): Promise<GoogleCalendarSummary[]> {
    const client = this.oauthClient();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken ?? undefined,
    });
    const api = calendar({ version: 'v3', auth: client });
    const { data } = await api.calendarList.list();
    return (data.items ?? []).map((cal) => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      primary: cal.primary || false,
      backgroundColor: cal.backgroundColor,
      accessRole: cal.accessRole,
    }));
  }

  needsTokenRefresh(tokenExpiresAt: Date | string | null): boolean {
    if (!tokenExpiresAt) return true;
    const expiresAt = new Date(tokenExpiresAt);
    const now = new Date();
    return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
  }

  private oauthClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = getCalendarOAuthRedirectUri();
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }
    return new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const code = (error as { code?: number }).code;
        if (code === 401 || code === 403) throw error;
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt - 1);
          this.logger.warn(
            `GoogleCalendar: Retry attempt ${attempt}/${MAX_RETRIES} for ${context}: ${(error as Error).message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    this.logger.error(
      `GoogleCalendar: All retries failed for ${context}: ${(lastError as Error).message}`,
    );
    throw lastError;
  }
}
