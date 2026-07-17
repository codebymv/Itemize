import { ContactProfileRepository } from './contact-profile.repository';

describe('ContactProfileRepository', () => {
  const query = jest.fn();
  const repository = new ContactProfileRepository({ query } as never);

  beforeEach(() => jest.resetAllMocks());

  it('runs bounded organization-qualified child queries', async () => {
    query.mockResolvedValue({ rows: [] });

    const result = await repository.find(42, 11);

    expect(query).toHaveBeenCalledTimes(9);
    for (const [sql, parameters] of query.mock.calls) {
      expect(sql).toContain('$1');
      expect(sql).toContain('$2');
      expect(sql).toContain('LIMIT $3');
      expect(parameters[0]).toBe(42);
      expect(parameters[1]).toBe(11);
      expect(parameters[2]).toBeGreaterThan(0);
      expect(parameters[2]).toBeLessThanOrEqual(50);
    }
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).not.toContain(
      'list_contacts',
    );
    expect(result.lists).toEqual({ status: 'AVAILABLE', rows: [] });
    expect(result.payments).toEqual({ status: 'AVAILABLE', rows: [] });
  });

  it('marks one failed child query unavailable without hiding healthy sections', async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes('FROM notes n')) {
        return Promise.reject(new Error('notes unavailable'));
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await repository.find(42, 11);

    expect(result.notes).toEqual({ status: 'UNAVAILABLE', rows: [] });
    expect(result.invoices).toEqual({ status: 'AVAILABLE', rows: [] });
    expect(result.bookings).toEqual({ status: 'AVAILABLE', rows: [] });
  });
});
