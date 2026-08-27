import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { AccountDeletionRepository } from './account-deletion.repository';
import {
  ACCOUNT_DELETION_RECOVERY_DAYS,
  AccountDeletionService,
} from './account-deletion.service';
import { AuthEmailService } from './auth-email.service';
import { AuthRepository, AuthenticationUser } from './auth.repository';
import { SessionService } from './session.service';

describe('AccountDeletionService', () => {
  let users: { findById: jest.Mock };
  let deletions: {
    preflight: jest.Mock;
    scheduleDeletion: jest.Mock;
    cancelScheduleAfterDeliveryFailure: jest.Mock;
    recoverDeletion: jest.Mock;
  };
  let emails: {
    sendAccountDeletionScheduled: jest.Mock;
    sendAccountDeletionRecovered: jest.Mock;
  };
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
    deletions = {
      preflight: jest.fn().mockResolvedValue({
        eligible: true,
        membershipCount: 1,
        ownedOrganizationCount: 1,
        blockers: [],
        scheduledAt: null,
      }),
      scheduleDeletion: jest.fn().mockImplementation(({ scheduledAt }) =>
        Promise.resolve({ kind: 'scheduled', scheduledAt })),
      cancelScheduleAfterDeliveryFailure: jest.fn().mockResolvedValue(true),
      recoverDeletion: jest.fn(),
    };
    emails = {
      sendAccountDeletionScheduled: jest.fn().mockResolvedValue(true),
      sendAccountDeletionRecovered: jest.fn().mockResolvedValue(true),
    };
    sessions = { logout: jest.fn().mockReturnValue({ success: true }) };
    service = new AccountDeletionService(
      users as unknown as AuthRepository,
      deletions as unknown as AccountDeletionRepository,
      emails as unknown as AuthEmailService,
      sessions as unknown as SessionService,
    );
  });

  it('returns a complete preflight before requesting credentials', async () => {
    await expect(service.preflight(41)).resolves.toMatchObject({
      eligible: true,
      recoveryDays: ACCOUNT_DELETION_RECOVERY_DAYS,
      membershipCount: 1,
      retentionNotices: expect.arrayContaining([
        expect.stringContaining('Security and lifecycle audit records'),
      ]),
    });
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
    expect(deletions.scheduleDeletion).not.toHaveBeenCalled();
  });

  it('locks the session, schedules deletion, and sends a recovery capability', async () => {
    const response = {} as Response;
    const result = await service.deleteViewer(
      41,
      ' MEMBER@EXAMPLE.COM ',
      'StrongPass1',
      response,
    );

    expect(result).toMatchObject({
      success: true,
      email: user.email,
      recoveryDays: ACCOUNT_DELETION_RECOVERY_DAYS,
      scheduledAt: expect.any(Date),
    });
    expect(deletions.scheduleDeletion).toHaveBeenCalledWith(expect.objectContaining({
      userId: 41,
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      emailHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(sessions.logout).toHaveBeenCalledWith(response);
    expect(emails.sendAccountDeletionScheduled).toHaveBeenCalledWith(
      user,
      expect.stringMatching(/^[A-Za-z0-9_-]+$/),
      expect.any(Date),
    );
  });

  it('allows a provider-only account to confirm without a password', async () => {
    users.findById.mockResolvedValue({ ...user, provider: 'google', passwordHash: null });
    await expect(
      service.deleteViewer(41, user.email, undefined, {} as Response),
    ).resolves.toMatchObject({ success: true });
    expect(deletions.scheduleDeletion).toHaveBeenCalledWith(
      expect.objectContaining({ expectedPasswordHash: null }),
    );
  });

  it('keeps the account active when the recovery email cannot be accepted', async () => {
    emails.sendAccountDeletionScheduled.mockResolvedValue(false);

    await expect(
      service.deleteViewer(41, user.email, 'StrongPass1', {} as Response),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'SERVICE_UNAVAILABLE',
        reason: 'ACCOUNT_RECOVERY_EMAIL_UNAVAILABLE',
      }),
    });
    expect(deletions.cancelScheduleAfterDeliveryFailure).toHaveBeenCalledWith({
      userId: 41,
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      emailHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(sessions.logout).not.toHaveBeenCalled();
  });

  it.each([
    ['OWNERSHIP_TRANSFER_REQUIRED', 'Transfer ownership'],
    ['ACTIVE_SUBSCRIPTION', 'Cancel the subscription'],
    ['SIGNATURE_EVIDENCE_RETAINED', 'signed-document evidence'],
  ] as const)('preserves the %s deletion blocker', async (reason, message) => {
    deletions.scheduleDeletion.mockResolvedValue({
      kind: 'blocked',
      blockers: [{
        reason,
        organizationId: 9,
        organizationName: 'Shared Workspace',
      }],
    });

    await expect(
      service.deleteViewer(41, user.email, 'StrongPass1', {} as Response),
    ).rejects.toMatchObject({
      message: expect.stringContaining(message),
      extensions: expect.objectContaining({ code: 'CONFLICT', reason }),
    });
    expect(sessions.logout).not.toHaveBeenCalled();
  });

  it('recovers a scheduled account with a one-use token', async () => {
    deletions.recoverDeletion.mockResolvedValue({
      id: 41,
      email: user.email,
      name: user.name,
    });
    await expect(service.recover('r'.repeat(43))).resolves.toMatchObject({
      success: true,
      email: user.email,
    });
    expect(deletions.recoverDeletion).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(emails.sendAccountDeletionRecovered).toHaveBeenCalled();
  });
});
