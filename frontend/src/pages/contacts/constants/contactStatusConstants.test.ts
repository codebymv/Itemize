import { describe, expect, it } from 'vitest';
import { getContactStatusVisual } from './contactStatusConstants';

describe('contact status visuals', () => {
  it('keeps active in the Itemize blue family', () => {
    expect(getContactStatusVisual('active').theme).toBe('blue');
  });

  it('uses orange for inactive and red for archived', () => {
    expect(getContactStatusVisual('inactive').theme).toBe('orange');
    expect(getContactStatusVisual('archived').theme).toBe('red');
  });
});
