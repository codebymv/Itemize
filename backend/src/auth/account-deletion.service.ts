import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  AccountDeletionBlocker,
  AccountDeletionRepository,
} from './account-deletion.repository';
import {
  AccountDeletionPreflightPayload,
  AccountDeletionScheduledPayload,
} from './account-deletion.types';
import { AuthEmailService } from './auth-email.service';
import { AuthRepository } from './auth.repository';
import { SessionService } from './session.service';
import { AuthMessagePayload } from './auth.types';

export const ACCOUNT_DELETION_RECOVERY_DAYS = 7;

const RETENTION_NOTICES = [
  'Signed-document evidence is not automatically deleted when legal or evidentiary retention is required.',
  'Payment processors may retain transaction records under their own legal obligations.',
  'Security and lifecycle audit records retain only a one-way email hash after account deletion.',
  'Encrypted backups age out under Itemize backup-retention controls.',
];

@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly users: AuthRepository,
    private readonly deletions: AccountDeletionRepository,
    private readonly emails: AuthEmailService,
    private readonly sessions: SessionService,
  ) {}

  async preflight(userId: number): Promise<AccountDeletionPreflightPayload> {
    const result = await this.deletions.preflight(userId);
    if (!result) throw itemizeGraphqlError('Account not found', 'NOT_FOUND');
    return {
      eligible: result.eligible,
      membershipCount: result.membershipCount,
      ownedOrganizationCount: result.ownedOrganizationCount,
      blockers: result.blockers,
      recoveryDays: ACCOUNT_DELETION_RECOVERY_DAYS,
      retentionNotices: RETENTION_NOTICES,
      ...(result.scheduledAt ? { scheduledAt: result.scheduledAt } : {}),
    };
  }

  async deleteViewer(
    userId: number,
    confirmation: string,
    currentPassword: string | undefined,
    response: Response,
  ): Promise<AccountDeletionScheduledPayload> {
    const user = await this.users.findById(userId);
    if (!user) throw itemizeGraphqlError('Account not found', 'NOT_FOUND');
    if (confirmation.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw itemizeGraphqlError(
        'Enter your account email exactly to confirm deletion.',
        'BAD_USER_INPUT',
        { reason: 'EMAIL_CONFIRMATION_MISMATCH', field: 'confirmation' },
      );
    }
    if (user.passwordHash) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
        throw itemizeGraphqlError('Current password is incorrect.', 'UNAUTHENTICATED', {
          reason: 'INVALID_PASSWORD',
          field: 'currentPassword',
        });
      }
    }

    const token = randomBytes(32).toString('base64url');
    const scheduledAt = new Date(
      Date.now() + ACCOUNT_DELETION_RECOVERY_DAYS * 24 * 60 * 60 * 1_000,
    );
    const tokenHash = this.hash(token);
    const emailHash = this.hash(user.email.toLowerCase());
    const outcome = await this.deletions.scheduleDeletion({
      userId: user.id,
      expectedPasswordHash: user.passwordHash,
      tokenHash,
      emailHash,
      scheduledAt,
    });
    if (outcome.kind === 'not_found') {
      throw itemizeGraphqlError('Account not found', 'NOT_FOUND');
    }
    if (outcome.kind === 'account_changed') {
      throw itemizeGraphqlError(
        'Your account changed while deletion was being confirmed. Please try again.',
        'CONFLICT',
        { reason: 'ACCOUNT_CHANGED' },
      );
    }
    if (outcome.kind === 'blocked') this.throwBlocker(outcome.blockers[0]);

    const recoveryEmailAccepted = await this.emails.sendAccountDeletionScheduled(
      user,
      token,
      outcome.scheduledAt,
    );
    if (!recoveryEmailAccepted) {
      await this.deletions.cancelScheduleAfterDeliveryFailure({
        userId: user.id,
        tokenHash,
        emailHash,
      });
      throw itemizeGraphqlError(
        'We could not send the account recovery email. Your deletion request was not scheduled.',
        'SERVICE_UNAVAILABLE',
        { reason: 'ACCOUNT_RECOVERY_EMAIL_UNAVAILABLE' },
      );
    }
    this.sessions.logout(response);
    return {
      success: true,
      message: `Your account is locked and scheduled for deletion on ${outcome.scheduledAt.toISOString().slice(0, 10)}. Use the recovery email before then to keep it.`,
      email: user.email,
      scheduledAt: outcome.scheduledAt,
      recoveryDays: ACCOUNT_DELETION_RECOVERY_DAYS,
    };
  }

  async recover(token: string): Promise<AuthMessagePayload> {
    if (typeof token !== 'string' || token.length < 32 || token.length > 512) {
      throw itemizeGraphqlError(
        'This account recovery link is invalid or expired.',
        'BAD_USER_INPUT',
        { reason: 'INVALID_ACCOUNT_RECOVERY_TOKEN' },
      );
    }
    const user = await this.deletions.recoverDeletion(this.hash(token));
    if (!user) {
      throw itemizeGraphqlError(
        'This account recovery link is invalid or expired.',
        'BAD_USER_INPUT',
        { reason: 'INVALID_ACCOUNT_RECOVERY_TOKEN' },
      );
    }
    await this.emails.sendAccountDeletionRecovered(user);
    return {
      success: true,
      message: 'Your Itemize account was recovered. You can sign in again.',
      email: user.email,
    };
  }

  private throwBlocker(blocker: AccountDeletionBlocker): never {
    if (blocker.reason === 'OWNERSHIP_TRANSFER_REQUIRED') {
      throw itemizeGraphqlError(
        `Transfer ownership of ${blocker.organizationName} before deleting your account.`,
        'CONFLICT',
        { reason: blocker.reason, organizationId: blocker.organizationId },
      );
    }
    if (blocker.reason === 'ACTIVE_SUBSCRIPTION') {
      throw itemizeGraphqlError(
        `Cancel the subscription for ${blocker.organizationName} before deleting your account.`,
        'CONFLICT',
        { reason: blocker.reason, organizationId: blocker.organizationId },
      );
    }
    throw itemizeGraphqlError(
      `${blocker.organizationName} contains signed-document evidence that must be retained. Contact support for help closing this account.`,
      'CONFLICT',
      { reason: blocker.reason, organizationId: blocker.organizationId },
    );
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
