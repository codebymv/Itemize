import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, Public } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import {
  AddOrganizationMemberInput,
  CreateOrganizationInvitationInput,
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from './organization.inputs';
import {
  DeleteOrganizationResult,
  Organization,
  OrganizationActivity,
  OrganizationAllowance,
  OrganizationInvitation,
  OrganizationInvitationAcceptance,
  OrganizationInvitationPreview,
  OrganizationMember,
  RemoveOrganizationMemberResult,
} from './organization.types';
import { OrganizationInvitationsService } from './organization-invitations.service';
import { OrganizationsService } from './organizations.service';

@Resolver(() => Organization)
export class OrganizationsResolver {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly invitations: OrganizationInvitationsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Query(() => [Organization], { name: 'organizations' })
  organizationsList(): Promise<Organization[]> {
    return this.organizations.list(this.userId());
  }

  @Query(() => OrganizationAllowance)
  viewerOrganizationAllowance(): Promise<OrganizationAllowance> {
    return this.organizations.allowance(this.userId());
  }

  @Query(() => Organization, { name: 'organization' })
  organization(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<Organization> {
    return this.organizations.get(this.userId(), id);
  }

  @Query(() => [OrganizationMember])
  organizationMembers(
    @Args('organizationId', { type: () => Int }) organizationId: number,
  ): Promise<OrganizationMember[]> {
    return this.organizations.members(this.userId(), organizationId);
  }

  @Query(() => [OrganizationActivity])
  organizationActivity(
    @Args('organizationId', { type: () => Int }) organizationId: number,
    @Args('first', { type: () => Int, defaultValue: 20 }) first: number,
  ): Promise<OrganizationActivity[]> {
    return this.organizations.activity(this.userId(), organizationId, first);
  }

  @Query(() => [OrganizationInvitation])
  organizationInvitations(
    @Args('organizationId', { type: () => Int }) organizationId: number,
  ): Promise<OrganizationInvitation[]> {
    return this.invitations.list(this.userId(), organizationId);
  }

  @Public()
  @Query(() => OrganizationInvitationPreview)
  organizationInvitationPreview(
    @Args('token') token: string,
  ): Promise<OrganizationInvitationPreview> {
    return this.invitations.preview(token);
  }

  @CsrfProtected()
  @Mutation(() => Organization)
  createOrganization(
    @Args('input') input: CreateOrganizationInput,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<Organization> {
    return this.organizations.create(this.userId(), input, idempotencyKey);
  }

  @CsrfProtected()
  @Mutation(() => Organization)
  updateOrganization(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateOrganizationInput,
  ): Promise<Organization> {
    return this.organizations.update(this.userId(), id, input);
  }

  @CsrfProtected()
  @Mutation(() => DeleteOrganizationResult)
  async deleteOrganization(
    @Args('id', { type: () => Int }) id: number,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<DeleteOrganizationResult> {
    return {
      deletedId: await this.organizations.delete(this.userId(), id, idempotencyKey),
    };
  }

  @CsrfProtected()
  @Mutation(() => OrganizationMember)
  addOrganizationMember(
    @Args('organizationId', { type: () => Int }) organizationId: number,
    @Args('input') input: AddOrganizationMemberInput,
  ): Promise<OrganizationMember> {
    return this.organizations.addMember(this.userId(), organizationId, input);
  }

  @CsrfProtected()
  @Mutation(() => OrganizationInvitation)
  createOrganizationInvitation(
    @Args('organizationId', { type: () => Int }) organizationId: number,
    @Args('input') input: CreateOrganizationInvitationInput,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<OrganizationInvitation> {
    return this.invitations.create(
      this.userId(),
      organizationId,
      input.email,
      input.role,
      idempotencyKey,
    );
  }

  @CsrfProtected()
  @Mutation(() => OrganizationInvitation)
  resendOrganizationInvitation(
    @Args('organizationId', { type: () => Int }) organizationId: number,
    @Args('invitationId', { type: () => Int }) invitationId: number,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<OrganizationInvitation> {
    return this.invitations.resend(
      this.userId(), organizationId, invitationId, idempotencyKey,
    );
  }

  @CsrfProtected()
  @Mutation(() => Boolean)
  revokeOrganizationInvitation(
    @Args('organizationId', { type: () => Int }) organizationId: number,
    @Args('invitationId', { type: () => Int }) invitationId: number,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<boolean> {
    return this.invitations.revoke(
      this.userId(), organizationId, invitationId, idempotencyKey,
    );
  }

  @CsrfProtected()
  @Mutation(() => OrganizationInvitationAcceptance)
  acceptOrganizationInvitation(
    @Args('token') token: string,
  ): Promise<OrganizationInvitationAcceptance> {
    return this.invitations.accept(this.userId(), token);
  }

  @CsrfProtected()
  @Mutation(() => OrganizationMember)
  updateOrganizationMemberRole(
    @Args('organizationId', { type: () => Int }) organizationId: number,
    @Args('memberId', { type: () => Int }) memberId: number,
    @Args('role') role: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<OrganizationMember> {
    return this.organizations.updateMemberRole(
      this.userId(),
      organizationId,
      memberId,
      role,
      idempotencyKey,
    );
  }

  @CsrfProtected()
  @Mutation(() => RemoveOrganizationMemberResult)
  async removeOrganizationMember(
    @Args('organizationId', { type: () => Int }) organizationId: number,
    @Args('memberId', { type: () => Int }) memberId: number,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<RemoveOrganizationMemberResult> {
    return {
      removedMemberId: await this.organizations.removeMember(
        this.userId(),
        organizationId,
        memberId,
        idempotencyKey,
      ),
    };
  }

  @CsrfProtected()
  @Mutation(() => OrganizationMember)
  transferOrganizationOwnership(
    @Args('organizationId', { type: () => Int }) organizationId: number,
    @Args('memberId', { type: () => Int }) memberId: number,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<OrganizationMember> {
    return this.organizations.transferOwnership(
      this.userId(),
      organizationId,
      memberId,
      idempotencyKey,
    );
  }

  @CsrfProtected()
  @Mutation(() => Boolean)
  leaveOrganization(
    @Args('organizationId', { type: () => Int }) organizationId: number,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<boolean> {
    return this.organizations.leave(this.userId(), organizationId, idempotencyKey);
  }

  @CsrfProtected()
  @Mutation(() => Organization)
  selectOrganization(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<Organization> {
    return this.organizations.select(this.userId(), id);
  }

  @CsrfProtected()
  @Mutation(() => Organization)
  ensureDefaultOrganization(): Promise<Organization> {
    return this.organizations.ensureDefault(this.userId());
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return identity.userId;
  }
}
