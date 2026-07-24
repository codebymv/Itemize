import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  AddLandingPageSectionInput,
  CreateLandingPageInput,
  LandingPageFilterInput,
  LandingPageSectionInput,
  UpdateLandingPageInput,
  UpdateLandingPageSectionInput,
} from './landing-page.inputs';
import {
  DeleteLandingPageResult,
  DeleteLandingPageSectionResult,
  LandingPage,
  LandingPageAnalytics,
  LandingPagePage,
  LandingPageSection,
  LandingPageSectionsResult,
} from './landing-page.types';
import { LandingPagesService } from './landing-pages.service';

@Resolver(() => LandingPage)
export class LandingPagesResolver {
  constructor(
    private readonly pages: LandingPagesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => LandingPagePage)
  landingPages(
    @Args('filter', { nullable: true }) filter?: LandingPageFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<LandingPagePage> {
    return this.pages.list(this.organizationId(), filter, page);
  }

  @OrganizationScoped()
  @Query(() => LandingPage)
  landingPage(@Args('id', { type: () => Int }) id: number): Promise<LandingPage> {
    return this.pages.get(this.organizationId(), id);
  }

  @OrganizationScoped()
  @Query(() => LandingPageAnalytics)
  landingPageAnalytics(
    @Args('id', { type: () => Int }) id: number,
    @Args('period', { type: () => Int, defaultValue: 30 }) period: number,
  ): Promise<LandingPageAnalytics> {
    return this.pages.analytics(this.organizationId(), id, period);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => LandingPage)
  createLandingPage(
    @Args('input') input: CreateLandingPageInput,
  ): Promise<LandingPage> {
    return this.pages.create(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => LandingPage)
  updateLandingPage(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateLandingPageInput,
  ): Promise<LandingPage> {
    return this.pages.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteLandingPageResult)
  deleteLandingPage(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteLandingPageResult> {
    return this.pages.delete(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => LandingPage)
  duplicateLandingPage(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<LandingPage> {
    return this.pages.duplicate(this.organizationId(), this.userId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => LandingPageSectionsResult)
  replaceLandingPageSections(
    @Args('pageId', { type: () => Int }) pageId: number,
    @Args('sections', { type: () => [LandingPageSectionInput] })
    sections: LandingPageSectionInput[],
  ): Promise<LandingPageSectionsResult> {
    return this.pages.replaceSections(this.organizationId(), pageId, sections);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => LandingPageSection)
  addLandingPageSection(
    @Args('pageId', { type: () => Int }) pageId: number,
    @Args('input') input: AddLandingPageSectionInput,
  ): Promise<LandingPageSection> {
    return this.pages.addSection(this.organizationId(), pageId, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => LandingPageSection)
  updateLandingPageSection(
    @Args('pageId', { type: () => Int }) pageId: number,
    @Args('sectionId', { type: () => Int }) sectionId: number,
    @Args('input') input: UpdateLandingPageSectionInput,
  ): Promise<LandingPageSection> {
    return this.pages.updateSection(
      this.organizationId(),
      pageId,
      sectionId,
      input,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteLandingPageSectionResult)
  deleteLandingPageSection(
    @Args('pageId', { type: () => Int }) pageId: number,
    @Args('sectionId', { type: () => Int }) sectionId: number,
  ): Promise<DeleteLandingPageSectionResult> {
    return this.pages.deleteSection(
      this.organizationId(),
      pageId,
      sectionId,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => LandingPageSectionsResult)
  reorderLandingPageSections(
    @Args('pageId', { type: () => Int }) pageId: number,
    @Args('sectionIds', { type: () => [Int] }) sectionIds: number[],
  ): Promise<LandingPageSectionsResult> {
    return this.pages.reorderSections(
      this.organizationId(),
      pageId,
      sectionIds,
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
