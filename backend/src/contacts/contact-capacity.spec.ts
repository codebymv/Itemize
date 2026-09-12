import type { PoolClient } from 'pg';
import { contactCapacity } from './contact-capacity';

describe('contact capacity policy', () => {
  it.each([
    ['free', null, 0, 1, 0, false],
    ['unknown', null, 0, 1, 0, false],
    ['starter', null, 4999, 1, 5000, true],
    ['unlimited', null, 25000, 1, 25000, false],
    ['pro', null, 100000, 1, -1, true],
    ['starter', 0, 0, 1, 0, false],
    ['starter', 3, 2, 2, 3, false],
    ['starter', 0, 5, 0, 0, true],
  ])('checks %s capacity without silently granting a default paid allowance', async (plan, stored, current, attempted, limit, allowed) => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ plan, contacts_limit: stored }] })
      .mockResolvedValueOnce({ rows: [{ total: current }] });
    expect(await contactCapacity({ query } as unknown as PoolClient, 4, attempted as number))
      .toEqual({ plan, current, limit, allowed });
  });
});
