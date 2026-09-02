import { formCreationFingerprint } from './form-creation.idempotency';

describe('form creation fingerprints', () => {
  it('canonicalizes nested object key order', () => {
    expect(
      formCreationFingerprint('create', {
        name: 'Intake',
        theme: { secondary: '#fff', primary: '#000' },
      }),
    ).toBe(
      formCreationFingerprint('create', {
        theme: { primary: '#000', secondary: '#fff' },
        name: 'Intake',
      }),
    );
  });

  it('separates actions and source forms', () => {
    expect(formCreationFingerprint('duplicate', { sourceFormId: 7 })).not.toBe(
      formCreationFingerprint('duplicate', { sourceFormId: 8 }),
    );
    expect(formCreationFingerprint('duplicate', { sourceFormId: 7 })).not.toBe(
      formCreationFingerprint('create', { sourceFormId: 7 }),
    );
  });
});
