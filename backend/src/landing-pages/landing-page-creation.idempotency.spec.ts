import { landingPageCreationFingerprint } from './landing-page-creation.idempotency';

describe('landingPageCreationFingerprint', () => {
  it('canonicalizes nested page settings and section content', () => {
    expect(landingPageCreationFingerprint('create', {
      theme: { textColor: '#111', colors: { secondary: '#222', primary: '#333' } },
      sections: [{ content: { body: 'Body', heading: 'Hello' }, sectionType: 'hero' }],
    })).toBe(landingPageCreationFingerprint('create', {
      sections: [{ sectionType: 'hero', content: { heading: 'Hello', body: 'Body' } }],
      theme: { colors: { primary: '#333', secondary: '#222' }, textColor: '#111' },
    }));
  });

  it('separates actions and duplicate sources', () => {
    expect(landingPageCreationFingerprint('create', { sourcePageId: 9 }))
      .not.toBe(landingPageCreationFingerprint('duplicate', { sourcePageId: 9 }));
    expect(landingPageCreationFingerprint('duplicate', { sourcePageId: 9 }))
      .not.toBe(landingPageCreationFingerprint('duplicate', { sourcePageId: 10 }));
  });
});
