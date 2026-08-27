import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type OrganizationRow = {
  id: number | string;
  name: string;
  slug: string;
  settings: unknown;
  logo_url: string | null;
  role: string;
  is_default: boolean | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type OrganizationMemberRow = {
  id: number | string;
  organization_id: number | string;
  user_id: number | string;
  role: string;
  invited_at: Date | string;
  joined_at: Date | string | null;
  invited_by: number | string | null;
  user_name: string | null;
  email: string;
};

export type OrganizationAccessRole =
  | 'owner'
  | 'admin'
  | 'member'
  | 'viewer';

export type OrganizationAccessOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'forbidden' }
  | { kind: 'not_found' }
  | { kind: 'invalid_default_business' };

export type OrganizationCreateOutcome =
  | { kind: 'ok'; row: OrganizationRow }
  | { kind: 'not_found' }
  | { kind: 'limit_reached'; current: number; limit: number; plan: string };

export type OrganizationAllowanceRow = {
  ownedCount: number;
  limit: number;
  canCreate: boolean;
  sourcePlan: string;
};

export type OrganizationDeleteOutcome =
  | { kind: 'deleted' }
  | { kind: 'forbidden' }
  | { kind: 'not_found' }
  | { kind: 'evidence_retained' };

export type OrganizationMemberMutationOutcome =
  | { kind: 'ok'; row: OrganizationMemberRow }
  | { kind: 'forbidden' }
  | { kind: 'member_not_found' }
  | { kind: 'user_not_found' }
  | { kind: 'already_member' }
  | { kind: 'limit_reached'; current: number; limit: number; plan: string }
  | { kind: 'owner_immutable' }
  | { kind: 'admin_peer_forbidden' };

export type OrganizationMemberRemovalOutcome =
  | { kind: 'removed' }
  | { kind: 'forbidden' }
  | { kind: 'member_not_found' }
  | { kind: 'owner_immutable' }
  | { kind: 'admin_peer_forbidden' };

export type OrganizationOwnershipTransferOutcome =
  | { kind: 'ok'; row: OrganizationMemberRow }
  | { kind: 'forbidden' }
  | { kind: 'owner_required' }
  | { kind: 'member_not_found' }
  | { kind: 'ownership_unchanged' }
  | { kind: 'member_not_joined' }
  | { kind: 'limit_reached'; current: number; limit: number; plan: string };

export type OrganizationLeaveOutcome =
  | { kind: 'left' }
  | { kind: 'forbidden' }
  | { kind: 'owner_cannot_leave' };

type UserRow = {
  id: number | string;
  email: string;
  name: string | null;
  default_organization_id: number | string | null;
};

const organizationSelection = `
  o.id,
  o.name,
  o.slug,
  o.settings,
  o.logo_url,
  om.role,
  COALESCE(u.default_organization_id = o.id, false) AS is_default,
  o.created_at,
  o.updated_at`;

const organizationMemberSelection = `
  om.id,
  om.organization_id,
  om.user_id,
  om.role,
  om.invited_at,
  om.joined_at,
  om.invited_by,
  u.name AS user_name,
  u.email`;

