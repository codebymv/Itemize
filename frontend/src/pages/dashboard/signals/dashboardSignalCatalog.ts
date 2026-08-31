import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertCircle,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileSignature,
  Mail,
  Map as MapIcon,
  MessageSquare,
  MousePointerClick,
  Receipt,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  Workflow,
} from 'lucide-react';

import type { StatTheme } from '@/hooks/useStatStyles';
import type {
  CommunicationStats,
  ConversionRates,
  DashboardAnalytics,
  PipelineDealAge,
} from '@/services/analyticsApi';
import {
  PAYMENT_PERIOD_LABELS,
  type PaymentPeriod,
  type RevenueFlow,
} from '@/services/invoicePaymentsApi';
import { formatCompactMoney, formatCompactNumber, formatMoney } from '@/lib/numberFormat';

export const DASHBOARD_SIGNAL_IDS = [
  'contacts-total',
  'contacts-new-month',
  'contacts-active',
  'contacts-new-week',
  'deals-open',
  'pipeline-open-value',
  'deals-won',
  'bookings-upcoming',
  'bookings-today',
  'tasks-overdue',
  'pipelines-configured',
  'invoices-pending',
  'invoices-overdue',
  'invoices-paid-month',
  'signatures-awaiting',
  'signatures-signed-week',
  'workspace-active',
  'revenue-net',
  'revenue-booked',
  'payment-failures',
  'deal-win-rate',
  'form-contact-rate',
  'email-open-rate',
  'email-failures',
  'sms-inbound',
  'sms-failures',
] as const;

export type DashboardSignalId = typeof DASHBOARD_SIGNAL_IDS[number];

export const DEFAULT_DASHBOARD_SIGNAL_IDS: DashboardSignalId[] = [
  'contacts-new-month',
  'deals-open',
  'bookings-upcoming',
  'tasks-overdue',
  'invoices-overdue',
  'signatures-awaiting',
];

export const MAX_PINNED_DASHBOARD_SIGNALS = 8;
export const MIN_PINNED_DASHBOARD_SIGNALS = 1;

export const DASHBOARD_SIGNAL_GROUPS = [
  'Contacts',
  'Pipelines',
  'Sales & Payments',
  'Documents',
  'Workspace',
  'Communications',
  'Scheduling',
] as const;

export type DashboardSignalGroup = typeof DASHBOARD_SIGNAL_GROUPS[number];

export interface DashboardSignal {
  id: DashboardSignalId;
  title: string;
  catalogDescription: string;
  source: DashboardSignalGroup;
  route: string;
  icon: LucideIcon;
  theme: StatTheme;
  value: string;
  compactValue?: string;
  supportingText: string;
  timeframe?: string;
  status: 'ready' | 'loading' | 'unavailable';
  numericValue?: number;
  requiresAttention?: boolean;
}

interface SignalContext {
  analytics?: DashboardAnalytics;
  conversions?: ConversionRates;
  communications?: CommunicationStats;
  pipelineDealAge?: PipelineDealAge;
  revenue?: RevenueFlow;
  loading: {
    analytics: boolean;
    conversions: boolean;
    communications: boolean;
    pipelineDealAge: boolean;
    revenue: boolean;
  };
  errors: {
    conversions: boolean;
    communications: boolean;
    pipelineDealAge: boolean;
    revenue: boolean;
  };
}

interface SignalDefinition {
  id: DashboardSignalId;
  title: string;
  catalogDescription: string;
  source: DashboardSignalGroup;
  route: string;
  icon: LucideIcon;
  theme: StatTheme;
  resolve: (context: SignalContext) => Pick<
    DashboardSignal,
    'value' | 'compactValue' | 'supportingText' | 'timeframe' | 'status' | 'numericValue' | 'requiresAttention'
  >;
}

const number = (value: number | undefined) => (value ?? 0).toLocaleString();
const percent = (value: number | undefined) => `${(value ?? 0).toFixed(1)}%`;

const periodLabel = (period: string | undefined) => {
  if (!period) return undefined;
  return PAYMENT_PERIOD_LABELS[period as PaymentPeriod] ?? period;
};

