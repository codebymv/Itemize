import { createHash } from 'crypto';

export type LandingPageVersionMutationAction =
  | 'create'
  | 'publish'
  | 'restore';

const fingerprint = (value: Record<string, unknown>): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const landingPageVersionMutationFingerprint = (
  action: LandingPageVersionMutationAction,
  values: { description?: string | null; versionId?: number },
): string =>
  fingerprint({
    action,
    description: values.description ?? null,
    versionId: values.versionId ?? null,
  });
