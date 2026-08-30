import { describe, expect, it } from 'vitest';
import { getProductStatusVisual } from './productConstants';

describe('product status visuals', () => {
  it('describes catalog eligibility as available or unavailable', () => {
    expect(getProductStatusVisual(true).theme).toBe('blue');
    expect(getProductStatusVisual(true).label).toBe('Available');
    expect(getProductStatusVisual(false).theme).toBe('orange');
    expect(getProductStatusVisual(false).label).toBe('Unavailable');
  });
});