const formatCurrency = (value: number, currency: string) => formatMoney(value, {
  locale: 'en-US',
  currency,
  maximumFractionDigits: 0,
});

const optionalStatus = (value: unknown, loading: boolean, failed: boolean): DashboardSignal['status'] => {
  if (value !== undefined && value !== null) return 'ready';
  if (loading) return 'loading';
  return failed ? 'unavailable' : 'ready';
};

const currencySummary = (
  entries: Array<{ currency: string; amount: number }>,
  emptySupportingText: string,
): Pick<DashboardSignal, 'value' | 'compactValue' | 'supportingText'> => {
  const active = entries.filter((entry) => entry.amount !== 0);
  if (active.length === 0) return { value: '$0', compactValue: '$0', supportingText: emptySupportingText };
  if (active.length === 1) {
    return {
      value: formatCurrency(active[0].amount, active[0].currency),
      compactValue: formatCompactMoney(active[0].amount, {
        locale: 'en-US',
        currency: active[0].currency,
        maximumFractionDigits: 1,
      }),
      supportingText: active[0].currency,
    };
  }
  return {
    value: active.length.toLocaleString(),
    supportingText: 'Currencies with activity',
  };
};

const pipelineValues = (pipelineDealAge?: PipelineDealAge) => {
  const byCurrency = new Map<string, number>();
  pipelineDealAge?.stages.forEach((stage) => {
    stage.openValueByCurrency.forEach(({ currency, amount }) => {
      byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amount);
    });
  });
  return Array.from(byCurrency, ([currency, amount]) => ({ currency, amount }));
};

const revenueValues = (
  revenue: RevenueFlow | undefined,
  selector: (summary: RevenueFlow['currencies'][number]['summary']) => number,
) => revenue?.currencies.map(({ currency, summary }) => ({
  currency,
  amount: selector(summary),
})) ?? [];

