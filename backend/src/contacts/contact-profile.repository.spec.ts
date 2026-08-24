import { ContactProfileRepository } from './contact-profile.repository';

describe('ContactProfileRepository', () => {
  const query = jest.fn();
  const repository = new ContactProfileRepository({ query } as never);
  const sectionSql = {
    invoices: 'FROM invoices i',
    signatures: 'FROM signature_documents sd',
    payments: 'FROM payments p',
    activities: 'FROM contact_activities ca',
    notes: 'FROM notes n',
    lists: 'FROM lists l',
    communications: 'FROM messages m',
    tasks: 'FROM tasks t',
    bookings: 'FROM bookings b',
  } as const;

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

  it.each(Object.entries(sectionSql))(
    'marks a failed %s child query unavailable without hiding healthy sections',
    async (failedSection, failedSql) => {
      query.mockImplementation((sql: string) => {
        if (sql.includes(failedSql)) {
          return Promise.reject(new Error(`${failedSection} unavailable`));
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await repository.find(42, 11);

      expect(result[failedSection as keyof typeof result]).toEqual({
        status: 'UNAVAILABLE',
        rows: [],
      });
      for (const healthySection of Object.keys(sectionSql).filter(
        (section) => section !== failedSection,
      )) {
        expect(result[healthySection as keyof typeof result]).toEqual({
          status: 'AVAILABLE',
          rows: [],
        });
      }
      expect(query).toHaveBeenCalledTimes(9);
    },
  );
});
