import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { MarkOnboardingSeenInput } from './onboarding.inputs';
import {
  OnboardingProgressDocument,
  OnboardingRepository,
  StoredOnboardingFeature,
} from './onboarding.repository';
import { OnboardingFeatureProgress } from './onboarding.types';

const FEATURE_KEY_PATTERN = /^[a-z][a-z0-9_-]*$/;

@Injectable()
export class OnboardingService {
  constructor(private readonly onboarding: OnboardingRepository) {}

  async progress(userId: number): Promise<OnboardingFeatureProgress[]> {
    return this.entries(await this.requireUser(this.onboarding.findProgress(userId)));
  }

  async feature(
    userId: number,
    rawFeatureKey: string,
  ): Promise<OnboardingFeatureProgress> {
    const featureKey = this.featureKey(rawFeatureKey);
    const progress = await this.requireUser(this.onboarding.findProgress(userId));
    return this.mapFeature(featureKey, progress[featureKey]);
  }

  async markSeen(
    userId: number,
    input: MarkOnboardingSeenInput,
  ): Promise<OnboardingFeatureProgress[]> {
    const featureKey = this.featureKey(input.featureKey);
    const version = this.version(input.version ?? '1.0');
    const progress = await this.requireUser(
      this.onboarding.markSeen(
        userId,
        featureKey,
        version,
        new Date().toISOString(),
      ),
    );
    return this.entries(progress);
  }

  async dismiss(
    userId: number,
    rawFeatureKey: string,
  ): Promise<OnboardingFeatureProgress[]> {
    const featureKey = this.featureKey(rawFeatureKey);
    return this.entries(
      await this.requireUser(this.onboarding.dismiss(userId, featureKey)),
    );
  }

  async completeStep(
    userId: number,
    rawFeatureKey: string,
    step: number,
  ): Promise<OnboardingFeatureProgress[]> {
    const featureKey = this.featureKey(rawFeatureKey);
    if (!Number.isSafeInteger(step) || step < 0) {
      throw itemizeGraphqlError(
        'Onboarding step must be a non-negative integer',
        'BAD_USER_INPUT',
        { field: 'step', reason: 'INVALID_ONBOARDING_STEP' },
      );
    }
    return this.entries(
      await this.requireUser(
        this.onboarding.completeStep(userId, featureKey, step),
      ),
    );
  }

  async reset(
    userId: number,
    rawFeatureKey?: string | null,
  ): Promise<OnboardingFeatureProgress[]> {
    const featureKey =
      rawFeatureKey == null ? undefined : this.featureKey(rawFeatureKey);
    return this.entries(
      await this.requireUser(this.onboarding.reset(userId, featureKey)),
    );
  }

  private async requireUser(
    progress: Promise<OnboardingProgressDocument | null>,
  ): Promise<OnboardingProgressDocument> {
    const resolved = await progress;
    if (!resolved) {
      throw itemizeGraphqlError('User not found', 'NOT_FOUND');
    }
    return resolved;
  }

  private entries(
    progress: OnboardingProgressDocument,
  ): OnboardingFeatureProgress[] {
    return Object.keys(progress)
      .sort((left, right) => left.localeCompare(right))
      .map((featureKey) => this.mapFeature(featureKey, progress[featureKey]));
  }

  private mapFeature(
    featureKey: string,
    value?: StoredOnboardingFeature,
  ): OnboardingFeatureProgress {
    const timestamp =
      typeof value?.timestamp === 'string' &&
      !Number.isNaN(Date.parse(value.timestamp))
        ? new Date(value.timestamp)
        : null;
    const step =
      typeof value?.step_completed === 'number' &&
      Number.isSafeInteger(value.step_completed) &&
      value.step_completed >= 0
        ? value.step_completed
        : null;
    return {
      featureKey,
      seen: value?.seen === true,
      timestamp,
      version: typeof value?.version === 'string' ? value.version : null,
      dismissed: value?.dismissed === true,
      stepCompleted: step,
    };
  }

  private featureKey(value: string): string {
    const featureKey = value?.trim();
    if (
      !featureKey ||
      featureKey.length > 50 ||
      !FEATURE_KEY_PATTERN.test(featureKey)
    ) {
      throw itemizeGraphqlError(
        'Onboarding feature key is invalid',
        'BAD_USER_INPUT',
        { field: 'featureKey', reason: 'INVALID_ONBOARDING_FEATURE' },
      );
    }
    return featureKey;
  }

  private version(value: string): string {
    const version = value?.trim();
    if (!version || version.length > 10) {
      throw itemizeGraphqlError(
        'Onboarding version must contain between 1 and 10 characters',
        'BAD_USER_INPUT',
        { field: 'version', reason: 'INVALID_ONBOARDING_VERSION' },
      );
    }
    return version;
  }
}
