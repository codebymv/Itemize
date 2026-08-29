import { legacyPublicFormPath, publicFormPath } from './publicContentRoutes';

describe('public content routes', () => {
  it('builds the canonical short form route safely', () => {
    expect(publicFormPath('frm_a/b c')).toBe('/f/frm_a%2Fb%20c');
  });

  it('retains an explicit builder for legacy redirects', () => {
    expect(legacyPublicFormPath('frm_123')).toBe('/form/frm_123');
  });
});
