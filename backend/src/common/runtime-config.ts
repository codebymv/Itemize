import { Injectable, OnApplicationBootstrap } from '@nestjs/common';

const BOOLEAN_KEYS = [
  'DATABASE_SSL',
  'ADMIN_EMAIL_DELIVERY_SCHEDULER_ENABLED',
  'CALENDAR_SYNC_JOBS_ENABLED',
  'CALENDAR_SYNC_NEST_JOBS_ENABLED',
  'EMAIL_WEBHOOK_NEST_JOBS_ENABLED',
  'ESTIMATE_EMAIL_DELIVERY_SCHEDULER_ENABLED',
  'INVOICE_NEST_JOBS_ENABLED',
  'LEGACY_INVOICE_JOBS_ENABLED',
  'LEGACY_SIGNATURE_REMINDER_JOBS_ENABLED',
  'MESSAGE_DELIVERY_SCHEDULER_ENABLED',
  'REALTIME_HOST_NESTJS_ENABLED',
  'REPUTATION_REQUEST_DELIVERY_SCHEDULER_ENABLED',
  'SIGNATURE_FILE_CLEANUP_ENABLED',
  'SIGNATURE_FILE_CLEANUP_NEST_ENABLED',
  'SIGNATURE_JOBS_SCHEDULER_ENABLED',
  'SOCIAL_MESSAGE_DELIVERY_SCHEDULER_ENABLED',
  'SOCIAL_WEBHOOK_JOBS_ENABLED',
  'SOCIAL_WEBHOOK_NEST_JOBS_ENABLED',
  'SUBSCRIPTION_WEBHOOK_JOBS_ENABLED',
  'SUBSCRIPTION_WEBHOOK_NEST_JOBS_ENABLED',
  'TRIAL_REMINDER_CRON_ENABLED',
  'TRIAL_REMINDER_NEST_JOBS_ENABLED',
  'WORKFLOW_NEST_SCHEDULER_ENABLED',
] as const;

type BooleanKey = (typeof BOOLEAN_KEYS)[number];

const CONFLICTING_OWNERS: ReadonlyArray<readonly [BooleanKey, BooleanKey]> = [
  ['CALENDAR_SYNC_NEST_JOBS_ENABLED', 'CALENDAR_SYNC_JOBS_ENABLED'],
  ['INVOICE_NEST_JOBS_ENABLED', 'LEGACY_INVOICE_JOBS_ENABLED'],
  ['SIGNATURE_FILE_CLEANUP_NEST_ENABLED', 'SIGNATURE_FILE_CLEANUP_ENABLED'],
  ['SIGNATURE_JOBS_SCHEDULER_ENABLED', 'LEGACY_SIGNATURE_REMINDER_JOBS_ENABLED'],
  ['SOCIAL_WEBHOOK_NEST_JOBS_ENABLED', 'SOCIAL_WEBHOOK_JOBS_ENABLED'],
  ['SUBSCRIPTION_WEBHOOK_NEST_JOBS_ENABLED', 'SUBSCRIPTION_WEBHOOK_JOBS_ENABLED'],
  ['TRIAL_REMINDER_NEST_JOBS_ENABLED', 'TRIAL_REMINDER_CRON_ENABLED'],
];

const present = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

export function booleanEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  key: BooleanKey,
  fallback = false,
): boolean {
  const value = present(environment[key]);
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} must be either "true" or "false"`);
}

export function integerEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = present(environment[key]);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${key} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

export function validateRuntimeEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  for (const key of BOOLEAN_KEYS) {
    booleanEnvironmentValue(environment, key);
  }

  integerEnvironmentValue(environment, 'PORT', 3100, 1, 65_535);
  integerEnvironmentValue(environment, 'DATABASE_POOL_MAX', 10, 1, 100);

  if (environment.NODE_ENV === 'production') {
    for (const key of ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL'] as const) {
      if (!present(environment[key])) throw new Error(`${key} is required in production`);
    }
    if ((environment.JWT_SECRET?.trim().length ?? 0) < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
    const frontendUrl = new URL(environment.FRONTEND_URL as string);
    if (frontendUrl.protocol !== 'https:') {
      throw new Error('FRONTEND_URL must use HTTPS in production');
    }
  }

  for (const [nestjsFlag, legacyFlag] of CONFLICTING_OWNERS) {
    if (
      booleanEnvironmentValue(environment, nestjsFlag) &&
      booleanEnvironmentValue(environment, legacyFlag)
    ) {
      throw new Error(
        `${nestjsFlag} and ${legacyFlag} cannot both be true in one runtime`,
      );
    }
  }

  if (
    booleanEnvironmentValue(environment, 'SOCIAL_WEBHOOK_NEST_JOBS_ENABLED') &&
    !booleanEnvironmentValue(environment, 'REALTIME_HOST_NESTJS_ENABLED')
  ) {
    throw new Error(
      'SOCIAL_WEBHOOK_NEST_JOBS_ENABLED requires REALTIME_HOST_NESTJS_ENABLED=true',
    );
  }
}

@Injectable()
export class RuntimeConfigValidationService implements OnApplicationBootstrap {
  onApplicationBootstrap(): void {
    validateRuntimeEnvironment();
  }
}