@Injectable()
export class OrganizationsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listForUser(userId: number): Promise<OrganizationRow[]> {
    const result = await this.pool.query<OrganizationRow>(
      `SELECT ${organizationSelection}
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       JOIN users u ON u.id = om.user_id
       WHERE om.user_id = $1
       ORDER BY lower(o.name), o.id`,
      [userId],
    );
    return result.rows;
  }

  async findForUser(
    userId: number,
    organizationId: number,
  ): Promise<OrganizationRow | null> {
    const result = await this.pool.query<OrganizationRow>(
      `SELECT ${organizationSelection}
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       JOIN users u ON u.id = om.user_id
       WHERE om.user_id = $1 AND om.organization_id = $2`,
      [userId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  create(
    userId: number,
    values: { name: string; settings: Record<string, unknown> },
  ): Promise<OrganizationCreateOutcome> {
    return this.transaction(async (client) => {
      const user = await client.query<{ id: number }>(
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (!user.rows[0]) return { kind: 'not_found' };

      const allowance = await this.allowanceWithClient(client, userId);
      if (!allowance.canCreate) {
        return {
          kind: 'limit_reached',
          current: allowance.ownedCount,
          limit: allowance.limit,
          plan: allowance.sourcePlan,
        };
      }

      const slug = `${this.slugBase(values.name)}-${randomBytes(4).toString('hex')}`;
      const created = await client.query<OrganizationRow>(
        `INSERT INTO organizations (
           name, slug, settings, plan, subscription_status,
           emails_limit, sms_limit, api_calls_limit, contacts_limit,
           users_limit, workflows_limit, landing_pages_limit, forms_limit,
           calendars_limit
         ) VALUES (
           $1, $2, $3::jsonb, 'free', 'none',
           0, 0, 0, 0, 1, 0, 0, 0, 0
         )
         RETURNING
           id, name, slug, settings, logo_url,
           'owner'::text AS role,
           false AS is_default,
           created_at, updated_at`,
        [values.name, slug, JSON.stringify(values.settings)],
      );
      const organization = created.rows[0];
      await client.query(
        `INSERT INTO organization_members (
           organization_id, user_id, role, joined_at
         ) VALUES ($1, $2, 'owner', NOW())`,
        [organization.id, userId],
      );
      const selected = await client.query<{ selected: boolean }>(
        `UPDATE users
         SET default_organization_id = $1
         WHERE id = $2 AND default_organization_id IS NULL
         RETURNING true AS selected`,
        [organization.id, userId],
      );
      return {
        kind: 'ok',
        row: {
          ...organization,
          is_default: selected.rows[0]?.selected === true,
        },
      };
    });
  }

  async organizationAllowance(
    userId: number,
  ): Promise<OrganizationAllowanceRow | null> {
    const user = await this.pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!user.rows[0]) return null;
    return this.allowanceWithClient(this.pool, userId);
  }

  update(
    userId: number,
    organizationId: number,
    values: {
      name?: string;
      settings?: Record<string, unknown>;
      logoUrl?: string | null;
    },
  ): Promise<OrganizationAccessOutcome<OrganizationRow>> {
    return this.transaction(async (client) => {
      const membership = await this.lockMembership(
        client,
        userId,
        organizationId,
      );
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return { kind: 'forbidden' };
      }
      const current = await client.query<OrganizationRow>(
        `SELECT ${organizationSelection}
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         JOIN users u ON u.id = om.user_id
         WHERE om.user_id = $1 AND om.organization_id = $2
         FOR UPDATE OF o`,
        [userId, organizationId],
      );
      if (!current.rows[0]) return { kind: 'not_found' };
      const row = current.rows[0];
      const settings = values.settings ?? this.record(row.settings);
      const defaultBusinessId = settings.defaultBusinessId;
      if (defaultBusinessId !== undefined && defaultBusinessId !== null) {
        const business = await client.query(
          `SELECT id FROM businesses
           WHERE id = $1 AND organization_id = $2 AND is_active = TRUE
           FOR SHARE`,
          [defaultBusinessId, organizationId],
        );
        if (!business.rows[0]) return { kind: 'invalid_default_business' };
      }
      const updated = await client.query<OrganizationRow>(
        `UPDATE organizations
         SET name = $1,
             settings = $2::jsonb,
             logo_url = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING
           id, name, slug, settings, logo_url,
           $5::text AS role,
           $6::boolean AS is_default,
           created_at, updated_at`,
        [
          values.name ?? row.name,
          JSON.stringify(settings),
          values.logoUrl === undefined ? row.logo_url : values.logoUrl,
          organizationId,
          membership.role,
          row.is_default === true,
        ],
      );
      return { kind: 'ok', value: updated.rows[0] };
    });
  }

  delete(
    userId: number,
    organizationId: number,
  ): Promise<OrganizationDeleteOutcome> {
    return this.transaction(async (client) => {
      const membership = await this.lockMembership(
        client,
        userId,
        organizationId,
      );
      if (!membership || membership.role !== 'owner') {
        return { kind: 'forbidden' };
      }
      const organization = await client.query(
        'SELECT id FROM organizations WHERE id = $1 FOR UPDATE',
        [organizationId],
      );
      if (!organization.rows[0]) return { kind: 'not_found' };
      const documents = await client.query<{ status: string }>(
        `SELECT status FROM signature_documents
         WHERE organization_id = $1
         ORDER BY id FOR UPDATE`,
        [organizationId],
      );
      if (documents.rows.some((document) => document.status !== 'draft')) {
        return { kind: 'evidence_retained' };
      }
      await client.query(
        `INSERT INTO signature_file_deletion_jobs
           (organization_id, document_id, file_url)
         SELECT $1, NULL, file_url FROM (
           SELECT file_url FROM signature_documents
           WHERE organization_id = $1
           UNION
           SELECT signed_file_url AS file_url FROM signature_documents
           WHERE organization_id = $1
           UNION
           SELECT version.file_url
           FROM signature_document_versions version
           JOIN signature_documents document ON document.id = version.document_id
           WHERE document.organization_id = $1
           UNION
           SELECT file_url FROM signature_templates
           WHERE organization_id = $1
         ) files
         WHERE file_url IS NOT NULL
         ON CONFLICT (organization_id, file_url) DO UPDATE SET
           document_id = NULL,
           status = CASE
             WHEN signature_file_deletion_jobs.status IN ('deleted', 'dead_letter')
             THEN 'queued' ELSE signature_file_deletion_jobs.status END,
           next_attempt_at = CASE
             WHEN signature_file_deletion_jobs.status IN ('deleted', 'dead_letter')
             THEN CURRENT_TIMESTAMP ELSE signature_file_deletion_jobs.next_attempt_at END,
           deleted_at = CASE
             WHEN signature_file_deletion_jobs.status IN ('deleted', 'dead_letter')
             THEN NULL ELSE signature_file_deletion_jobs.deleted_at END,
           last_error = CASE
             WHEN signature_file_deletion_jobs.status IN ('deleted', 'dead_letter')
             THEN NULL ELSE signature_file_deletion_jobs.last_error END,
           updated_at = CURRENT_TIMESTAMP`,
        [organizationId],
      );
      await client.query('DELETE FROM organizations WHERE id = $1', [
        organizationId,
      ]);
      return { kind: 'deleted' };
    });
  }

  selectForUser(
    userId: number,
    organizationId: number,
  ): Promise<OrganizationRow | null> {
    return this.transaction(async (client) => {
      const user = await client.query(
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (!user.rows[0]) return null;

      const organization = await client.query<OrganizationRow>(
        `SELECT ${organizationSelection}
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         JOIN users u ON u.id = om.user_id
         WHERE om.user_id = $1 AND om.organization_id = $2
         FOR SHARE OF om, o`,
        [userId, organizationId],
      );
      if (!organization.rows[0]) return null;

      await client.query(
        `UPDATE users
         SET default_organization_id = $1
         WHERE id = $2`,
        [organizationId, userId],
      );
      return { ...organization.rows[0], is_default: true };
    });
  }

  ensureDefaultForUser(userId: number): Promise<OrganizationRow | null> {
    return this.transaction(async (client) => {
      const userResult = await client.query<UserRow>(
        `SELECT id, email, name, default_organization_id
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [userId],
      );
      const user = userResult.rows[0];
      if (!user) return null;

      const existing = await client.query<OrganizationRow>(
        `SELECT ${organizationSelection}
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         JOIN users u ON u.id = om.user_id
         WHERE om.user_id = $1
         ORDER BY
           (u.default_organization_id = o.id) DESC NULLS LAST,
           o.id
         LIMIT 1
         FOR SHARE OF om, o`,
        [userId],
      );
      if (existing.rows[0]) {
        const selected = existing.rows[0];
        await client.query(
          `UPDATE users
           SET default_organization_id = $1
           WHERE id = $2
             AND default_organization_id IS DISTINCT FROM $1`,
          [selected.id, userId],
        );
        return { ...selected, is_default: true };
      }

      const fallbackName = user.email.split('@')[0] || 'Personal';
      const displayName = user.name?.trim() || fallbackName;
      const organizationName = `${displayName.slice(0, 90)}'s Workspace`;
      const slug = `${this.slugBase(organizationName)}-${randomBytes(4).toString('hex')}`;
      const created = await client.query<OrganizationRow>(
        `INSERT INTO organizations (
           name, slug, settings, plan, subscription_status,
           emails_limit, sms_limit, api_calls_limit, contacts_limit,
           users_limit, workflows_limit, landing_pages_limit, forms_limit,
           calendars_limit
         ) VALUES (
           $1, $2, '{"personal":true}'::jsonb, 'free', 'none',
           0, 0, 0, 0, 1, 0, 0, 0, 0
         )
         RETURNING
           id,
           name,
           slug,
           settings,
           logo_url,
           'owner'::text AS role,
           true AS is_default,
           created_at,
           updated_at`,
        [organizationName, slug],
      );
      const organization = created.rows[0];
      await client.query(
        `INSERT INTO organization_members (
           organization_id, user_id, role, joined_at
         ) VALUES ($1, $2, 'owner', NOW())`,
        [organization.id, userId],
      );
      await client.query(
        `UPDATE users
         SET default_organization_id = $1
         WHERE id = $2`,
        [organization.id, userId],
      );
      return organization;
    });
  }

  listMembers(
    userId: number,
    organizationId: number,
  ): Promise<OrganizationAccessOutcome<OrganizationMemberRow[]>> {
    return this.transaction(async (client) => {
      const access = await this.lockMembership(
        client,
        userId,
        organizationId,
      );
      if (!access) return { kind: 'forbidden' };
      const members = await client.query<OrganizationMemberRow>(
        `SELECT ${organizationMemberSelection}
         FROM organization_members om
         JOIN users u ON u.id = om.user_id
         WHERE om.organization_id = $1
         ORDER BY
           CASE om.role
             WHEN 'owner' THEN 0
             WHEN 'admin' THEN 1
             WHEN 'member' THEN 2
             ELSE 3
           END,
           lower(COALESCE(u.name, u.email)),
           om.id`,
        [organizationId],
      );
      return { kind: 'ok', value: members.rows };
    });
  }

  addMember(
    actorUserId: number,
    organizationId: number,
    values: { email: string; role: OrganizationAccessRole },
  ): Promise<OrganizationMemberMutationOutcome> {
    return this.transaction(async (client) => {
      const actor = await this.lockMembership(
        client,
        actorUserId,
        organizationId,
      );
      if (!actor || !['owner', 'admin'].includes(actor.role)) {
        return { kind: 'forbidden' };
      }
      if (actor.role === 'admin' && values.role === 'admin') {
        return { kind: 'admin_peer_forbidden' };
      }
      const user = await client.query<{ id: number }>(
        `SELECT id FROM users
         WHERE lower(email) = lower($1)
         ORDER BY id
         LIMIT 1
         FOR SHARE`,
        [values.email],
      );
      if (!user.rows[0]) return { kind: 'user_not_found' };
      const existing = await client.query(
        `SELECT id FROM organization_members
         WHERE organization_id = $1 AND user_id = $2
         FOR UPDATE`,
        [organizationId, user.rows[0].id],
      );
      if (existing.rows[0]) return { kind: 'already_member' };
      const quota = await client.query<{
        plan: string | null;
        users_limit: number | null;
        current: string;
      }>(
        `SELECT o.plan, o.users_limit,
                ((SELECT COUNT(*)
                  FROM organization_members member
                  WHERE member.organization_id = o.id) +
                 (SELECT COUNT(*)
                  FROM organization_invitations invitation
                  WHERE invitation.organization_id = o.id
                    AND invitation.status = 'pending'
                    AND invitation.expires_at > NOW()))::text AS current
         FROM organizations o
         WHERE o.id = $1
         FOR UPDATE`,
        [organizationId],
      );
      const quotaRow = quota.rows[0];
      if (!quotaRow) return { kind: 'forbidden' };
      const fallbackLimit = quotaRow.plan === 'starter'
        ? 3
        : quotaRow.plan === 'unlimited'
          ? 10
          : quotaRow.plan === 'pro'
            ? -1
            : 1;
      const limit = quotaRow.users_limit ?? fallbackLimit;
      const current = Number(quotaRow.current);
      if (limit >= 0 && current >= limit) {
        return {
          kind: 'limit_reached',
          current,
          limit,
          plan: quotaRow.plan ?? 'free',
        };
      }
      const inserted = await client.query<OrganizationMemberRow>(
        `WITH inserted AS (
           INSERT INTO organization_members (
             organization_id, user_id, role, invited_by, joined_at
           ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           RETURNING *
         )
         SELECT
           inserted.id,
           inserted.organization_id,
           inserted.user_id,
           inserted.role,
           inserted.invited_at,
           inserted.joined_at,
           inserted.invited_by,
           u.name AS user_name,
           u.email
         FROM inserted
         JOIN users u ON u.id = inserted.user_id`,
        [organizationId, user.rows[0].id, values.role, actorUserId],
      );
      return { kind: 'ok', row: inserted.rows[0] };
    });
  }

  updateMemberRole(
    actorUserId: number,
    organizationId: number,
    memberId: number,
    role: OrganizationAccessRole,
  ): Promise<OrganizationMemberMutationOutcome> {
    return this.transaction(async (client) => {
      const actor = await this.lockMembership(
        client,
        actorUserId,
        organizationId,
      );
      if (!actor || !['owner', 'admin'].includes(actor.role)) {
        return { kind: 'forbidden' };
      }
      const target = await client.query<OrganizationMemberRow>(
        `SELECT ${organizationMemberSelection}
         FROM organization_members om
         JOIN users u ON u.id = om.user_id
         WHERE om.id = $1 AND om.organization_id = $2
         FOR UPDATE OF om`,
        [memberId, organizationId],
      );
      if (!target.rows[0]) return { kind: 'member_not_found' };
      if (target.rows[0].role === 'owner') {
        return { kind: 'owner_immutable' };
      }
      if (
        actor.role === 'admin' &&
        (target.rows[0].role === 'admin' || role === 'admin')
      ) {
        return { kind: 'admin_peer_forbidden' };
      }
      const updated = await client.query<OrganizationMemberRow>(
        `WITH updated AS (
           UPDATE organization_members
           SET role = $1
           WHERE id = $2 AND organization_id = $3
           RETURNING *
         )
         SELECT
           updated.id,
           updated.organization_id,
           updated.user_id,
           updated.role,
           updated.invited_at,
           updated.joined_at,
           updated.invited_by,
           u.name AS user_name,
           u.email
         FROM updated
         JOIN users u ON u.id = updated.user_id`,
        [role, memberId, organizationId],
      );
      return { kind: 'ok', row: updated.rows[0] };
    });
  }

  transferOwnership(
    actorUserId: number,
    organizationId: number,
    memberId: number,
  ): Promise<OrganizationOwnershipTransferOutcome> {
    return this.transaction(async (client) => {
      const actor = await this.lockMembership(
        client,
        actorUserId,
        organizationId,
      );
      if (!actor) return { kind: 'forbidden' };
      if (actor.role !== 'owner') return { kind: 'owner_required' };

      const target = await client.query<OrganizationMemberRow>(
        `SELECT ${organizationMemberSelection}
         FROM organization_members om
         JOIN users u ON u.id = om.user_id
         WHERE om.id = $1 AND om.organization_id = $2
         FOR UPDATE OF om`,
        [memberId, organizationId],
      );
      const targetRow = target.rows[0];
      if (!targetRow) return { kind: 'member_not_found' };
      if (Number(targetRow.user_id) === actorUserId || targetRow.role === 'owner') {
        return { kind: 'ownership_unchanged' };
      }
      if (!targetRow.joined_at) return { kind: 'member_not_joined' };

      await client.query(
        `SELECT id FROM users
         WHERE id = ANY($1::int[])
         ORDER BY id
         FOR UPDATE`,
        [[actorUserId, Number(targetRow.user_id)]],
      );
      const allowance = await this.allowanceWithClient(
        client,
        Number(targetRow.user_id),
        organizationId,
      );
      if (allowance.limit >= 0 && allowance.ownedCount > allowance.limit) {
        return {
          kind: 'limit_reached',
          current: allowance.ownedCount,
          limit: allowance.limit,
          plan: allowance.sourcePlan,
        };
      }

      // The partial unique-owner index is immediate, so release the current
      // owner slot before assigning it. Both writes remain invisible until
      // this transaction commits.
      await client.query(
        `UPDATE organization_members
         SET role = 'admin'
         WHERE organization_id = $1 AND user_id = $2 AND role = 'owner'`,
        [organizationId, actorUserId],
      );
      await client.query(
        `UPDATE organization_members
         SET role = 'owner'
         WHERE organization_id = $1 AND id = $2`,
        [organizationId, memberId],
      );
      return { kind: 'ok', row: { ...targetRow, role: 'owner' } };
    });
  }

  removeMember(
    actorUserId: number,
    organizationId: number,
    memberId: number,
  ): Promise<OrganizationMemberRemovalOutcome> {
    return this.transaction(async (client) => {
      const actor = await this.lockMembership(
        client,
        actorUserId,
        organizationId,
      );
      if (!actor || !['owner', 'admin'].includes(actor.role)) {
        return { kind: 'forbidden' };
      }
      const target = await client.query<{ role: string; user_id: number }>(
        `SELECT role, user_id
         FROM organization_members
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [memberId, organizationId],
      );
      if (!target.rows[0]) return { kind: 'member_not_found' };
      if (target.rows[0].role === 'owner') {
        return { kind: 'owner_immutable' };
      }
      if (actor.role === 'admin' && target.rows[0].role === 'admin') {
        return { kind: 'admin_peer_forbidden' };
      }
      await client.query(
        `DELETE FROM organization_members
         WHERE id = $1 AND organization_id = $2`,
        [memberId, organizationId],
      );
      await this.repairDefaultOrganization(
        client,
        Number(target.rows[0].user_id),
        organizationId,
      );
      return { kind: 'removed' };
    });
  }

  leave(
    userId: number,
    organizationId: number,
  ): Promise<OrganizationLeaveOutcome> {
    return this.transaction(async (client) => {
      const membership = await this.lockMembership(
        client,
        userId,
        organizationId,
      );
      if (!membership) return { kind: 'forbidden' };
      if (membership.role === 'owner') return { kind: 'owner_cannot_leave' };
      await client.query(
        `DELETE FROM organization_members
         WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, userId],
      );
      await this.repairDefaultOrganization(client, userId, organizationId);
      return { kind: 'left' };
    });
  }

  private slugBase(value: string): string {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 220) || 'workspace'
    );
  }

  private async allowanceWithClient(
    queryable: Pick<Pool, 'query'> | Pick<PoolClient, 'query'>,
    userId: number,
    includeOrganizationId?: number,
  ): Promise<OrganizationAllowanceRow> {
    const result = await queryable.query<{
      id: number | string;
      plan: string | null;
      subscription_status: string | null;
      trial_ends_at: Date | string | null;
    }>(
      `SELECT DISTINCT
         o.id, o.plan, o.subscription_status, o.trial_ends_at
       FROM organizations o
       WHERE EXISTS (
         SELECT 1 FROM organization_members owner
         WHERE owner.organization_id = o.id
           AND owner.user_id = $1
           AND owner.role = 'owner'
       ) OR ($2::int IS NOT NULL AND o.id = $2)
       ORDER BY o.id`,
      [userId, includeOrganizationId ?? null],
    );
    let sourcePlan = 'free';
    let limit = 1;
    for (const organization of result.rows) {
      const trialEnd = organization.trial_ends_at
        ? new Date(organization.trial_ends_at).getTime()
        : 0;
      const live = organization.subscription_status === 'active' || (
        organization.subscription_status === 'trialing' && trialEnd > Date.now()
      );
      if (!live) continue;
      if (organization.plan === 'unlimited' || organization.plan === 'pro') {
        sourcePlan = organization.plan;
        limit = -1;
        break;
      }
      if (organization.plan === 'starter') {
        sourcePlan = 'starter';
        limit = 3;
      }
    }
    const ownedCount = result.rows.length;
    return {
      ownedCount,
      limit,
      canCreate: limit < 0 || ownedCount < limit,
      sourcePlan,
    };
  }

  private record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private async lockMembership(
    client: PoolClient,
    userId: number,
    organizationId: number,
  ): Promise<{ role: string } | null> {
    const result = await client.query<{ role: string }>(
      `SELECT role
       FROM organization_members
       WHERE organization_id = $1 AND user_id = $2
       FOR UPDATE`,
      [organizationId, userId],
    );
    return result.rows[0] ?? null;
  }

  private async repairDefaultOrganization(
    client: PoolClient,
    userId: number,
    removedOrganizationId: number,
  ): Promise<void> {
    await client.query(
      `UPDATE users
       SET default_organization_id = (
         SELECT organization_id
         FROM organization_members
         WHERE user_id = $1
         ORDER BY organization_id
         LIMIT 1
       )
       WHERE id = $1 AND default_organization_id = $2`,
      [userId, removedOrganizationId],
    );
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
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
