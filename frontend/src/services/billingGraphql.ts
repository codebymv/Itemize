import type { Plan } from '@/lib/subscription';
import {
  graphqlMutationRequest,
  graphqlPublicRequest,
  graphqlRequest,
} from './graphqlClient';
import type {
  BillingStatus,
  PlanInfo,
  UsageStats,
} from './billingApi';

type GraphqlBillingStatus = {
  plan: Plan;
  subscriptionStatus: string;
  billingPeriod: 'monthly' | 'yearly';
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  emailsUsed: number;
  emailsLimit: number;
  smsUsed: number;
  smsLimit: number;
  apiCallsUsed: number;
  apiCallsLimit: number;
  contactsLimit: number;
  usersLimit: number;
  workflowsLimit: number;
  landingPagesLimit: number;
  formsLimit: number;
  calendarsLimit: number;
  trialEndsAt: string | null;
  trialEndAcknowledgedAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
};

type GraphqlUsageStats = {
  period: { start: string | null; end: string | null };
  usage: {
    emails: { used: number; limit: number; percentage: number };
    sms: { used: number; limit: number; percentage: number };
    apiCalls: { used: number; limit: number; percentage: number };
  };
  resources: {
    contacts: number;
    workflows: number;
    forms: number;
    landingPages: number;
  };
};

const statusFields = `
  plan subscriptionStatus billingPeriod billingPeriodStart billingPeriodEnd
  stripeCustomerId stripeSubscriptionId emailsUsed emailsLimit smsUsed smsLimit
  apiCallsUsed apiCallsLimit contactsLimit usersLimit workflowsLimit
  landingPagesLimit formsLimit calendarsLimit trialEndsAt
  trialEndAcknowledgedAt cancelAtPeriodEnd canceledAt
`;

const billingStatusQuery = `
  query BillingStatus {
    billingStatus { ${statusFields} }
  }
`;

const billingPlansQuery = `
  query BillingPlans {
    billingPlans {
      id name displayName tagline description icon color bgColor borderColor
      popular tier
      pricing { monthly yearly yearlyMonthly }
      limits {
        organizations contacts users workflows emails sms landingPages forms
        calendars apiCalls storage
      }
    }
  }
`;

const billingUsageQuery = `
  query BillingUsage {
    billingUsage {
      period { start end }
      usage {
        emails { used limit percentage }
        sms { used limit percentage }
        apiCalls { used limit percentage }
      }
      resources { contacts workflows forms landingPages }
    }
  }
`;

const checkoutMutation = `
  mutation CreateBillingCheckoutSession($input: CreateBillingCheckoutInput!) {
    createBillingCheckoutSession(input: $input) { url }
  }
`;

const portalMutation = `
  mutation CreateBillingPortalSession($input: CreateBillingPortalInput!) {
    createBillingPortalSession(input: $input) { url }
  }
`;

const acknowledgeMutation = `
  mutation AcknowledgeBillingTrialEnd {
    acknowledgeBillingTrialEnd { acknowledged }
  }
`;

const startSoloTrialMutation = `
  mutation StartBillingSoloTrial {
    startBillingSoloTrial { ${statusFields} }
  }
`;

const mapStatus = (status: GraphqlBillingStatus): BillingStatus => ({
  plan: status.plan,
  subscription_status: status.subscriptionStatus,
  billing_period: status.billingPeriod,
  billing_period_start: status.billingPeriodStart,
  billing_period_end: status.billingPeriodEnd,
  stripe_customer_id: status.stripeCustomerId,
  stripe_subscription_id: status.stripeSubscriptionId,
  emails_used: status.emailsUsed,
  emails_limit: status.emailsLimit,
  sms_used: status.smsUsed,
  sms_limit: status.smsLimit,
  api_calls_used: status.apiCallsUsed,
  api_calls_limit: status.apiCallsLimit,
  contacts_limit: status.contactsLimit,
  users_limit: status.usersLimit,
  workflows_limit: status.workflowsLimit,
  landing_pages_limit: status.landingPagesLimit,
  forms_limit: status.formsLimit,
  calendars_limit: status.calendarsLimit,
  trial_ends_at: status.trialEndsAt,
  trial_end_acknowledged_at: status.trialEndAcknowledgedAt,
  cancel_at_period_end: status.cancelAtPeriodEnd,
  canceled_at: status.canceledAt,
});

const usageLimit = (limit: number): number | 'unlimited' =>
  limit === -1 ? 'unlimited' : limit;

export const getBillingStatusViaGraphql = async (): Promise<BillingStatus> => {
  const response = await graphqlRequest<
    { billingStatus: GraphqlBillingStatus },
    Record<string, never>
  >(billingStatusQuery, {});
  return mapStatus(response.billingStatus);
};

export const getBillingPlansViaGraphql = async (): Promise<PlanInfo[]> => {
  const response = await graphqlPublicRequest<
    { billingPlans: PlanInfo[] },
    Record<string, never>
  >(billingPlansQuery, {});
  return response.billingPlans;
};

export const getBillingUsageViaGraphql = async (): Promise<UsageStats> => {
  const response = await graphqlRequest<
    { billingUsage: GraphqlUsageStats },
    Record<string, never>
  >(billingUsageQuery, {});
  const value = response.billingUsage;
  return {
    ...value,
    usage: {
      emails: {
        ...value.usage.emails,
        limit: usageLimit(value.usage.emails.limit),
      },
      sms: {
        ...value.usage.sms,
        limit: usageLimit(value.usage.sms.limit),
      },
      apiCalls: {
        ...value.usage.apiCalls,
        limit: usageLimit(value.usage.apiCalls.limit),
      },
    },
  };
};

export const createBillingCheckoutViaGraphql = async (input: {
  planId?: Plan;
  priceId?: string;
  billingPeriod?: 'monthly' | 'yearly';
  mode?: 'subscription' | 'payment';
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> => {
  const graphqlInput = {
    ...input,
    idempotencyKey: crypto.randomUUID(),
  };
  const response = await graphqlMutationRequest<
    { createBillingCheckoutSession: { url: string } },
    { input: typeof graphqlInput }
  >(checkoutMutation, { input: graphqlInput });
  return response.createBillingCheckoutSession;
};

export const createBillingPortalViaGraphql = async (
  returnUrl: string,
): Promise<{ url: string }> => {
  const input = { returnUrl, idempotencyKey: crypto.randomUUID() };
  const response = await graphqlMutationRequest<
    { createBillingPortalSession: { url: string } },
    { input: typeof input }
  >(portalMutation, { input });
  return response.createBillingPortalSession;
};

export const acknowledgeBillingTrialEndViaGraphql = async (): Promise<{
  acknowledged: boolean;
}> => {
  const response = await graphqlMutationRequest<
    { acknowledgeBillingTrialEnd: { acknowledged: boolean } },
    Record<string, never>
  >(acknowledgeMutation, {});
  return response.acknowledgeBillingTrialEnd;
};

export const startBillingSoloTrialViaGraphql = async (): Promise<BillingStatus> => {
  const response = await graphqlMutationRequest<
    { startBillingSoloTrial: GraphqlBillingStatus },
    Record<string, never>
  >(startSoloTrialMutation, {});
  return mapStatus(response.startBillingSoloTrial);
};
