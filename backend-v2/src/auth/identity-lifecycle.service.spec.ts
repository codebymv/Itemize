import { Response } from 'express';
import bcrypt from 'bcryptjs';
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
    | 'findByEmail'
    | 'findById'
    | 'registerEmailUser'
    | 'consumeVerificationToken'
    | 'replaceVerificationToken'
    | 'replacePasswordResetToken'
    | 'consumePasswordResetToken'
    | 'changePasswordIfCurrent'
    | 'updateName'
  >>;
  let emails: jest.Mocked<Pick<
    AuthEmailService,
    'sendVerification' | 'sendWelcome' | 'sendPasswordReset' | 'sendPasswordChanged'
  >>;
  let sessions: jest.Mocked<Pick<SessionService, 'createSession'>>;
  let service: IdentityLifecycleService;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      registerEmailUser: jest.fn(),
      consumeVerificationToken: jest.fn(),
      replaceVerificationToken: jest.fn(),
      replacePasswordResetToken: jest.fn(),
      consumePasswordResetToken: jest.fn(),
      changePasswordIfCurrent: jest.fn(),
      updateName: jest.fn(),
    };
    emails = {
      sendVerification: jest.fn().mockResolvedValue(true),
      sendWelcome: jest.fn().mockResolvedValue(true),
      sendPasswordReset: jest.fn().mockResolvedValue(true),
      sendPasswordChanged: jest.fn().mockResolvedValue(true),
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

  it('keeps password-reset requests non-enumerating and stores only a token hash', async () => {
    users.replacePasswordResetToken
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ email: user.email, name: user.name });

    const missing = await service.requestPasswordReset('missing@example.com');
    const existing = await service.requestPasswordReset(user.email);

    expect(missing).toEqual(existing);
    expect(users.replacePasswordResetToken).toHaveBeenLastCalledWith({
      email: user.email,
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresAt: expect.any(Date),
    });
    expect(emails.sendPasswordReset).toHaveBeenCalledWith(
      { email: user.email, name: user.name },
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('atomically consumes a reset token before sending confirmation', async () => {
    users.consumePasswordResetToken.mockResolvedValue({
      email: user.email,
      name: user.name,
    });

    await expect(
      service.resetPassword('reset-token', 'NewStrong2'),
    ).resolves.toMatchObject({ success: true });
    expect(users.consumePasswordResetToken).toHaveBeenCalledWith({
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      passwordHash: expect.any(String),
    });
    expect(emails.sendPasswordChanged).toHaveBeenCalledWith({
      email: user.email,
      name: user.name,
    });
  });

  it('changes a local password only while the compared hash remains current', async () => {
    const passwordHash = await bcrypt.hash('CurrentPass1', 4);
    users.findById.mockResolvedValue({ ...user, passwordHash });
    users.changePasswordIfCurrent.mockResolvedValue({
      email: user.email,
      name: user.name,
    });

    await expect(
      service.changePassword(user.id, 'CurrentPass1', 'DifferentPass2'),
    ).resolves.toMatchObject({ success: true });
    expect(users.changePasswordIfCurrent).toHaveBeenCalledWith({
      userId: user.id,
      currentHash: passwordHash,
      passwordHash: expect.any(String),
    });
  });

  it('trims and bounds viewer profile names', async () => {
    users.updateName.mockResolvedValue({ ...user, name: 'Updated Member' });

    await expect(
      service.updateViewerProfile(user.id, '  Updated Member  '),
    ).resolves.toMatchObject({ id: user.id, name: 'Updated Member' });
    expect(users.updateName).toHaveBeenCalledWith(user.id, 'Updated Member');
    await expect(service.updateViewerProfile(user.id, ' '.repeat(2))).rejects.toMatchObject({
      extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }),
    });
  });
});
