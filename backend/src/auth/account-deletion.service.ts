import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { itemizeGraphqlError } from '../common/graphql-error';
import { AccountDeletionRepository } from './account-deletion.repository';
import { AuthEmailService } from './auth-email.service';
import { AuthRepository } from './auth.repository';
import { SessionService } from './session.service';
import { AuthMessagePayload } from './auth.types';

@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly users: AuthRepository,
    private readonly deletions: AccountDeletionRepository,
    private readonly emails: AuthEmailService,
    private readonly sessions: SessionService,
  ) {}

  async deleteViewer(
    userId: number,
    confirmation: string,
    currentPassword: string | undefined,
    response: Response,
  ): Promise<AuthMessagePayload> {
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

    const outcome = await this.deletions.deleteUser(user.id, user.passwordHash);
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
    if (outcome.kind === 'ownership_transfer_required') {
      throw itemizeGraphqlError(
        `Transfer ownership of ${outcome.organizationName} before deleting your account.`,
        'CONFLICT',
        { reason: 'OWNERSHIP_TRANSFER_REQUIRED' },
      );
    }
    if (outcome.kind === 'active_subscription') {
      throw itemizeGraphqlError(
        `Cancel the subscription for ${outcome.organizationName} before deleting your account.`,
        'CONFLICT',
        { reason: 'ACTIVE_SUBSCRIPTION' },
      );
    }
    if (outcome.kind === 'evidence_retained') {
      throw itemizeGraphqlError(
        `${outcome.organizationName} contains signed-document evidence that must be retained. Contact support for help closing this account.`,
        'CONFLICT',
        { reason: 'SIGNATURE_EVIDENCE_RETAINED' },
      );
    }

    this.sessions.logout(response);
    await this.emails.sendAccountDeleted(user);
    return {
      success: true,
      message: 'Your Itemize account and eligible personal workspaces were deleted.',
      email: user.email,
    };
  }
}