const definitions: SignalDefinition[] = [
  {
    id: 'contacts-total', title: 'Total contacts', source: 'Contacts', route: '/contacts', icon: Users, theme: 'blue',
    catalogDescription: 'The complete contact base in this organization.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.contacts.total), supportingText: `${number(analytics?.contacts.newThisMonth)} added this month`, timeframe: 'All time', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.contacts.total ?? 0 }),
  },
  {
    id: 'contacts-new-month', title: 'New contacts', source: 'Contacts', route: '/contacts', icon: UserPlus, theme: 'green',
    catalogDescription: 'Contacts added during the current month.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.contacts.newThisMonth), supportingText: `${number(analytics?.contacts.total)} total contacts`, timeframe: 'This month', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.contacts.newThisMonth ?? 0 }),
  },
  {
    id: 'contacts-active', title: 'Active contacts', source: 'Contacts', route: '/contacts', icon: Activity, theme: 'blue',
    catalogDescription: 'Contacts currently active and available for outreach.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.contacts.active), supportingText: `${number(analytics?.contacts.newThisMonth)} new this month`, timeframe: 'Current', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.contacts.active ?? 0 }),
  },
  {
    id: 'contacts-new-week', title: 'Contact intake', source: 'Contacts', route: '/contacts', icon: UserPlus, theme: 'blue',
    catalogDescription: 'Contacts added during the current week.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.contacts.newThisWeek), supportingText: `${number(analytics?.contacts.newThisMonth)} this month`, timeframe: 'This week', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.contacts.newThisWeek ?? 0 }),
  },
  {
    id: 'deals-open', title: 'Open deals', source: 'Pipelines', route: '/pipelines', icon: TrendingUp, theme: 'orange',
    catalogDescription: 'Deals still moving through every pipeline.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.deals.open), supportingText: `${number(analytics?.deals.total)} total · all pipelines`, timeframe: 'Current', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.deals.open ?? 0 }),
  },
  {
    id: 'pipeline-open-value', title: 'Open pipeline value', source: 'Pipelines', route: '/pipelines', icon: DollarSign, theme: 'orange',
    catalogDescription: 'The value currently held in open pipeline stages.',
    resolve: ({ pipelineDealAge, loading, errors }) => ({ ...currencySummary(pipelineValues(pipelineDealAge), 'No open pipeline value'), timeframe: 'Current', status: optionalStatus(pipelineDealAge, loading.pipelineDealAge, errors.pipelineDealAge), numericValue: pipelineDealAge?.summary.openDeals ?? 0 }),
  },
  {
    id: 'deals-won', title: 'Deals won', source: 'Pipelines', route: '/pipelines', icon: CheckCircle2, theme: 'green',
    catalogDescription: 'Won deals compared with lost outcomes.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.deals.won), supportingText: `${number(analytics?.deals.lost)} lost`, timeframe: 'All time', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.deals.won ?? 0 }),
  },
  {
    id: 'bookings-upcoming', title: 'Upcoming bookings', source: 'Scheduling', route: '/bookings', icon: CalendarDays, theme: 'orange',
    catalogDescription: 'Bookings approaching during the current week.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.bookings.upcomingThisWeek), supportingText: `${number(analytics?.bookings.upcomingToday)} today`, timeframe: 'This week', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.bookings.upcomingThisWeek ?? 0 }),
  },
  {
    id: 'bookings-today', title: "Today's bookings", source: 'Scheduling', route: '/bookings', icon: CalendarCheck, theme: 'orange',
    catalogDescription: 'Bookings requiring attention today.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.bookings.upcomingToday), supportingText: `${number(analytics?.bookings.upcomingThisWeek)} this week`, timeframe: 'Today', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.bookings.upcomingToday ?? 0 }),
  },
  {
    id: 'tasks-overdue', title: 'Overdue tasks', source: 'Workspace', route: '/canvas', icon: AlertCircle, theme: 'red',
    catalogDescription: 'Tasks past their due date and still unresolved.',
    resolve: ({ analytics, loading }) => { const value = analytics?.tasks.overdue ?? 0; return { value: number(value), supportingText: `${number(analytics?.tasks.pending)} pending`, timeframe: 'Current', status: loading.analytics ? 'loading' : 'ready', numericValue: value, requiresAttention: value > 0 }; },
  },
  {
    id: 'pipelines-configured', title: 'Pipelines', source: 'Pipelines', route: '/pipelines', icon: Workflow, theme: 'blue',
    catalogDescription: 'Sales pipelines configured for this organization.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.pipelines.total), supportingText: 'Configured', timeframe: 'Current', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.pipelines.total ?? 0 }),
  },
  {
    id: 'invoices-pending', title: 'Pending invoices', source: 'Sales & Payments', route: '/invoices', icon: Receipt, theme: 'orange',
    catalogDescription: 'Invoices still waiting to complete their lifecycle.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.invoiceMetrics?.pending), supportingText: `${number(analytics?.invoiceMetrics?.overdue)} overdue`, timeframe: 'Current', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.invoiceMetrics?.pending ?? 0 }),
  },
  {
    id: 'invoices-overdue', title: 'Overdue invoices', source: 'Sales & Payments', route: '/invoices', icon: AlertCircle, theme: 'red',
    catalogDescription: 'Invoices past due and requiring intervention.',
    resolve: ({ analytics, loading }) => { const value = analytics?.invoiceMetrics?.overdue ?? 0; return { value: number(value), supportingText: `$${(analytics?.invoiceMetrics?.paidThisMonth ?? 0).toLocaleString()} paid this month`, timeframe: 'Current', status: loading.analytics ? 'loading' : 'ready', numericValue: value, requiresAttention: value > 0 }; },
  },
  {
    id: 'invoices-paid-month', title: 'Invoice payments', source: 'Sales & Payments', route: '/invoices', icon: DollarSign, theme: 'green',
    catalogDescription: 'Invoice value paid during the current month.',
    resolve: ({ analytics, loading }) => {
      const value = analytics?.invoiceMetrics?.paidThisMonth ?? 0;
      return {
        value: formatCurrency(value, 'USD'),
        compactValue: formatCompactMoney(value, { locale: 'en-US', currency: 'USD', maximumFractionDigits: 1 }),
        supportingText: `${number(analytics?.invoiceMetrics?.countThisMonth)} invoices this month`,
        timeframe: 'This month',
        status: loading.analytics ? 'loading' : 'ready',
        numericValue: value,
      };
    },
  },
  {
    id: 'signatures-awaiting', title: 'Awaiting signatures', source: 'Documents', route: '/documents', icon: FileSignature, theme: 'orange',
    catalogDescription: 'Documents still waiting for recipient signatures.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.signatureMetrics?.awaiting), supportingText: `${number(analytics?.signatureMetrics?.signedThisWeek)} signed this week`, timeframe: 'Current', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.signatureMetrics?.awaiting ?? 0 }),
  },
  {
    id: 'signatures-signed-week', title: 'Completed signatures', source: 'Documents', route: '/documents', icon: FileSignature, theme: 'green',
    catalogDescription: 'Documents signed during the current week.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.signatureMetrics?.signedThisWeek), supportingText: `${number(analytics?.signatureMetrics?.total)} total documents`, timeframe: 'This week', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.signatureMetrics?.signedThisWeek ?? 0 }),
  },
  {
    id: 'workspace-active', title: 'Active workspace items', source: 'Workspace', route: '/canvas', icon: MapIcon, theme: 'blue',
    catalogDescription: 'Workspace material currently considered active.',
    resolve: ({ analytics, loading }) => ({ value: number(analytics?.workspaceMetrics?.activeItems), supportingText: `${number(analytics?.workspaceMetrics?.lists)} lists · ${number(analytics?.workspaceMetrics?.notes)} notes`, timeframe: 'Current', status: loading.analytics ? 'loading' : 'ready', numericValue: analytics?.workspaceMetrics?.activeItems ?? 0 }),
  },
  {
    id: 'revenue-net', title: 'Net received', source: 'Sales & Payments', route: '/invoices/payments', icon: CreditCard, theme: 'green',
    catalogDescription: 'Payments received after refunds for the selected performance period.',
    resolve: ({ revenue, loading, errors }) => ({ ...currencySummary(revenueValues(revenue, summary => summary.netReceived), 'No received payments'), timeframe: periodLabel(revenue?.period), status: optionalStatus(revenue, loading.revenue, errors.revenue) }),
  },
  {
    id: 'revenue-booked', title: 'Booked sales', source: 'Sales & Payments', route: '/invoices/payments', icon: DollarSign, theme: 'blue',
    catalogDescription: 'Sales booked during the selected performance period.',
    resolve: ({ revenue, loading, errors }) => ({ ...currencySummary(revenueValues(revenue, summary => summary.bookedSales), 'No booked sales'), timeframe: periodLabel(revenue?.period), status: optionalStatus(revenue, loading.revenue, errors.revenue) }),
  },
  {
    id: 'payment-failures', title: 'Payment failures', source: 'Sales & Payments', route: '/invoices/payments', icon: AlertCircle, theme: 'red',
    catalogDescription: 'Failed payment attempts requiring follow-up.',
    resolve: ({ revenue, loading, errors }) => { const value = revenue?.currencies.reduce((total, currency) => total + currency.summary.failedCount, 0) ?? 0; return { value: number(value), supportingText: value === 1 ? 'Failed payment' : 'Failed payments', timeframe: periodLabel(revenue?.period), status: optionalStatus(revenue, loading.revenue, errors.revenue), numericValue: value, requiresAttention: value > 0 }; },
  },
  {
    id: 'deal-win-rate', title: 'Deal win rate', source: 'Pipelines', route: '/pipelines', icon: Target, theme: 'blue',
    catalogDescription: 'Won deals as a share of all closed outcomes for the selected period.',
    resolve: ({ conversions, loading, errors }) => ({ value: percent(conversions?.dealWinRate.rate), supportingText: `${number(conversions?.dealWinRate.won)} of ${number(conversions?.dealWinRate.totalClosed)} closed`, timeframe: periodLabel(conversions?.period), status: optionalStatus(conversions, loading.conversions, errors.conversions) }),
  },
  {
    id: 'form-contact-rate', title: 'Form conversion', source: 'Contacts', route: '/forms', icon: MousePointerClick, theme: 'blue',
    catalogDescription: 'Form submissions that became contacts during the selected period.',
    resolve: ({ conversions, loading, errors }) => ({ value: percent(conversions?.formToContact.rate), supportingText: `${number(conversions?.formToContact.converted)} of ${number(conversions?.formToContact.submissions)} submissions`, timeframe: periodLabel(conversions?.period), status: optionalStatus(conversions, loading.conversions, errors.conversions) }),
  },
  {
    id: 'email-open-rate', title: 'Email open rate', source: 'Communications', route: '/inbox', icon: Mail, theme: 'blue',
    catalogDescription: 'Delivered emails opened during the selected performance period.',
    resolve: ({ communications, loading, errors }) => ({ value: percent(communications?.email.rates.open), supportingText: `${number(communications?.email.opened)} opened`, timeframe: periodLabel(communications?.period), status: optionalStatus(communications, loading.communications, errors.communications) }),
  },
  {
    id: 'email-failures', title: 'Email failures', source: 'Communications', route: '/inbox', icon: AlertCircle, theme: 'red',
    catalogDescription: 'Email deliveries that failed during the selected period.',
    resolve: ({ communications, loading, errors }) => { const value = communications?.email.failed ?? 0; return { value: number(value), supportingText: `${number(communications?.email.total)} total emails`, timeframe: periodLabel(communications?.period), status: optionalStatus(communications, loading.communications, errors.communications), numericValue: value, requiresAttention: value > 0 }; },
  },
  {
    id: 'sms-inbound', title: 'Inbound SMS', source: 'Communications', route: '/inbox', icon: MessageSquare, theme: 'blue',
    catalogDescription: 'SMS messages received during the selected performance period.',
    resolve: ({ communications, loading, errors }) => ({ value: number(communications?.sms.inbound), supportingText: `${number(communications?.sms.outbound)} outbound`, timeframe: periodLabel(communications?.period), status: optionalStatus(communications, loading.communications, errors.communications), numericValue: communications?.sms.inbound ?? 0 }),
  },
  {
    id: 'sms-failures', title: 'SMS failures', source: 'Communications', route: '/inbox', icon: AlertCircle, theme: 'red',
    catalogDescription: 'SMS deliveries that failed during the selected period.',
    resolve: ({ communications, loading, errors }) => { const value = communications?.sms.failed ?? 0; return { value: number(value), supportingText: `${number(communications?.sms.total)} total SMS`, timeframe: periodLabel(communications?.period), status: optionalStatus(communications, loading.communications, errors.communications), numericValue: value, requiresAttention: value > 0 }; },
  },
];

