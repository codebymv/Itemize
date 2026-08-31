import type { CalendarConnection } from './calendarIntegrationsApi';
import {
  calendarConnectionFields,
  getCalendarConnectionsViaGraphql,
  mapCalendarConnection,
  type GraphqlCalendarConnection,
} from './calendarIntegrationsGraphql';
import { getInvoiceSettingsViaGraphql } from './invoiceSettingsGraphql';
import {
  getSocialChannelsViaGraphql,
  type GraphqlSocialChannel,
} from './socialGraphql';
import { GraphqlRequestError, graphqlRequest } from './graphqlClient';

export type IntegrationOverview = {
  calendarConnections: CalendarConnection[];
  facebookChannel: { id: number; name: string } | null;
  facebookStatusAvailable: boolean;
  stripeConnected: boolean;
  stripeStatusAvailable: boolean;
};

type Capability = 'unknown' | 'aggregate' | 'separate';
let capability: Capability = 'unknown';

export const resetIntegrationOverviewCapability = (): void => {
  capability = 'unknown';
};

const isMissingAggregate = (error: unknown): boolean =>
  error instanceof GraphqlRequestError
  && /Cannot query field "integrationOverview"/.test(error.message);

const optionalRead = async <T>(
  request: Promise<T>,
  signal?: AbortSignal,
): Promise<{ available: true; value: T } | { available: false; value: null }> => {
  try {
    return { available: true, value: await request };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { available: false, value: null };
  }
};

const getSeparateOverview = async (
  organizationId: number,
  signal?: AbortSignal,
): Promise<IntegrationOverview> => {
  const [calendarConnections, facebook, settings] = await Promise.all([
    getCalendarConnectionsViaGraphql(organizationId, signal),
    optionalRead(
      getSocialChannelsViaGraphql('facebook', organizationId, signal),
      signal,
    ),
    optionalRead(getInvoiceSettingsViaGraphql(organizationId, signal), signal),
  ]);
  const facebookChannel = facebook.available
    ? facebook.value.find((channel) => channel.is_active) ?? null
    : null;

  return {
    calendarConnections,
    facebookChannel: facebookChannel
      ? { id: facebookChannel.id, name: facebookChannel.name }
      : null,
    facebookStatusAvailable: facebook.available,
    stripeConnected: settings.available
      ? Boolean(settings.value.stripe_connected)
      : false,
    stripeStatusAvailable: settings.available,
  };
};

export const getIntegrationOverviewViaGraphql = async (
  organizationId: number,
  signal?: AbortSignal,
): Promise<IntegrationOverview> => {
  if (capability === 'separate') {
    return getSeparateOverview(organizationId, signal);
  }

  type AggregateData = {
    integrationOverview: {
      calendarConnections: GraphqlCalendarConnection[];
      facebookChannel: { id: number; name: string } | null;
      facebookStatusAvailable: boolean;
      stripeConnected: boolean;
      stripeStatusAvailable: boolean;
    };
  };

  try {
    const data = await graphqlRequest<AggregateData, Record<string, never>>(
      `query IntegrationOverview {
        integrationOverview {
          calendarConnections { ${calendarConnectionFields} }
          facebookChannel { id name }
          facebookStatusAvailable
          stripeConnected
          stripeStatusAvailable
        }
      }`,
      {},
      organizationId,
      signal,
    );
    capability = 'aggregate';
    return {
      calendarConnections: data.integrationOverview.calendarConnections.map(
        mapCalendarConnection,
      ),
      facebookChannel: data.integrationOverview.facebookChannel,
      facebookStatusAvailable: data.integrationOverview.facebookStatusAvailable,
      stripeConnected: data.integrationOverview.stripeConnected,
      stripeStatusAvailable: data.integrationOverview.stripeStatusAvailable,
    };
  } catch (error) {
    if (!isMissingAggregate(error)) throw error;
    capability = 'separate';
    return getSeparateOverview(organizationId, signal);
  }
};
