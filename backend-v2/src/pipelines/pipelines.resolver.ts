import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreatePipelineInput,
  UpdatePipelineInput,
} from './pipeline.inputs';
import { DeletePipelineResult, Pipeline } from './pipeline.types';
import { PipelinesService } from './pipelines.service';

@Resolver(() => Pipeline)
export class PipelinesResolver {
  constructor(
    private readonly pipelines: PipelinesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => [Pipeline], { name: 'pipelines' })
  pipelinesList(): Promise<Pipeline[]> {
    return this.pipelines.list(this.organizationId());
  }

  @OrganizationScoped()
  @Query(() => Pipeline)
  pipeline(@Args('id', { type: () => Int }) id: number): Promise<Pipeline> {
    return this.pipelines.get(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Pipeline)
  createPipeline(
    @Args('input') input: CreatePipelineInput,
  ): Promise<Pipeline> {
    return this.pipelines.create(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Pipeline)
  updatePipeline(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdatePipelineInput,
  ): Promise<Pipeline> {
    return this.pipelines.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeletePipelineResult)
  async deletePipeline(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeletePipelineResult> {
    return {
      deletedId: await this.pipelines.delete(this.organizationId(), id),
    };
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
