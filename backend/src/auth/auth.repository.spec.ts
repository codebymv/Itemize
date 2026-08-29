import { Pool, PoolClient } from 'pg';
import { AuthRepository } from './auth.repository';
import { SignupMode } from './auth.inputs';
import { NotificationsService } from '../notifications/notifications.service';

const notifications = () => ({
  createWithClient: jest.fn().mockResolvedValue(null),
}) as unknown as jest.Mocked<NotificationsService>;

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
    const notificationService = notifications();
    const repository = new AuthRepository(pool, notificationService);

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
    expect(notificationService.createWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        organizationId: 27,
        recipientUserId: 13,
        eventType: 'account.welcome',
        dedupeKey: 'account:13:welcome:v1',
        title: 'Welcome to Itemize!',
        body: 'Workspace ready. Add your content.',
        href: '/canvas',
      }),
    );
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('welcomes free accounts with workspace-only actions they can use', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 16,
        email: 'free@example.com',
        name: 'Free',
        password_hash: 'hash',
        provider: 'email',
        email_verified: false,
        role: 'USER',
        created_at: new Date(),
      }] })
      .mockResolvedValueOnce({ rows: [{ default_organization_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 32 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query, release: jest.fn() } as unknown as PoolClient;
    const pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const notificationService = notifications();
    const repository = new AuthRepository(pool, notificationService);

    await repository.registerEmailUser({
      email: 'free@example.com',
      name: 'Free',
      passwordHash: 'hash',
      verificationTokenHash: 'token-hash',
      verificationTokenExpires: new Date(),
      signupMode: SignupMode.FREE,
    });

    expect(notificationService.createWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        organizationId: 32,
        recipientUserId: 16,
        title: 'Welcome to Itemize!',
        body: 'Workspace ready. Add your content.',
      }),
    );
  });

  it('rolls back the user when personal-organization creation fails', async () => {
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
    const repository = new AuthRepository(pool, notifications());

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

  it('links Google to an existing account without replacing its Itemize profile name', async () => {
    const existing = {
      id: 14,
      email: 'member@example.com',
      name: 'Chosen Itemize Name',
      password_hash: 'hash',
      provider: 'email',
      email_verified: true,
      role: 'USER',
      created_at: new Date(),
    };
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({ rows: [{ default_organization_id: 31 }] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query, release: jest.fn() } as unknown as PoolClient;
    const pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const notificationService = notifications();
    const repository = new AuthRepository(pool, notificationService);

    await expect(repository.findOrCreateGoogleUser({
      email: 'member@example.com',
      name: 'Google Profile Name',
      googleId: 'google-id-14',
    })).resolves.toMatchObject({ name: 'Chosen Itemize Name' });

    const linkSql = String(query.mock.calls[2][0]);
    expect(linkSql).toContain('SET google_id = $1');
    expect(linkSql).not.toContain('SET name');
    expect(query.mock.calls[2][1]).toEqual(['google-id-14', 14]);
    expect(notificationService.createWithClient).not.toHaveBeenCalled();
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
});
