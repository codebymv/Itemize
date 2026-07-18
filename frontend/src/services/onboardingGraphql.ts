import type {
  OnboardingFeatureProgress,
  OnboardingProgress,
} from './onboardingService';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlOnboardingFeatureProgress = {
  featureKey: string;
  seen: boolean;
  timestamp: string | null;
  version: string | null;
  dismissed: boolean;
  stepCompleted: number | null;
};

const progressFields =
  'featureKey seen timestamp version dismissed stepCompleted';

const progressQuery = `
  query OnboardingProgress {
    onboardingProgress { ${progressFields} }
  }
`;

const featureQuery = `
  query OnboardingFeatureProgress($featureKey: String!) {
    onboardingFeatureProgress(featureKey: $featureKey) { ${progressFields} }
  }
`;

const markSeenMutation = `
  mutation MarkOnboardingSeen($input: MarkOnboardingSeenInput!) {
    markOnboardingSeen(input: $input) { ${progressFields} }
  }
`;

const dismissMutation = `
  mutation DismissOnboarding($featureKey: String!) {
    dismissOnboarding(featureKey: $featureKey) { ${progressFields} }
  }
`;

const completeStepMutation = `
  mutation CompleteOnboardingStep($featureKey: String!, $step: Int!) {
    completeOnboardingStep(featureKey: $featureKey, step: $step) {
      ${progressFields}
    }
  }
`;

const resetMutation = `
  mutation ResetOnboarding($featureKey: String) {
    resetOnboarding(featureKey: $featureKey) { ${progressFields} }
  }
`;

const mapFeature = (
  feature: GraphqlOnboardingFeatureProgress,
): OnboardingFeatureProgress => ({
  seen: feature.seen,
  dismissed: feature.dismissed,
  ...(feature.timestamp === null ? {} : { timestamp: feature.timestamp }),
  ...(feature.version === null ? {} : { version: feature.version }),
  ...(feature.stepCompleted === null
    ? {}
    : { step_completed: feature.stepCompleted }),
});

const mapProgress = (
  entries: GraphqlOnboardingFeatureProgress[],
): OnboardingProgress =>
  Object.fromEntries(
    entries.map((entry) => [entry.featureKey, mapFeature(entry)]),
  );

export const getOnboardingProgressViaGraphql =
  async (): Promise<OnboardingProgress> => {
    const data = await graphqlRequest<
      { onboardingProgress: GraphqlOnboardingFeatureProgress[] },
      Record<string, never>
    >(progressQuery, {});
    return mapProgress(data.onboardingProgress);
  };

export const getOnboardingFeatureProgressViaGraphql = async (
  featureKey: string,
): Promise<OnboardingFeatureProgress> => {
  const data = await graphqlRequest<
    { onboardingFeatureProgress: GraphqlOnboardingFeatureProgress },
    { featureKey: string }
  >(featureQuery, { featureKey });
  return mapFeature(data.onboardingFeatureProgress);
};

export const markOnboardingSeenViaGraphql = async (
  featureKey: string,
  version: string,
): Promise<OnboardingProgress> => {
  const data = await graphqlMutationRequest<
    { markOnboardingSeen: GraphqlOnboardingFeatureProgress[] },
    { input: { featureKey: string; version: string } }
  >(markSeenMutation, { input: { featureKey, version } });
  return mapProgress(data.markOnboardingSeen);
};

export const dismissOnboardingViaGraphql = async (
  featureKey: string,
): Promise<OnboardingProgress> => {
  const data = await graphqlMutationRequest<
    { dismissOnboarding: GraphqlOnboardingFeatureProgress[] },
    { featureKey: string }
  >(dismissMutation, { featureKey });
  return mapProgress(data.dismissOnboarding);
};

export const completeOnboardingStepViaGraphql = async (
  featureKey: string,
  step: number,
): Promise<OnboardingProgress> => {
  const data = await graphqlMutationRequest<
    { completeOnboardingStep: GraphqlOnboardingFeatureProgress[] },
    { featureKey: string; step: number }
  >(completeStepMutation, { featureKey, step });
  return mapProgress(data.completeOnboardingStep);
};

export const resetOnboardingViaGraphql = async (
  featureKey?: string,
): Promise<OnboardingProgress> => {
  const data = await graphqlMutationRequest<
    { resetOnboarding: GraphqlOnboardingFeatureProgress[] },
    { featureKey: string | null }
  >(resetMutation, { featureKey: featureKey ?? null });
  return mapProgress(data.resetOnboarding);
};
