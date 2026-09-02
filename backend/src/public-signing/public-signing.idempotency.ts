import { createHash } from 'node:crypto';
import { PublicSigningSubmission } from './public-signing.validation';

const fingerprint = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const publicSigningSubmissionFingerprint = (
  submission: PublicSigningSubmission,
): string => fingerprint({
  action: 'signed',
  consent: submission.consent,
  fields: [...submission.fields]
    .sort((left, right) => left.id - right.id)
    .map(({ id, value }) => ({ id, value })),
});

export const publicSigningDeclineFingerprint = (
  reason: string | null,
): string => fingerprint({ action: 'declined', reason });
