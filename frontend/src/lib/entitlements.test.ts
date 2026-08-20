import { describe, expect, it } from 'vitest';
import { authenticatedHomePath, hasPlanAccess } from './entitlements';

describe('plan access', () => {
  it('keeps Free and inactive organizations in the workspace', () => {
    expect(hasPlanAccess(false, 0, 'starter')).toBe(false);
    expect(hasPlanAccess(false, 2, 'starter')).toBe(false);
    expect(authenticatedHomePath(false)).toBe('/canvas');
  });

  it('allows a live subscription at or above the required tier', () => {
    expect(hasPlanAccess(true, 1, 'starter')).toBe(true);
    expect(hasPlanAccess(true, 1, 'unlimited')).toBe(false);
    expect(hasPlanAccess(true, 2, 'unlimited')).toBe(true);
    expect(authenticatedHomePath(true)).toBe('/dashboard');
  });
});
