import { emailTemplateCreationFingerprint } from './email-template-creation.idempotency';

describe('emailTemplateCreationFingerprint', () => {
  it('canonicalizes nested creation values', () => {
    expect(emailTemplateCreationFingerprint('create', {
      content: { subject: 'Hello', metadata: { source: 'campaign', locale: 'en' } },
      variables: ['first_name', 'company'],
    })).toBe(emailTemplateCreationFingerprint('create', {
      variables: ['first_name', 'company'],
      content: { metadata: { locale: 'en', source: 'campaign' }, subject: 'Hello' },
    }));
  });

  it('separates actions and duplicate sources', () => {
    expect(emailTemplateCreationFingerprint('create', { name: 'Welcome' }))
      .not.toBe(emailTemplateCreationFingerprint('create_draft', { name: 'Welcome' }));
    expect(emailTemplateCreationFingerprint('duplicate', { sourceTemplateId: 9 }))
      .not.toBe(emailTemplateCreationFingerprint('duplicate', { sourceTemplateId: 10 }));
  });
});