export interface BuildDashboardSignalsInput extends Omit<SignalContext, 'loading' | 'errors'> {
  loading?: Partial<SignalContext['loading']>;
  errors?: Partial<SignalContext['errors']>;
}

export function buildDashboardSignals({
  loading = {},
  errors = {},
  ...data
}: BuildDashboardSignalsInput): DashboardSignal[] {
  const context: SignalContext = {
    ...data,
    loading: {
      analytics: loading.analytics ?? false,
      conversions: loading.conversions ?? false,
      communications: loading.communications ?? false,
      pipelineDealAge: loading.pipelineDealAge ?? false,
      revenue: loading.revenue ?? false,
    },
    errors: {
      conversions: errors.conversions ?? false,
      communications: errors.communications ?? false,
      pipelineDealAge: errors.pipelineDealAge ?? false,
      revenue: errors.revenue ?? false,
    },
  };

  return definitions.map((definition) => {
    const resolved = definition.resolve(context);
    return {
      ...definition,
      ...resolved,
      compactValue: resolved.compactValue
        ?? (resolved.numericValue === undefined ? resolved.value : formatCompactNumber(resolved.numericValue)),
    };
  });
}

export function isDashboardSignalId(value: unknown): value is DashboardSignalId {
  return typeof value === 'string' && (DASHBOARD_SIGNAL_IDS as readonly string[]).includes(value);
}
