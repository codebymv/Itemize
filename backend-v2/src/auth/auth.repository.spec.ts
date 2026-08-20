import { Pool, PoolClient } from 'pg';
import { AuthRepository } from './auth.repository';
import { SignupMode } from './auth.inputs';

describe('AuthRepository registration transaction', () => {
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
