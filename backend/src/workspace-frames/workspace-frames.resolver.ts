import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AccountScoped, CsrfProtected } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateWorkspaceFrameInput,
  UpdateWorkspaceFrameInput,
} from './workspace-frames.inputs';
import { WorkspaceFramesService } from './workspace-frames.service';
import {
  DeleteWorkspaceFrameResult,
  WorkspaceFrame,
  WorkspaceFramePage,
} from './workspace-frames.types';

@AccountScoped()
@Resolver()
export class WorkspaceFramesResolver {
  constructor(
    private readonly frames: WorkspaceFramesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Query(() => WorkspaceFramePage)
  workspaceFrames(
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<WorkspaceFramePage> {
    return this.frames.frames(this.userId(), page);
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceFrame)
  createWorkspaceFrame(
    @Args('input') input: CreateWorkspaceFrameInput,
  ): Promise<WorkspaceFrame> {
    return this.frames.createFrame(this.userId(), input);
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceFrame)
  updateWorkspaceFrame(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateWorkspaceFrameInput,
  ): Promise<WorkspaceFrame> {
    return this.frames.updateFrame(this.userId(), id, input);
  }

  @CsrfProtected()
  @Mutation(() => DeleteWorkspaceFrameResult)
  async deleteWorkspaceFrame(
    @Args('id', { type: () => Int }) id: number,
    @Args('mutationId') mutationId: string,
  ): Promise<DeleteWorkspaceFrameResult> {
    return {
      deletedId: await this.frames.deleteFrame(this.userId(), id, mutationId),
    };
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return identity.userId;
  }
}
