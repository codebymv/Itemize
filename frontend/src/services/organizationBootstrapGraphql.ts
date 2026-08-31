import type { BillingStatus } from './billingApi';
import {
  billingStatusFields,
  mapBillingStatus,
  type GraphqlBillingStatus,
} from './billingGraphql';
import {
  getStartedProgressFields,
  type GetStartedProgress,
} from './getStartedGraphql';
import { GraphqlRequestError, graphqlRequest } from './graphqlClient';
import {
  mapOnboardingProgress,
  onboardingProgressFields,
  type GraphqlOnboardingFeatureProgress,
} from './onboardingGraphql';
import type { OnboardingProgress } from './onboardingService';

export interface OrganizationBootstrap {
  billingStatus: BillingStatus;
  onboardingProgress: OnboardingProgress;
  getStartedProgress: GetStartedProgress;
}

export const organizationBootstrapQueryKey = (
  organizationId: number | null | undefined,
) => ['organization-bootstrap', organizationId] as const;

const organizationBootstrapQuery = `
  query OrganizationBootstrap {
    billingStatus { ${billingStatusFields} }
    onboardingProgress { ${onboardingProgressFields} }
    getStartedProgress { ${getStartedProgressFields} }
  }
`;

const billingStatusQuery = `
  query BootstrapBillingStatus {
    billingStatus { ${billingStatusFields} }
  }
`;

const onboardingProgressQuery = `
  query BootstrapOnboardingProgress {
    onboardingProgress { ${onboardingProgressFields} }
  }
`;

const getStartedProgressQuery = `
  query BootstrapGetStartedProgress {
    getStartedProgress { ${getStartedProgressFields} }
  }
`;

let bootstrapCapability: 'unknown' | 'aggregate' | 'separate' = 'unknown';

const mapBootstrap = (data: {
  billingStatus: GraphqlBillingStatus;
  onboardingProgress: GraphqlOnboardingFeatureProgress[];
  getStartedProgress: GetStartedProgress;
}): OrganizationBootstrap => ({
  billingStatus: mapBillingStatus(data.billingStatus),
  onboardingProgress: mapOnboardingProgress(data.onboardingProgress),
  getStartedProgress: data.getStartedProgress,
});

const getSeparateBootstrap = async (
  organizationId: number,
  signal?: AbortSignal,
): Promise<OrganizationBootstrap> => {
  const [billing, onboarding, getStarted] = await Promise.all([
    graphqlRequest<
      { billingStatus: GraphqlBillingStatus },
      Record<string, never>
    >(billingStatusQuery, {}, organizationId, signal),
    graphqlRequest<
      { onboardingProgress: GraphqlOnboardingFeatureProgress[] },
      Record<string, never>
    >(onboardingProgressQuery, {}, organizationId, signal),
    graphqlRequest<
      { getStartedProgress: GetStartedProgress },
      Record<string, never>
    >(getStartedProgressQuery, {}, organizationId, signal),
  ]);

  return mapBootstrap({
    billingStatus: billing.billingStatus,
    onboardingProgress: onboarding.onboardingProgress,
    getStartedProgress: getStarted.getStartedProgress,
  });
};

const isAggregateUnsupported = (error: unknown): boolean => (
  error instanceof GraphqlRequestError
  && (
    error.status === 400
    || error.code === 'GRAPHQL_VALIDATION_FAILED'
    || /cannot query field|unknown field/i.test(error.message)
  )
);

/** Test-only reset for the process-local schema capability memory. */
export const resetOrganizationBootstrapCapability = () => {
  bootstrapCapability = 'unknown';
};

export const getOrganizationBootstrapViaGraphql = async (
  organizationId: number,
  signal?: AbortSignal,
): Promise<OrganizationBootstrap> => {
  if (bootstrapCapability === 'separate') {
    return getSeparateBootstrap(organizationId, signal);
  }

  try {
    const data = await graphqlRequest<
      {
        billingStatus: GraphqlBillingStatus;
        onboardingProgress: GraphqlOnboardingFeatureProgress[];
        getStartedProgress: GetStartedProgress;
      },
      Record<string, never>
    >(organizationBootstrapQuery, {}, organizationId, signal);
    bootstrapCapability = 'aggregate';
    return mapBootstrap(data);
  } catch (error) {
    if (!isAggregateUnsupported(error)) throw error;
    bootstrapCapability = 'separate';
    return getSeparateBootstrap(organizationId, signal);
  }
};
