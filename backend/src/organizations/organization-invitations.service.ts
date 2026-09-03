import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';
import { OrganizationInvitationEmailService } from './organization-invitation-email.service';
import {
  OrganizationInvitationRow,
  OrganizationInvitationsRepository,
  PreparedOrganizationInvitation,
} from './organization-invitations.repository';
import {
  OrganizationInvitation,
  OrganizationInvitationAcceptance,
  OrganizationInvitationPreview,
} from './organization.types';
import {
  organizationMutationFingerprint,
  organizationMutationKey,
} from './organization-mutation.idempotency';

@Injectable()
export class OrganizationInvitationsService {
  constructor(
    private readonly invitations: OrganizationInvitationsRepository,
    private readonly emails: OrganizationInvitationEmailService,
  ) {}

  async list(userId: number, organizationId: number): Promise<OrganizationInvitation[]> {
    this.id(organizationId, 'organizationId');
    const outcome = await this.invitations.list(userId, organizationId);
    if (outcome.kind !== 'ok') {
      throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
    }
    return outcome.rows.map((row) => this.map(row));
  }

  async create(
    userId: number,
    organizationId: number,
    rawEmail: string,
    rawRole: string,
    idempotencyKey: string,
  ): Promise<OrganizationInvitation> {
    this.id(organizationId, 'organizationId');
    const email = this.email(rawEmail);
    const role = this.role(rawRole);
    const key = organizationMutationKey(idempotencyKey);
    const outcome = await this.invitations.create(
      userId,
      organizationId,
      email,
      role,
      key,
      organizationMutationFingerprint('create_invitation', { email, role }),
    );
    if (outcome.kind !== 'ok') this.failure(outcome);
    if (outcome.invitation.replayed) return this.map(outcome.invitation.row);
    return this.deliver(
      outcome.invitation,
      `organization-invitation:${organizationId}:${key}`,
    );
  }

  async resend(
    userId: number,
    organizationId: number,
    invitationId: number,
    idempotencyKey: string,
  ): Promise<OrganizationInvitation> {
    this.id(organizationId, 'organizationId');
    this.id(invitationId, 'invitationId');
    const key = organizationMutationKey(idempotencyKey);
    const outcome = await this.invitations.resend(
      userId,
      organizationId,
      invitationId,
      key,
      organizationMutationFingerprint('resend_invitation', { invitationId }),
    );
    if (outcome.kind !== 'ok') this.failure(outcome);
    if (outcome.invitation.replayed) return this.map(outcome.invitation.row);
    return this.deliver(
      outcome.invitation,
      `organization-invitation:${organizationId}:${key}`,
    );
  }

  async revoke(userId: number, organizationId: number, invitationId: number): Promise<boolean> {
    this.id(organizationId, 'organizationId');
    this.id(invitationId, 'invitationId');
    const outcome = await this.invitations.revoke(userId, organizationId, invitationId);
    if (outcome.kind === 'revoked') return true;
    if (outcome.kind === 'not_found' || outcome.kind === 'forbidden') {
      throw itemizeGraphqlError('Organization invitation not found', 'NOT_FOUND');
    }
    return false;
  }

  async preview(rawToken: string): Promise<OrganizationInvitationPreview> {
    const token = this.token(rawToken);
    const row = await this.invitations.preview(this.hash(token));
    if (!row) {
      throw itemizeGraphqlError('Invitation not found', 'NOT_FOUND', {
        reason: 'INVITATION_NOT_FOUND',
      });
    }
    const mapped = this.map(row);
    return {
      organizationName: mapped.organizationName,
      email: mapped.email,
      role: mapped.role,
      status: mapped.status,
      expiresAt: mapped.expiresAt,
      invitedByName: mapped.invitedByName,
    };
  }

  async accept(userId: number, rawToken: string): Promise<OrganizationInvitationAcceptance> {
    const token = this.token(rawToken);
    const outcome = await this.invitations.accept(userId, this.hash(token));
    if (outcome.kind === 'ok') return outcome;
    if (outcome.kind === 'expired') {
      throw itemizeGraphqlError('This invitation has expired', 'BAD_USER_INPUT', {
        reason: 'INVITATION_EXPIRED',
      });
    }
    if (outcome.kind === 'email_mismatch') {
      throw itemizeGraphqlError(
        'Sign in with the email address that received this invitation',
        'FORBIDDEN',
        { reason: 'INVITATION_EMAIL_MISMATCH' },
      );
    }
    if (outcome.kind === 'already_member') {
      throw itemizeGraphqlError('You already belong to this organization', 'BAD_USER_INPUT', {
        reason: 'ALREADY_MEMBER',
      });
    }
    if (outcome.kind === 'limit_reached') this.limitFailure(outcome);
    throw itemizeGraphqlError('Invitation not found', 'NOT_FOUND', {
      reason: 'INVITATION_NOT_FOUND',
    });
  }

