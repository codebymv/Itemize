import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_PLANS_PATH,
  isAvailablePlansLocation,
} from './settingsNavigation';

describe('settings plan navigation', () => {
  it('uses a query deep link and recognizes both current and legacy locations', () => {
    expect(AVAILABLE_PLANS_PATH).toBe('/settings?section=plans');
    expect(isAvailablePlansLocation('?section=plans', '')).toBe(true);
    expect(isAvailablePlansLocation('', '#available-plans')).toBe(true);
    expect(isAvailablePlansLocation('', '')).toBe(false);
  });
});
