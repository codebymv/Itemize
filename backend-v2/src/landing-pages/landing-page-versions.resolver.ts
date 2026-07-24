import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import {
  DeleteLandingPageVersionResult,
  LandingPageVersion,
  LandingPageVersionsResult,
} from './landing-page-version.types';
import { LandingPageVersionsService } from './landing-page-versions.service';

@Resolver(() => LandingPageVersion)
export class LandingPageVersionsResolver {
  constructor(
    private readonly versions: LandingPageVersionsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => LandingPageVersionsResult)
  landingPageVersions(
    @Args('pageId', { type: () => Int }) pageId: number,
  ): Promise<LandingPageVersionsResult> {
    return this.versions.list(this.organizationId(), pageId);
  }

  @OrganizationScoped()
  @Query(() => LandingPageVersion)
  landingPageVersion(
    @Args('pageId', { type: () => Int }) pageId: number,
    @Args('versionId', { type: () => Int }) versionId: number,
  ): Promise<LandingPageVersion> {
    return this.versions.get(this.organizationId(), pageId, versionId);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => LandingPageVersion)
  createLandingPageVersion(
    @Args('pageId', { type: () => Int }) pageId: number,
    @Args('description', { type: () => String, nullable: true })
    description?: string,
  ): Promise<LandingPageVersion> {
    return this.versions.create(
      this.organizationId(),
      pageId,
      this.userId(),
      description,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => LandingPageVersion)
  publishLandingPageVersion(
    @Args('pageId', { type: () => Int }) pageId: number,
    @Args('versionId', { type: () => Int }) versionId: number,
  ): Promise<LandingPageVersion> {
    return this.versions.publish(this.organizationId(), pageId, versionId);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteLandingPageVersionResult)
  deleteLandingPageVersion(
    @Args('pageId', { type: () => Int }) pageId: number,
    @Args('versionId', { type: () => Int }) versionId: number,
  ): Promise<DeleteLandingPageVersionResult> {
    return this.versions.delete(this.organizationId(), pageId, versionId);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => LandingPageVersion)
  restoreLandingPageVersion(
    @Args('pageId', { type: () => Int }) pageId: number,
    @Args('versionId', { type: () => Int }) versionId: number,
  ): Promise<LandingPageVersion> {
    return this.versions.restore(
      this.organizationId(),
      pageId,
      versionId,
      this.userId(),
    );
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
