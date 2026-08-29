import { describe, expect, it } from 'vitest';
import { getProductStatusVisual } from './productConstants';

describe('product status visuals', () => {
  it('uses blue for active and orange for inactive products', () => {
    expect(getProductStatusVisual(true).theme).toBe('blue');
    expect(getProductStatusVisual(false).theme).toBe('orange');
  });
});
