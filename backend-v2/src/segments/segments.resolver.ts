import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateSegmentInput,
  PreviewSegmentInput,
  SegmentListFilterInput,
  UpdateSegmentInput,
} from './segment.inputs';
import {
  DeleteSegmentResult,
  Segment,
  SegmentContactPage,
  SegmentFilterOptions,
  SegmentPage,
  SegmentPreview,
} from './segment.types';
import { SegmentsService } from './segments.service';

@Resolver(() => Segment)
export class SegmentsResolver {
  constructor(
    private readonly segmentsService: SegmentsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => SegmentPage, { name: 'segments' })
  segments(
    @Args('filter', { nullable: true }) filter?: SegmentListFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<SegmentPage> {
    return this.segmentsService.list(this.organizationId(), filter, page);
  }

  @OrganizationScoped()
  @Query(() => Segment)
  segment(@Args('id', { type: () => Int }) id: number): Promise<Segment> {
    return this.segmentsService.get(this.organizationId(), id);
  }

  @OrganizationScoped()
  @Query(() => SegmentContactPage)
  segmentContacts(
    @Args('id', { type: () => Int }) id: number,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<SegmentContactPage> {
    return this.segmentsService.contacts(this.organizationId(), id, page);
  }

  @OrganizationScoped()
  @Query(() => SegmentPreview)
  previewSegment(@Args('input') input: PreviewSegmentInput): Promise<SegmentPreview> {
    return this.segmentsService.preview(this.organizationId(), input);
  }

  @OrganizationScoped()
  @Query(() => SegmentFilterOptions)
  segmentFilterOptions(): Promise<SegmentFilterOptions> {
    return this.segmentsService.filterOptions(this.organizationId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Segment)
  createSegment(@Args('input') input: CreateSegmentInput): Promise<Segment> {
    return this.segmentsService.create(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Segment)
  updateSegment(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateSegmentInput,
  ): Promise<Segment> {
    return this.segmentsService.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteSegmentResult)
  async deleteSegment(@Args('id', { type: () => Int }) id: number): Promise<DeleteSegmentResult> {
    return { deletedId: await this.segmentsService.delete(this.organizationId(), id) };
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Segment)
  recalculateSegment(@Args('id', { type: () => Int }) id: number): Promise<Segment> {
    return this.segmentsService.recalculate(this.organizationId(), id);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
