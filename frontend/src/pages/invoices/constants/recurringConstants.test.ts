import { describe, expect, it } from 'vitest';
import { getRecurringStatusVisual } from './recurringConstants';

describe('recurring status visuals', () => {
  it('uses operational blue for a running schedule', () => {
    const active = getRecurringStatusVisual('active');

    expect(active.label).toBe('Active');
    expect(active.theme).toBe('blue');
    expect(active.iconClass).toContain('text-blue-600');
  });

  it('keeps paused schedules in the orange attention family', () => {
    expect(getRecurringStatusVisual('paused').theme).toBe('orange');
  });

  it('reserves success green for completed schedules', () => {
    expect(getRecurringStatusVisual('completed').theme).toBe('green');
  });
});
