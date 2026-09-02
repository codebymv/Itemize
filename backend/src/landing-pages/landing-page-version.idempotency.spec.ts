import { landingPageVersionMutationFingerprint } from './landing-page-version.idempotency';

describe('landing-page version mutation fingerprints', () => {
  it('is stable for the same normalized request', () => {
    expect(
      landingPageVersionMutationFingerprint('create', {
        description: 'Snapshot',
      }),
    ).toBe(
      landingPageVersionMutationFingerprint('create', {
        description: 'Snapshot',
      }),
    );
  });

  it('separates actions and changed targets', () => {
    const created = landingPageVersionMutationFingerprint('create', {
      description: 'Snapshot',
    });
    expect(
      landingPageVersionMutationFingerprint('create', {
        description: 'Changed',
      }),
    ).not.toBe(created);
    expect(
      landingPageVersionMutationFingerprint('restore', { versionId: 31 }),
    ).not.toBe(
      landingPageVersionMutationFingerprint('publish', { versionId: 31 }),
    );
  });
});
