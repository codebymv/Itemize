import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { MarkOnboardingSeenInput } from './onboarding.inputs';
import { OnboardingService } from './onboarding.service';
import { OnboardingFeatureProgress } from './onboarding.types';

@Resolver(() => OnboardingFeatureProgress)
export class OnboardingResolver {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Query(() => [OnboardingFeatureProgress])
  onboardingProgress(): Promise<OnboardingFeatureProgress[]> {
    return this.onboarding.progress(this.userId());
  }

  @Query(() => OnboardingFeatureProgress)
  onboardingFeatureProgress(
    @Args('featureKey') featureKey: string,
  ): Promise<OnboardingFeatureProgress> {
    return this.onboarding.feature(this.userId(), featureKey);
  }

  @CsrfProtected()
  @Mutation(() => [OnboardingFeatureProgress])
  markOnboardingSeen(
    @Args('input') input: MarkOnboardingSeenInput,
  ): Promise<OnboardingFeatureProgress[]> {
    return this.onboarding.markSeen(this.userId(), input);
  }

  @CsrfProtected()
  @Mutation(() => [OnboardingFeatureProgress])
  dismissOnboarding(
    @Args('featureKey') featureKey: string,
  ): Promise<OnboardingFeatureProgress[]> {
    return this.onboarding.dismiss(this.userId(), featureKey);
  }

  @CsrfProtected()
  @Mutation(() => [OnboardingFeatureProgress])
  completeOnboardingStep(
    @Args('featureKey') featureKey: string,
    @Args('step', { type: () => Int }) step: number,
  ): Promise<OnboardingFeatureProgress[]> {
    return this.onboarding.completeStep(this.userId(), featureKey, step);
  }

  @CsrfProtected()
  @Mutation(() => [OnboardingFeatureProgress])
  resetOnboarding(
    @Args('featureKey', { type: () => String, nullable: true })
    featureKey?: string | null,
  ): Promise<OnboardingFeatureProgress[]> {
    return this.onboarding.reset(this.userId(), featureKey);
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return identity.userId;
  }
}
