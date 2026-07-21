import { redactWorkflowSideEffectError } from './workflow-side-effect-jobs.repository';

describe('workflow side-effect repository utilities', () => {
  it('redacts destinations, credentials, signatures, and provider secrets', () => {
    expect(redactWorkflowSideEffectError(new Error(
      'person@example.test +16025550101 Bearer abc.def sk_live_secret sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa https://private.example/path',
    ))).toBe('[redacted-email] [redacted-phone] [redacted-authorization] [redacted-secret] [redacted-signature] [redacted-url]');
  });
});