  private async deliver(
    prepared: Extract<PreparedOrganizationInvitation, { replayed: false }>,
    idempotencyKey: string,
  ): Promise<OrganizationInvitation> {
    const sent = await this.emails.send({
      email: prepared.row.email,
      organizationName: prepared.row.organization_name,
      invitedByName: prepared.row.invited_by_name,
      role: prepared.row.role,
    }, prepared.token, idempotencyKey);
    const deliveredAt = await this.invitations.markDelivery(
      Number(prepared.row.id),
      prepared.tokenHash,
      sent,
    );
    const mapped = this.map(prepared.row);
    return {
      ...mapped,
      lastSentAt: deliveredAt,
      deliverySent: deliveredAt !== null,
    };
  }

  private map(row: OrganizationInvitationRow): OrganizationInvitation {
    const expiresAt = new Date(row.expires_at);
    return {
      id: Number(row.id),
      organizationId: Number(row.organization_id),
      organizationName: row.organization_name,
      email: row.email,
      role: row.role,
      status: row.status === 'pending' && expiresAt.getTime() <= Date.now()
        ? 'expired'
        : row.status,
      invitedBy: row.invited_by === null ? null : Number(row.invited_by),
      invitedByName: row.invited_by_name,
      invitedAt: new Date(row.invited_at),
      expiresAt,
      lastSentAt: row.last_sent_at ? new Date(row.last_sent_at) : null,
      deliverySent: row.last_sent_at !== null,
    };
  }

  private failure(outcome: Exclude<Awaited<ReturnType<OrganizationInvitationsRepository['create']>>, { kind: 'ok' }>): never {
    if (outcome.kind === 'already_member') {
      throw itemizeGraphqlError('This user already belongs to the organization', 'BAD_USER_INPUT', {
        field: 'email', reason: 'ALREADY_MEMBER',
      });
    }
    if (outcome.kind === 'already_invited') {
      throw itemizeGraphqlError('A pending invitation already exists for this email', 'BAD_USER_INPUT', {
        field: 'email', reason: 'INVITATION_ALREADY_PENDING', invitationId: outcome.invitationId,
      });
    }
    if (outcome.kind === 'limit_reached') this.limitFailure(outcome);
    if (outcome.kind === 'cooldown') {
      throw itemizeGraphqlError('Please wait before resending this invitation', 'BAD_USER_INPUT', {
        reason: 'INVITATION_RESEND_COOLDOWN', retryAt: outcome.retryAt.toISOString(),
      });
    }
    if (outcome.kind === 'idempotency_conflict') {
      throw itemizeGraphqlError(
        'idempotencyKey was already used for a different invitation request',
        'CONFLICT',
        { field: 'idempotencyKey', reason: 'IDEMPOTENCY_KEY_REUSED' },
      );
    }
    if (outcome.kind === 'result_unavailable') {
      throw itemizeGraphqlError(
        'The invitation created by this request is no longer available',
        'CONFLICT',
        { field: 'idempotencyKey', reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE' },
      );
    }
    throw itemizeGraphqlError('Organization invitation not found', 'NOT_FOUND');
  }

  private limitFailure(outcome: { current: number; limit: number; plan: string }): never {
    throw itemizeGraphqlError(
      `You've reached your team member limit (${outcome.current}/${outcome.limit}). Please upgrade your plan.`,
      'FORBIDDEN',
      { reason: 'PLAN_LIMIT_REACHED', ...outcome },
    );
  }

  private email(value: string): string {
    const email = value?.trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw itemizeGraphqlError('A valid email address is required', 'BAD_USER_INPUT', {
        field: 'email',
      });
    }
    return email;
  }

  private role(value: string): 'admin' | 'member' | 'viewer' {
    if (!['admin', 'member', 'viewer'].includes(value)) {
      throw itemizeGraphqlError('Invitation role is invalid', 'BAD_USER_INPUT', { field: 'role' });
    }
    return value as 'admin' | 'member' | 'viewer';
  }

  private token(value: string): string {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
      throw itemizeGraphqlError('Invitation link is invalid', 'BAD_USER_INPUT', {
        field: 'token', reason: 'INVALID_INVITATION_TOKEN',
      });
    }
    return value;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private id(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(`${field} must be a positive integer`, 'BAD_USER_INPUT', { field });
    }
  }
}
