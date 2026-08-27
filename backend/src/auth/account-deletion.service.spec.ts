import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { AccountDeletionRepository } from './account-deletion.repository';
import { AccountDeletionService } from './account-deletion.service';
import { AuthEmailService } from './auth-email.service';
import { AuthRepository, AuthenticationUser } from './auth.repository';
import { SessionService } from './session.service';

describe('AccountDeletionService', () => {
  let users: { findById: jest.Mock };
  let deletions: { deleteUser: jest.Mock };
  let emails: { sendAccountDeleted: jest.Mock };
  let sessions: { logout: jest.Mock };
  let service: AccountDeletionService;
  let user: AuthenticationUser;

  beforeEach(async () => {
    user = {
      id: 41,
      email: 'member@example.com',
      name: 'Member',
      passwordHash: await bcrypt.hash('StrongPass1', 4),
      provider: 'email',
      emailVerified: true,
      role: 'USER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    users = { findById: jest.fn().mockResolvedValue(user) };
    deletions = { deleteUser: jest.fn().mockResolvedValue({ kind: 'deleted' }) };
    emails = { sendAccountDeleted: jest.fn().mockResolvedValue(true) };
    sessions = { logout: jest.fn().mockReturnValue({ success: true }) };
    service = new AccountDeletionService(
      users as unknown as AuthRepository,
      deletions as unknown as AccountDeletionRepository,
      emails as unknown as AuthEmailService,
      sessions as unknown as SessionService,
    );
  });

  it('requires exact normalized email confirmation and the current password', async () => {
    await expect(
      service.deleteViewer(41, 'other@example.com', 'StrongPass1', {} as Response),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({ reason: 'EMAIL_CONFIRMATION_MISMATCH' }),
    });
    await expect(
      service.deleteViewer(41, user.email, 'wrong', {} as Response),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({ reason: 'INVALID_PASSWORD' }),
    });
    expect(deletions.deleteUser).not.toHaveBeenCalled();
  });

  it('allows a provider-only account to confirm without a password', async () => {
    users.findById.mockResolvedValue({ ...user, provider: 'google', passwordHash: null });
    const response = {} as Response;

    await expect(
      service.deleteViewer(41, ' MEMBER@EXAMPLE.COM ', undefined, response),
    ).resolves.toMatchObject({ success: true, email: user.email });

    expect(deletions.deleteUser).toHaveBeenCalledWith(41, null);
    expect(sessions.logout).toHaveBeenCalledWith(response);
    expect(emails.sendAccountDeleted).toHaveBeenCalled();
  });

  it.each([
    ['ownership_transfer_required', 'OWNERSHIP_TRANSFER_REQUIRED'],
    ['active_subscription', 'ACTIVE_SUBSCRIPTION'],
    ['evidence_retained', 'SIGNATURE_EVIDENCE_RETAINED'],
  ] as const)('preserves the %s deletion blocker', async (kind, reason) => {
    deletions.deleteUser.mockResolvedValue({ kind, organizationName: 'Shared Workspace' });

    await expect(
      service.deleteViewer(41, user.email, 'StrongPass1', {} as Response),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({ code: 'CONFLICT', reason }),
    });
    expect(sessions.logout).not.toHaveBeenCalled();
  });

  it('fences a password change between confirmation and deletion', async () => {
    deletions.deleteUser.mockResolvedValue({ kind: 'account_changed' });

    await expect(
      service.deleteViewer(41, user.email, 'StrongPass1', {} as Response),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({ reason: 'ACCOUNT_CHANGED' }),
    });
  });
});
