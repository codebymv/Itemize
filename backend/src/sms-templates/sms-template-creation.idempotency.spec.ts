import { smsTemplateCreationFingerprint } from './sms-template-creation.idempotency';

describe('smsTemplateCreationFingerprint', () => {
  it('canonicalizes creation values', () => {
    expect(smsTemplateCreationFingerprint('create', {
      content: { message: 'Hello', metadata: { source: 'automation', locale: 'en' } },
    })).toBe(smsTemplateCreationFingerprint('create', {
      content: { metadata: { locale: 'en', source: 'automation' }, message: 'Hello' },
    }));
  });

  it('separates actions and duplicate sources', () => {
    expect(smsTemplateCreationFingerprint('create', { sourceTemplateId: 9 }))
      .not.toBe(smsTemplateCreationFingerprint('duplicate', { sourceTemplateId: 9 }));
    expect(smsTemplateCreationFingerprint('duplicate', { sourceTemplateId: 9 }))
      .not.toBe(smsTemplateCreationFingerprint('duplicate', { sourceTemplateId: 10 }));
  });
});
