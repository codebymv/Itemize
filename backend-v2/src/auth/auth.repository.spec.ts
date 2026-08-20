import { Pool, PoolClient } from 'pg';
import { AuthRepository } from './auth.repository';
import { SignupMode } from './auth.inputs';

describe('AuthRepository registration transaction', () => {
  it('uses one explicit SQL type for the reused subscription status parameter', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 13,
        email: 'trial@example.com',
        name: 'Trial',
        password_hash: 'hash',
        provider: 'email',
        email_verified: false,
        role: 'USER',
        created_at: new Date(),
      }] })
      .mockResolvedValueOnce({ rows: [{ default_organization_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 27 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query, release: jest.fn() } as unknown as PoolClient;
    const pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const repository = new AuthRepository(pool);

    await repository.registerEmailUser({
      email: 'trial@example.com',
      name: 'Trial',
      passwordHash: 'hash',
      verificationTokenHash: 'token-hash',
      verificationTokenExpires: new Date(),
      signupMode: SignupMode.TRIAL,
    });

    const organizationSql = String(query.mock.calls[3][0]);
    expect(organizationSql.match(/\$5::varchar/g)).toHaveLength(2);
    expect(query.mock.calls[3][1]).toEqual(expect.arrayContaining(['starter', 'trialing']));
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('rolls back the user when personal-workspace creation fails', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 12,
        email: 'rollback@example.com',
        name: 'Rollback',
        password_hash: 'hash',
        provider: 'email',
        email_verified: false,
        role: 'USER',
        created_at: new Date(),
      }] })
      .mockResolvedValueOnce({ rows: [{ default_organization_id: null }] })
      .mockRejectedValueOnce(new Error('organization insert failed'))
      .mockResolvedValueOnce({ rows: [] });
    const client = { query, release: jest.fn() } as unknown as PoolClient;
    const pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const repository = new AuthRepository(pool);

    await expect(repository.registerEmailUser({
      email: 'rollback@example.com',
      name: 'Rollback',
      passwordHash: 'hash',
      verificationTokenHash: 'token-hash',
      verificationTokenExpires: new Date(),
      signupMode: SignupMode.FREE,
    })).rejects.toThrow('organization insert failed');

    expect(query.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual([
      'BEGIN',
      'INSERT',
      'SELECT',
      'INSERT',
      'ROLLBACK',
    ]);
    expect(query.mock.calls[3][1]).toEqual(expect.arrayContaining(['free', 'none']));
    expect(client.release).toHaveBeenCalled();
  });
});
