import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { CreateTagInput, UpdateTagInput } from './tag.inputs';
import { DeleteTagResult, Tag } from './tag.types';
import { TagsService } from './tags.service';

@Resolver(() => Tag)
export class TagsResolver {
  constructor(
    private readonly tags: TagsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => [Tag], { name: 'tags' })
  tagsList(): Promise<Tag[]> {
    return this.tags.list(this.organizationId());
  }

  @OrganizationScoped()
  @Query(() => [String])
  contactTagSuggestions(): Promise<string[]> {
    return this.tags.suggestions(this.organizationId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Tag)
  createTag(@Args('input') input: CreateTagInput): Promise<Tag> {
    return this.tags.create(this.organizationId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Tag)
  updateTag(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateTagInput,
  ): Promise<Tag> {
    return this.tags.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteTagResult)
  async deleteTag(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteTagResult> {
    return { deletedId: await this.tags.delete(this.organizationId(), id) };
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
