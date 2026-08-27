import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationAccessRole } from './organizations.repository';

export type OrganizationInvitationRow = {
  id: number | string;
  organization_id: number | string;
  organization_name: string;
  email: string;
  role: string;
  status: string;
  invited_by: number | string | null;
  invited_by_name: string | null;
  invited_at: Date | string;
  expires_at: Date | string;
  last_sent_at: Date | string | null;
};

export type PreparedOrganizationInvitation = {
  row: OrganizationInvitationRow;
  token: string;
  tokenHash: string;
};

type InvitationOutcome =
  | { kind: 'ok'; invitation: PreparedOrganizationInvitation }
  | { kind: 'forbidden' }
  | { kind: 'already_member' }
  | { kind: 'already_invited'; invitationId: number }
  | { kind: 'not_found' }
  | { kind: 'cooldown'; retryAt: Date }
  | { kind: 'limit_reached'; current: number; limit: number; plan: string };

export type InvitationAcceptanceOutcome =
  | { kind: 'ok'; organizationId: number; organizationName: string; role: string }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'email_mismatch' }
  | { kind: 'already_member' }
  | { kind: 'limit_reached'; current: number; limit: number; plan: string };

const invitationSelection = `
  invitation.id,
  invitation.organization_id,
  organization.name AS organization_name,
  invitation.email,
  invitation.role,
  invitation.status,
  invitation.invited_by,
  inviter.name AS invited_by_name,
  invitation.invited_at,
  invitation.expires_at,
  invitation.last_sent_at`;

