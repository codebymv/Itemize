import {
  publicSigningDeclineFingerprint,
  publicSigningSubmissionFingerprint,
} from './public-signing.idempotency';
import { SIGNATURE_CONSENT_VERSION } from './signature-consent';

describe('public signing idempotency fingerprints', () => {
  it('treats field order as semantically irrelevant', () => {
    const consent = { agreed: true as const, version: SIGNATURE_CONSENT_VERSION };
    expect(publicSigningSubmissionFingerprint({
      fields: [{ id: 2, value: 'B' }, { id: 1, value: 'A' }],
      consent,
    })).toBe(publicSigningSubmissionFingerprint({
      fields: [{ id: 1, value: 'A' }, { id: 2, value: 'B' }],
      consent,
    }));
  });

  it('separates changed signing and decline responses', () => {
    const consent = { agreed: true as const, version: SIGNATURE_CONSENT_VERSION };
    expect(publicSigningSubmissionFingerprint({
      fields: [{ id: 1, value: 'A' }],
      consent,
    })).not.toBe(publicSigningSubmissionFingerprint({
      fields: [{ id: 1, value: 'B' }],
      consent,
    }));
    expect(publicSigningDeclineFingerprint(null))
      .not.toBe(publicSigningDeclineFingerprint('Not approved'));
  });
});
