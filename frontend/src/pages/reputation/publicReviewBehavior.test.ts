import { describe, expect, it } from 'vitest';
import { safePublicReviewRedirect } from './publicReviewBehavior';

describe('public review browser behavior', () => {
  it('allows only absolute credential-free HTTP(S) redirects', () => {
    expect(safePublicReviewRedirect('https://example.com/review')).toBe(
      'https://example.com/review',
    );
    expect(safePublicReviewRedirect('javascript:alert(1)')).toBeNull();
    expect(safePublicReviewRedirect('//example.com/review')).toBeNull();
    expect(safePublicReviewRedirect('https://user:pass@example.com/review')).toBeNull();
  });
});
