import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  AddOrganizationMemberInput,
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from './organization.inputs';
import {
  Organization,
  OrganizationActivity,
  OrganizationAllowance,
  OrganizationMember,
} from './organization.types';
import { OrganizationOwnershipEmailService } from './organization-ownership-email.service';
import {
  OrganizationActivityRow,
  OrganizationAccessRole,
  OrganizationMemberRow,
  OrganizationRow,
  OrganizationsRepository,
} from './organizations.repository';
import {
  organizationMutationFingerprint,
  organizationMutationKey,
} from './organization-mutation.idempotency';

const MEMBER_ROLES: OrganizationAccessRole[] = ['admin', 'member', 'viewer'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly organizations: OrganizationsRepository,
    private readonly ownershipEmail: OrganizationOwnershipEmailService,
  ) {}

  async list(userId: number): Promise<Organization[]> {
    try {
      return (await this.organizations.listForUser(userId)).map(this.map);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async get(userId: number, organizationId: number): Promise<Organization> {
    this.id(organizationId);
    try {
      const organization = await this.organizations.findForUser(
        userId,
        organizationId,
      );
      if (!organization) {
        throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
      }
      return this.map(organization);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async create(
    userId: number,
    input: CreateOrganizationInput,
    idempotencyKey: string,
  ): Promise<Organization> {
    const name = this.name(input.name);
    const settings = this.settingsInput(input.settings ?? {});
    try {
      const values = { name, settings };
      const outcome = await this.organizations.create(
        userId,
        values,
        organizationMutationKey(idempotencyKey),
        organizationMutationFingerprint('create_organization', values),
      );
      if (outcome.kind === 'not_found') {
        throw itemizeGraphqlError('User not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'limit_reached') {
        throw itemizeGraphqlError(
          `You've reached your organization ownership limit (${outcome.current}/${outcome.limit}). Upgrade an owned organization or transfer ownership to create another.`,
          'FORBIDDEN',
          {
            reason: 'ORGANIZATION_LIMIT_REACHED',
            current: outcome.current,
            limit: outcome.limit,
            plan: outcome.plan,
          },
        );
      }
      if (outcome.kind === 'idempotency_conflict') {
        throw itemizeGraphqlError(
          'idempotencyKey was already used for a different organization creation request',
          'CONFLICT',
          { field: 'idempotencyKey', reason: 'IDEMPOTENCY_KEY_REUSED' },
        );
      }
      if (outcome.kind === 'result_unavailable') {
        throw itemizeGraphqlError(
          'The organization created by this request is no longer available',
          'CONFLICT',
          { field: 'idempotencyKey', reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE' },
        );
      }
      return this.map(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async allowance(userId: number): Promise<OrganizationAllowance> {
    try {
      const allowance = await this.organizations.organizationAllowance(userId);
      if (!allowance) throw itemizeGraphqlError('User not found', 'NOT_FOUND');
      return allowance;
    } catch (error) {
      this.rethrow(error);
    }
  }

  async activity(
    userId: number,
    organizationId: number,
    first = 20,
  ): Promise<OrganizationActivity[]> {
    this.id(organizationId);
    if (!Number.isInteger(first) || first < 1 || first > 50) {
      throw itemizeGraphqlError(
        'first must be between 1 and 50',
        'BAD_USER_INPUT',
        { field: 'first' },
      );
    }
    try {
      const outcome = await this.organizations.listActivity(
        userId,
        organizationId,
        first,
      );
      if (outcome.kind !== 'ok') {
        throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
      }
      return outcome.value.map(this.mapActivity);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async update(
    userId: number,
    organizationId: number,
    input: UpdateOrganizationInput,
  ): Promise<Organization> {
    this.id(organizationId);
    if (
      input.name === undefined &&
      input.settings === undefined &&
      input.logoUrl === undefined
    ) {
      throw itemizeGraphqlError(
        'Organization update must include at least one field',
        'BAD_USER_INPUT',
        { reason: 'EMPTY_ORGANIZATION_UPDATE' },
      );
    }
    if (input.name === null || input.settings === null) {
      throw itemizeGraphqlError(
        'Organization name and settings cannot be null',
        'BAD_USER_INPUT',
        { reason: 'NULL_ORGANIZATION_FIELD' },
      );
    }
    const values = {
      ...(input.name !== undefined ? { name: this.name(input.name) } : {}),
      ...(input.settings !== undefined
        ? { settings: this.settingsInput(input.settings) }
        : {}),
      ...(input.logoUrl !== undefined
        ? { logoUrl: this.logoUrl(input.logoUrl) }
        : {}),
    };
    try {
      const outcome = await this.organizations.update(
        userId,
        organizationId,
        values,
      );
      if (outcome.kind === 'forbidden') {
        throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'not_found') {
        throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'invalid_default_business') {
        throw itemizeGraphqlError(
          'Default business profile is not available in this organization',
          'BAD_USER_INPUT',
          { field: 'settings.defaultBusinessId', reason: 'INVALID_DEFAULT_BUSINESS' },
        );
      }
      return this.map(outcome.value);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(userId: number, organizationId: number): Promise<number> {
    this.id(organizationId);
    try {
      const outcome = await this.organizations.delete(userId, organizationId);
      if (outcome.kind === 'forbidden' || outcome.kind === 'not_found') {
        throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'evidence_retained') {
        throw itemizeGraphqlError(
          'Organization contains retained signature evidence',
          'CONFLICT',
          { reason: 'SIGNATURE_EVIDENCE_RETAINED' },
        );
      }
      return organizationId;
    } catch (error) {
      this.rethrow(error);
    }
  }

  async members(
    userId: number,
    organizationId: number,
  ): Promise<OrganizationMember[]> {
    this.id(organizationId);
    try {
      const outcome = await this.organizations.listMembers(
        userId,
        organizationId,
      );
      if (outcome.kind !== 'ok') {
        throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
      }
      return outcome.value.map(this.mapMember);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async addMember(
    userId: number,
    organizationId: number,
    input: AddOrganizationMemberInput,
  ): Promise<OrganizationMember> {
    this.id(organizationId);
    const email = this.email(input.email);
    const role = this.memberRole(input.role);
    try {
      const outcome = await this.organizations.addMember(userId, organizationId, {
        email,
        role,
      });
      if (outcome.kind === 'forbidden') {
        throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'user_not_found') {
        throw itemizeGraphqlError('User not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'already_member') {
        throw itemizeGraphqlError(
          'User is already a member of this organization',
          'BAD_USER_INPUT',
          { field: 'email', reason: 'ALREADY_MEMBER' },
        );
      }
      if (outcome.kind === 'limit_reached') {
        throw itemizeGraphqlError(
          `You've reached your team member limit (${outcome.current}/${outcome.limit}). Please upgrade your plan.`,
          'FORBIDDEN',
          {
            reason: 'PLAN_LIMIT_REACHED',
            current: outcome.current,
            limit: outcome.limit,
            plan: outcome.plan,
          },
        );
      }
      if (outcome.kind !== 'ok') {
        throw itemizeGraphqlError('Member cannot be added', 'FORBIDDEN');
      }
      return this.mapMember(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async updateMemberRole(
    userId: number,
    organizationId: number,
    memberId: number,
    roleValue: string,
  ): Promise<OrganizationMember> {
    this.id(organizationId);
    this.memberId(memberId);
    const role = this.memberRole(roleValue);
    try {
      const outcome = await this.organizations.updateMemberRole(
        userId,
        organizationId,
        memberId,
        role,
      );
      return this.memberMutationOutcome(outcome);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async removeMember(
    userId: number,
    organizationId: number,
    memberId: number,
  ): Promise<number> {
    this.id(organizationId);
    this.memberId(memberId);
    try {
      const outcome = await this.organizations.removeMember(
        userId,
        organizationId,
        memberId,
      );
      if (outcome.kind === 'removed') return memberId;
      this.memberFailure(outcome.kind);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async transferOwnership(
    userId: number,
    organizationId: number,
    memberId: number,
  ): Promise<OrganizationMember> {
    this.id(organizationId);
    this.memberId(memberId);
    try {
      const outcome = await this.organizations.transferOwnership(
        userId,
        organizationId,
        memberId,
      );
      if (outcome.kind === 'ok') {
        await this.ownershipEmail.send(outcome.delivery);
        return this.mapMember(outcome.row);
      }
      if (outcome.kind === 'forbidden' || outcome.kind === 'member_not_found') {
        throw itemizeGraphqlError('Organization member not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'owner_required') {
        throw itemizeGraphqlError(
          'Only the organization owner can transfer ownership',
          'FORBIDDEN',
          { reason: 'OWNER_REQUIRED' },
        );
      }
      if (outcome.kind === 'ownership_unchanged') {
        throw itemizeGraphqlError(
          'Choose another organization member as the new owner',
          'BAD_USER_INPUT',
          { reason: 'OWNERSHIP_UNCHANGED' },
        );
      }
      if (outcome.kind === 'limit_reached') {
        throw itemizeGraphqlError(
          `The new owner would exceed their organization ownership limit (${outcome.current}/${outcome.limit}).`,
          'FORBIDDEN',
          {
            reason: 'ORGANIZATION_LIMIT_REACHED',
            current: outcome.current,
            limit: outcome.limit,
            plan: outcome.plan,
          },
        );
      }
      throw itemizeGraphqlError(
        'The new owner must have joined the organization',
        'BAD_USER_INPUT',
        { reason: 'MEMBER_NOT_JOINED' },
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async leave(userId: number, organizationId: number): Promise<boolean> {
    this.id(organizationId);
    try {
      const outcome = await this.organizations.leave(userId, organizationId);
      if (outcome.kind === 'left') return true;
      if (outcome.kind === 'owner_cannot_leave') {
        throw itemizeGraphqlError(
          'Owner cannot leave the organization',
          'FORBIDDEN',
          { reason: 'OWNER_CANNOT_LEAVE' },
        );
      }
      throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
    } catch (error) {
      this.rethrow(error);
    }
  }

  async select(
    userId: number,
    organizationId: number,
  ): Promise<Organization> {
    this.id(organizationId);
    try {
      const selected = await this.organizations.selectForUser(
        userId,
        organizationId,
      );
      if (!selected) {
        throw itemizeGraphqlError(
          'Organization access is forbidden',
          'FORBIDDEN',
        );
      }
      return this.map(selected);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async ensureDefault(userId: number): Promise<Organization> {
    try {
      const organization =
        await this.organizations.ensureDefaultForUser(userId);
      if (!organization) {
        throw itemizeGraphqlError('User not found', 'NOT_FOUND');
      }
      return this.map(organization);
    } catch (error) {
      this.rethrow(error);
    }
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'Organization ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_ORGANIZATION_ID' },
      );
    }
  }

  private memberId(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'Member ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'memberId', reason: 'INVALID_MEMBER_ID' },
      );
    }
  }

  private name(value: string): string {
    const name = value?.trim();
    if (!name || name.length > 255) {
      throw itemizeGraphqlError(
        'Organization name must contain between 1 and 255 characters',
        'BAD_USER_INPUT',
        { field: 'name', reason: 'INVALID_ORGANIZATION_NAME' },
      );
    }
    return name;
  }

  private email(value: string): string {
    const email = value?.trim().toLowerCase();
    if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
      throw itemizeGraphqlError('A valid email is required', 'BAD_USER_INPUT', {
        field: 'email',
        reason: 'INVALID_EMAIL',
      });
    }
    return email;
  }

  private memberRole(value: string): OrganizationAccessRole {
    if (!MEMBER_ROLES.includes(value as OrganizationAccessRole)) {
      throw itemizeGraphqlError(
        'Role must be admin, member, or viewer',
        'BAD_USER_INPUT',
        { field: 'role', reason: 'INVALID_ORGANIZATION_ROLE' },
      );
    }
    return value as OrganizationAccessRole;
  }

  private logoUrl(value: string | null): string | null {
    if (value === null) return null;
    const logoUrl = value.trim();
    if (logoUrl.length > 500) {
      throw itemizeGraphqlError(
        'Organization logo URL cannot exceed 500 characters',
        'BAD_USER_INPUT',
        { field: 'logoUrl', reason: 'INVALID_LOGO_URL' },
      );
    }
    return logoUrl || null;
  }

  private settingsInput(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw itemizeGraphqlError(
        'Organization settings must be an object',
        'BAD_USER_INPUT',
        { field: 'settings', reason: 'INVALID_SETTINGS' },
      );
    }
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > 64 * 1024) {
      throw itemizeGraphqlError(
        'Organization settings cannot exceed 64 KiB',
        'BAD_USER_INPUT',
        { field: 'settings', reason: 'SETTINGS_TOO_LARGE' },
      );
    }
    const settings = value as Record<string, unknown>;
    this.organizationPreference(settings, 'timezone', (candidate) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
        return true;
      } catch {
        return false;
      }
    });
    this.organizationPreference(settings, 'locale', (candidate) => {
      try {
        return Intl.getCanonicalLocales(candidate).length === 1;
      } catch {
        return false;
      }
    });
    const defaultBusinessId = settings.defaultBusinessId;
    if (
      defaultBusinessId !== undefined &&
      defaultBusinessId !== null &&
      (!Number.isSafeInteger(defaultBusinessId) || Number(defaultBusinessId) < 1)
    ) {
      throw itemizeGraphqlError(
        'Default business profile must be a positive integer or null',
        'BAD_USER_INPUT',
        { field: 'settings.defaultBusinessId', reason: 'INVALID_DEFAULT_BUSINESS' },
      );
    }
    return settings;
  }

  private organizationPreference(
    settings: Record<string, unknown>,
    field: 'timezone' | 'locale',
    valid: (candidate: string) => boolean,
  ): void {
    const value = settings[field];
    if (value === undefined) return;
    if (
      typeof value !== 'string' ||
      value.length < 1 ||
      value.length > 64 ||
      !valid(value)
    ) {
      throw itemizeGraphqlError(
        `Organization ${field} is invalid`,
        'BAD_USER_INPUT',
        { field: `settings.${field}`, reason: `INVALID_ORGANIZATION_${field.toUpperCase()}` },
      );
    }
  }

  private readonly map = (row: OrganizationRow): Organization => ({
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    settings: this.settings(row.settings),
    logoUrl: row.logo_url,
    role: row.role,
    isDefault: row.is_default === true,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

  private readonly mapMember = (
    row: OrganizationMemberRow,
  ): OrganizationMember => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    userId: Number(row.user_id),
    role: row.role,
    invitedAt: new Date(row.invited_at),
    joinedAt: row.joined_at ? new Date(row.joined_at) : null,
    invitedBy: row.invited_by === null ? null : Number(row.invited_by),
    userName: row.user_name,
    email: row.email,
  });

  private readonly mapActivity = (
    row: OrganizationActivityRow,
  ): OrganizationActivity => ({
    id: String(row.id),
    organizationId: Number(row.organization_id),
    eventType: row.event_type,
    actorUserId: row.actor_user_id === null ? null : Number(row.actor_user_id),
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    targetUserId: row.target_user_id === null ? null : Number(row.target_user_id),
    targetName: row.target_name,
    targetEmail: row.target_email ?? this.activityTargetEmail(row.payload),
    payload: this.settings(row.payload),
    occurredAt: new Date(row.occurred_at),
  });

  private activityTargetEmail(payload: unknown): string | null {
    const targetEmail = this.settings(payload).targetEmail;
    return typeof targetEmail === 'string' ? targetEmail : null;
  }

  private memberMutationOutcome(
    outcome: Awaited<
      ReturnType<OrganizationsRepository['updateMemberRole']>
    >,
  ): OrganizationMember {
    if (outcome.kind === 'ok') return this.mapMember(outcome.row);
    this.memberFailure(outcome.kind);
  }

  private memberFailure(kind: string): never {
    if (kind === 'member_not_found' || kind === 'forbidden') {
      throw itemizeGraphqlError('Organization member not found', 'NOT_FOUND');
    }
    if (kind === 'owner_immutable') {
      throw itemizeGraphqlError(
        'The organization owner cannot be changed or removed',
        'FORBIDDEN',
        { reason: 'OWNER_IMMUTABLE' },
      );
    }
    if (kind === 'admin_peer_forbidden') {
      throw itemizeGraphqlError(
        'Administrators cannot modify other administrators',
        'FORBIDDEN',
        { reason: 'ADMIN_PEER_FORBIDDEN' },
      );
    }
    throw itemizeGraphqlError(
      'Organization member operation failed',
      'SERVICE_UNAVAILABLE',
    );
  }

  private settings(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    if ((error as { code?: string })?.code === '23505') {
      throw itemizeGraphqlError(
        'Organization state changed concurrently; retry the operation',
        'CONFLICT',
      );
    }
    throw itemizeGraphqlError(
      'Organization service is unavailable',
      'SERVICE_UNAVAILABLE',
    );
  }
}
