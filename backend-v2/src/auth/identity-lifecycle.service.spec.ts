import { Response } from 'express';
import { AuthEmailService } from './auth-email.service';
import { AuthRepository, AuthenticationUser } from './auth.repository';
import { IdentityLifecycleService } from './identity-lifecycle.service';
import { SessionService } from './session.service';

const user: AuthenticationUser = {
  id: 41,
  email: 'member@example.com',
  name: 'Member',
  passwordHash: 'hash',
  provider: 'email',
  emailVerified: false,
  role: 'USER',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('IdentityLifecycleService', () => {
  let users: jest.Mocked<Pick<
    AuthRepository,
    'findByEmail' | 'registerEmailUser' | 'consumeVerificationToken' | 'replaceVerificationToken'
  >>;
  let emails: jest.Mocked<Pick<AuthEmailService, 'sendVerification' | 'sendWelcome'>>;
  let sessions: jest.Mocked<Pick<SessionService, 'createSession'>>;
  let service: IdentityLifecycleService;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      registerEmailUser: jest.fn(),
      consumeVerificationToken: jest.fn(),
      replaceVerificationToken: jest.fn(),
    };
    emails = {
      sendVerification: jest.fn().mockResolvedValue(true),
      sendWelcome: jest.fn().mockResolvedValue(true),
    };
    sessions = { createSession: jest.fn().mockResolvedValue(undefined) };
    service = new IdentityLifecycleService(
      users as unknown as AuthRepository,
      emails as unknown as AuthEmailService,
      sessions as unknown as SessionService,
    );
  });

  it('commits the account before attempting verification delivery', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.registerEmailUser.mockResolvedValue(user);

    await expect(
      service.register(' MEMBER@Example.com ', 'StrongPass1', ' Member '),
    ).resolves.toMatchObject({ success: true, email: 'member@example.com' });

    expect(users.registerEmailUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'member@example.com',
      name: 'Member',
      passwordHash: expect.any(String),
      verificationTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(emails.sendVerification).toHaveBeenCalledWith(
      user,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(users.registerEmailUser.mock.invocationCallOrder[0]).toBeLessThan(
      emails.sendVerification.mock.invocationCallOrder[0],
    );
  });

  it('preserves the Google-account conflict reason', async () => {
    users.findByEmail.mockResolvedValue({ ...user, provider: 'google', passwordHash: null });

    await expect(
      service.register('member@example.com', 'StrongPass1'),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'ACCOUNT_CONFLICT',
        reason: 'GOOGLE_ACCOUNT_EXISTS',
      }),
    });
    expect(users.registerEmailUser).not.toHaveBeenCalled();
  });

  it('consumes a verification token once before establishing the session', async () => {
    users.consumeVerificationToken.mockResolvedValue({ ...user, emailVerified: true });
    const response = {} as Response;

    await expect(service.verifyEmail('verification-token', response)).resolves.toMatchObject({
      success: true,
      user: { uid: 41, email: 'member@example.com' },
    });
    expect(users.consumeVerificationToken).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(sessions.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerified: true }),
      response,
    );
  });

  it('returns the same resend envelope for missing and eligible accounts', async () => {
    users.replaceVerificationToken
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ email: user.email, name: user.name });

    const missing = await service.resendVerification('missing@example.com');
    const existing = await service.resendVerification(user.email);

    expect(missing).toEqual(existing);
    expect(emails.sendVerification).toHaveBeenCalledTimes(1);
  });
});