@Injectable()
export class OrganizationInvitationsRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly notifications: NotificationsService,
  ) {}

  async list(actorUserId: number, organizationId: number) {
    const access = await this.pool.query<{ role: string }>(
      `SELECT role FROM organization_members
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, actorUserId],
    );
    if (!access.rows[0] || !['owner', 'admin'].includes(access.rows[0].role)) {
      return { kind: 'forbidden' as const };
    }
    const result = await this.pool.query<OrganizationInvitationRow>(
      `SELECT ${invitationSelection}
       FROM organization_invitations invitation
       JOIN organizations organization ON organization.id = invitation.organization_id
       LEFT JOIN users inviter ON inviter.id = invitation.invited_by
       WHERE invitation.organization_id = $1 AND invitation.status = 'pending'
       ORDER BY invitation.invited_at DESC, invitation.id DESC`,
      [organizationId],
    );
    return { kind: 'ok' as const, rows: result.rows };
  }

  create(
    actorUserId: number,
    organizationId: number,
    email: string,
    role: Exclude<OrganizationAccessRole, 'owner'>,
  ): Promise<InvitationOutcome> {
    return this.transaction(async (client) => {
      const actor = await this.lockActor(client, actorUserId, organizationId);
      if (!actor || (actor === 'admin' && role === 'admin')) {
        return { kind: 'forbidden' };
      }
      const organization = await this.lockOrganization(client, organizationId);
      if (!organization) return { kind: 'forbidden' };
      const member = await client.query(
        `SELECT 1 FROM organization_members member
         JOIN users account ON account.id = member.user_id
         WHERE member.organization_id = $1 AND lower(account.email) = lower($2)`,
        [organizationId, email],
      );
      if (member.rows[0]) return { kind: 'already_member' };
      const duplicate = await client.query<{ id: number }>(
        `SELECT id FROM organization_invitations
         WHERE organization_id = $1 AND lower(email) = lower($2) AND status = 'pending'
         FOR UPDATE`,
        [organizationId, email],
      );
      if (duplicate.rows[0]) {
        return { kind: 'already_invited', invitationId: Number(duplicate.rows[0].id) };
      }
      const quota = await this.quota(client, organizationId, organization);
      if (quota.limit >= 0 && quota.current >= quota.limit) {
        return { kind: 'limit_reached', ...quota };
      }
      const prepared = this.token();
      const result = await client.query<OrganizationInvitationRow>(
        `WITH inserted AS (
           INSERT INTO organization_invitations (
             organization_id, email, role, token_hash, invited_by, expires_at,
             last_sent_at
           ) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days', NOW())
           RETURNING *
         )
         SELECT ${invitationSelection.replaceAll('invitation.', 'inserted.')}
         FROM inserted
         JOIN organizations organization ON organization.id = inserted.organization_id
         LEFT JOIN users inviter ON inviter.id = inserted.invited_by`,
        [organizationId, email, role, prepared.hash, actorUserId],
      );
      await this.notifications.recordEventWithClient(client, {
        organizationId,
        actorUserId,
        eventType: 'organization.invitation_created',
        entityType: 'organization_invitation',
        entityId: Number(result.rows[0].id),
        dedupeKey: `organization-invitation-created:${result.rows[0].id}`,
        payload: { targetEmail: result.rows[0].email, role: result.rows[0].role },
      });
      return {
        kind: 'ok',
        invitation: { row: result.rows[0], token: prepared.raw, tokenHash: prepared.hash },
      };
    });
  }

  resend(
    actorUserId: number,
    organizationId: number,
    invitationId: number,
  ): Promise<InvitationOutcome> {
    return this.transaction(async (client) => {
      const actor = await this.lockActor(client, actorUserId, organizationId);
      if (!actor) return { kind: 'forbidden' };
      const organization = await this.lockOrganization(client, organizationId);
      if (!organization) return { kind: 'forbidden' };
      const current = await client.query<OrganizationInvitationRow>(
        `SELECT ${invitationSelection}
         FROM organization_invitations invitation
         JOIN organizations organization ON organization.id = invitation.organization_id
         LEFT JOIN users inviter ON inviter.id = invitation.invited_by
         WHERE invitation.id = $1 AND invitation.organization_id = $2
           AND invitation.status = 'pending'
         FOR UPDATE OF invitation`,
        [invitationId, organizationId],
      );
      const row = current.rows[0];
      if (!row) return { kind: 'not_found' };
      if (actor === 'admin' && row.role === 'admin') return { kind: 'forbidden' };
      if (row.last_sent_at) {
        const retryAt = new Date(new Date(row.last_sent_at).getTime() + 60_000);
        if (retryAt.getTime() > Date.now()) return { kind: 'cooldown', retryAt };
      }
      const quota = await this.quota(client, organizationId, organization, invitationId);
      if (quota.limit >= 0 && quota.current >= quota.limit) {
        return { kind: 'limit_reached', ...quota };
      }
      const prepared = this.token();
      const updated = await client.query<OrganizationInvitationRow>(
        `WITH changed AS (
           UPDATE organization_invitations
           SET token_hash = $1,
               expires_at = NOW() + INTERVAL '7 days',
               invited_by = $2,
               last_sent_at = NOW(),
               updated_at = NOW()
           WHERE id = $3 AND organization_id = $4 AND status = 'pending'
           RETURNING *
         )
         SELECT ${invitationSelection.replaceAll('invitation.', 'changed.')}
         FROM changed
         JOIN organizations organization ON organization.id = changed.organization_id
         LEFT JOIN users inviter ON inviter.id = changed.invited_by`,
        [prepared.hash, actorUserId, invitationId, organizationId],
      );
      await this.notifications.recordEventWithClient(client, {
        organizationId,
        actorUserId,
        eventType: 'organization.invitation_resent',
        entityType: 'organization_invitation',
        entityId: invitationId,
        dedupeKey: `organization-invitation-resent:${prepared.hash}`,
        payload: { targetEmail: updated.rows[0].email, role: updated.rows[0].role },
      });
      return {
        kind: 'ok',
        invitation: { row: updated.rows[0], token: prepared.raw, tokenHash: prepared.hash },
      };
    });
  }

  async markDelivery(
    invitationId: number,
    tokenHash: string,
    sent: boolean,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE organization_invitations
       SET last_sent_at = CASE WHEN $3 THEN last_sent_at ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1 AND token_hash = $2 AND status = 'pending'`,
      [invitationId, tokenHash, sent],
    );
  }

  async revoke(actorUserId: number, organizationId: number, invitationId: number) {
    return this.transaction(async (client) => {
      const actor = await this.lockActor(client, actorUserId, organizationId);
      if (!actor) return { kind: 'forbidden' as const };
      const target = await client.query<{ role: string; email: string }>(
        `SELECT role,email FROM organization_invitations
         WHERE id = $1 AND organization_id = $2 AND status = 'pending'
         FOR UPDATE`,
        [invitationId, organizationId],
      );
      if (!target.rows[0]) return { kind: 'not_found' as const };
      if (actor === 'admin' && target.rows[0].role === 'admin') {
        return { kind: 'forbidden' as const };
      }
      await client.query(
        `UPDATE organization_invitations
         SET status = 'revoked', token_hash = NULL, revoked_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [invitationId],
      );
      await this.notifications.recordEventWithClient(client, {
        organizationId,
        actorUserId,
        eventType: 'organization.invitation_revoked',
        entityType: 'organization_invitation',
        entityId: invitationId,
        dedupeKey: `organization-invitation-revoked:${invitationId}`,
        payload: {
          targetEmail: target.rows[0].email,
          role: target.rows[0].role,
        },
      });
      return { kind: 'revoked' as const };
    });
  }

  async preview(tokenHash: string): Promise<OrganizationInvitationRow | null> {
    const result = await this.pool.query<OrganizationInvitationRow>(
      `SELECT ${invitationSelection}
       FROM organization_invitations invitation
       JOIN organizations organization ON organization.id = invitation.organization_id
       LEFT JOIN users inviter ON inviter.id = invitation.invited_by
       WHERE invitation.token_hash = $1 AND invitation.status = 'pending'`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  accept(userId: number, tokenHash: string): Promise<InvitationAcceptanceOutcome> {
    return this.transaction(async (client) => {
      const candidate = await client.query<{ organization_id: number | string }>(
        `SELECT organization_id FROM organization_invitations
         WHERE token_hash = $1 AND status = 'pending'`,
        [tokenHash],
      );
      if (!candidate.rows[0]) return { kind: 'not_found' };
      const organizationId = Number(candidate.rows[0].organization_id);
      const organization = await this.lockOrganization(client, organizationId);
      if (!organization) return { kind: 'not_found' };
      const invitation = await client.query<OrganizationInvitationRow>(
        `SELECT ${invitationSelection}
         FROM organization_invitations invitation
         JOIN organizations organization ON organization.id = invitation.organization_id
         LEFT JOIN users inviter ON inviter.id = invitation.invited_by
         WHERE invitation.token_hash = $1 AND invitation.organization_id = $2
           AND invitation.status = 'pending'
         FOR UPDATE OF invitation`,
        [tokenHash, organizationId],
      );
      const row = invitation.rows[0];
      if (!row) return { kind: 'not_found' };
      if (new Date(row.expires_at).getTime() <= Date.now()) return { kind: 'expired' };
      const user = await client.query<{ email: string }>(
        'SELECT email FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (!user.rows[0] || user.rows[0].email.toLowerCase() !== row.email.toLowerCase()) {
        return { kind: 'email_mismatch' };
      }
      const existing = await client.query(
        `SELECT 1 FROM organization_members
         WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, userId],
      );
      if (existing.rows[0]) return { kind: 'already_member' };
      const quota = await this.memberQuota(client, organizationId, organization);
      if (quota.limit >= 0 && quota.current >= quota.limit) {
        return { kind: 'limit_reached', ...quota };
      }
      const membership = await client.query<{ id: number | string }>(
        `INSERT INTO organization_members (
           organization_id, user_id, role, invited_by, invited_at, joined_at
         ) VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id`,
        [organizationId, userId, row.role, row.invited_by, row.invited_at],
      );
      await client.query(
        `UPDATE organization_invitations
         SET status = 'accepted', token_hash = NULL, accepted_at = NOW(),
             accepted_by = $1, updated_at = NOW()
         WHERE id = $2`,
        [userId, row.id],
      );
      await client.query(
        'UPDATE users SET default_organization_id = $1 WHERE id = $2',
        [organizationId, userId],
      );
      await this.notifications.recordEventWithClient(client, {
        organizationId,
        actorUserId: userId,
        eventType: 'organization.invitation_accepted',
        entityType: 'organization_member',
        entityId: Number(membership.rows[0].id),
        dedupeKey: `organization-invitation-accepted:${row.id}`,
        payload: { targetUserId: userId, targetEmail: row.email, role: row.role },
      });
      return {
        kind: 'ok',
        organizationId,
        organizationName: row.organization_name,
        role: row.role,
      };
    });
  }

  private async lockActor(client: PoolClient, userId: number, organizationId: number) {
    const result = await client.query<{ role: string }>(
      `SELECT role FROM organization_members
       WHERE organization_id = $1 AND user_id = $2
       FOR UPDATE`,
      [organizationId, userId],
    );
    const role = result.rows[0]?.role;
    return role && ['owner', 'admin'].includes(role) ? role : null;
  }

  private async lockOrganization(client: PoolClient, organizationId: number) {
    const result = await client.query<{
      name: string;
      plan: string | null;
      users_limit: number | null;
    }>(
      `SELECT name, plan, users_limit FROM organizations WHERE id = $1 FOR UPDATE`,
      [organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async quota(
    client: PoolClient,
    organizationId: number,
    organization: { plan: string | null; users_limit: number | null },
    excludeInvitationId?: number,
  ) {
    const result = await client.query<{ current: string }>(
      `SELECT (
         (SELECT COUNT(*) FROM organization_members WHERE organization_id = $1) +
         (SELECT COUNT(*) FROM organization_invitations
          WHERE organization_id = $1 AND status = 'pending' AND expires_at > NOW()
            AND ($2::int IS NULL OR id <> $2))
       )::text AS current`,
      [organizationId, excludeInvitationId ?? null],
    );
    return this.quotaValues(organization, Number(result.rows[0].current));
  }

  private async memberQuota(
    client: PoolClient,
    organizationId: number,
    organization: { plan: string | null; users_limit: number | null },
  ) {
    const result = await client.query<{ current: string }>(
      'SELECT COUNT(*)::text AS current FROM organization_members WHERE organization_id = $1',
      [organizationId],
    );
    return this.quotaValues(organization, Number(result.rows[0].current));
  }

  private quotaValues(
    organization: { plan: string | null; users_limit: number | null },
    current: number,
  ) {
    const fallback = organization.plan === 'starter'
      ? 3
      : organization.plan === 'unlimited'
        ? 10
        : organization.plan === 'pro'
          ? -1
          : 1;
    return {
      current,
      limit: organization.users_limit ?? fallback,
      plan: organization.plan ?? 'free',
    };
  }

  private token() {
    const raw = randomBytes(32).toString('hex');
    return { raw, hash: createHash('sha256').update(raw).digest('hex') };
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
