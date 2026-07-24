import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PageInput } from '../common/pagination';
import { CsrfProtected } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import {
  BatchCanvasPositionsInput,
  WorkspaceContentFilterInput,
} from './workspace-content.inputs';
import { WorkspaceContentService } from './workspace-content.service';
import {
  CreateWorkspaceListInput,
  UpdateWorkspaceListInput,
} from './workspace-list.inputs';
import {
  CreateWorkspaceNoteInput,
  UpdateWorkspaceNoteInput,
} from './workspace-note.inputs';
import {
  CreateWorkspaceWhiteboardInput,
  UpdateWorkspaceWhiteboardInput,
} from './workspace-whiteboard.inputs';
import {
  CreateWorkspaceWireframeInput,
  UpdateWorkspaceWireframeInput,
} from './workspace-wireframe.inputs';
import {
  DeleteWorkspaceListResult,
  DeleteWorkspaceNoteResult,
  DeleteWorkspaceWhiteboardResult,
  BatchCanvasPositionsResult,
  WorkspaceList,
  WorkspaceListPage,
  WorkspaceNote,
  WorkspaceNotePage,
  WorkspaceWhiteboard,
  WorkspaceWhiteboardPage,
  DeleteWorkspaceWireframeResult,
  WorkspaceWireframe,
  WorkspaceWireframePage,
  WorkspaceShareLink,
  DisableWorkspaceSharingResult,
} from './workspace-content.types';

@Resolver()
export class WorkspaceContentResolver {
  constructor(
    private readonly content: WorkspaceContentService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Query(() => WorkspaceListPage)
  workspaceLists(
    @Args('filter', { nullable: true }) filter?: WorkspaceContentFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<WorkspaceListPage> {
    return this.content.lists(this.userId(), filter, page);
  }

  @Query(() => WorkspaceNotePage)
  workspaceNotes(
    @Args('filter', { nullable: true }) filter?: WorkspaceContentFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<WorkspaceNotePage> {
    return this.content.notes(this.userId(), filter, page);
  }

  @Query(() => WorkspaceWhiteboardPage)
  workspaceWhiteboards(
    @Args('filter', { nullable: true }) filter?: WorkspaceContentFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<WorkspaceWhiteboardPage> {
    return this.content.whiteboards(this.userId(), filter, page);
  }

  @Query(() => WorkspaceWireframePage)
  workspaceWireframes(
    @Args('filter', { nullable: true }) filter?: WorkspaceContentFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<WorkspaceWireframePage> {
    return this.content.wireframes(this.userId(), filter, page);
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceList)
  createWorkspaceList(
    @Args('input') input: CreateWorkspaceListInput,
  ): Promise<WorkspaceList> {
    return this.content.createList(this.userId(), input);
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceList)
  updateWorkspaceList(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateWorkspaceListInput,
  ): Promise<WorkspaceList> {
    return this.content.updateList(this.userId(), id, input);
  }

  @CsrfProtected()
  @Mutation(() => DeleteWorkspaceListResult)
  async deleteWorkspaceList(
    @Args('id', { type: () => Int }) id: number,
    @Args('mutationId') mutationId: string,
  ): Promise<DeleteWorkspaceListResult> {
    return {
      deletedId: await this.content.deleteList(
        this.userId(),
        id,
        mutationId,
      ),
    };
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceNote)
  createWorkspaceNote(
    @Args('input') input: CreateWorkspaceNoteInput,
  ): Promise<WorkspaceNote> {
    return this.content.createNote(this.userId(), input);
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceNote)
  updateWorkspaceNote(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateWorkspaceNoteInput,
  ): Promise<WorkspaceNote> {
    return this.content.updateNote(this.userId(), id, input);
  }

  @CsrfProtected()
  @Mutation(() => DeleteWorkspaceNoteResult)
  async deleteWorkspaceNote(
    @Args('id', { type: () => Int }) id: number,
    @Args('mutationId') mutationId: string,
  ): Promise<DeleteWorkspaceNoteResult> {
    return {
      deletedId: await this.content.deleteNote(
        this.userId(),
        id,
        mutationId,
      ),
    };
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceWhiteboard)
  createWorkspaceWhiteboard(
    @Args('input') input: CreateWorkspaceWhiteboardInput,
  ): Promise<WorkspaceWhiteboard> {
    return this.content.createWhiteboard(this.userId(), input);
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceWhiteboard)
  updateWorkspaceWhiteboard(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateWorkspaceWhiteboardInput,
  ): Promise<WorkspaceWhiteboard> {
    return this.content.updateWhiteboard(this.userId(), id, input);
  }

  @CsrfProtected()
  @Mutation(() => DeleteWorkspaceWhiteboardResult)
  async deleteWorkspaceWhiteboard(
    @Args('id', { type: () => Int }) id: number,
    @Args('mutationId') mutationId: string,
  ): Promise<DeleteWorkspaceWhiteboardResult> {
    return {
      deletedId: await this.content.deleteWhiteboard(
        this.userId(),
        id,
        mutationId,
      ),
    };
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceWireframe)
  createWorkspaceWireframe(
    @Args('input') input: CreateWorkspaceWireframeInput,
  ): Promise<WorkspaceWireframe> {
    return this.content.createWireframe(this.userId(), input);
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceWireframe)
  updateWorkspaceWireframe(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateWorkspaceWireframeInput,
  ): Promise<WorkspaceWireframe> {
    return this.content.updateWireframe(this.userId(), id, input);
  }

  @CsrfProtected()
  @Mutation(() => DeleteWorkspaceWireframeResult)
  async deleteWorkspaceWireframe(
    @Args('id', { type: () => Int }) id: number,
    @Args('mutationId') mutationId: string,
  ): Promise<DeleteWorkspaceWireframeResult> {
    return {
      deletedId: await this.content.deleteWireframe(
        this.userId(),
        id,
        mutationId,
      ),
    };
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceShareLink)
  enableWireframeSharing(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<WorkspaceShareLink> {
    return this.content.enableWireframeSharing(this.userId(), id);
  }

  @CsrfProtected()
  @Mutation(() => DisableWorkspaceSharingResult)
  async disableWireframeSharing(
    @Args('id', { type: () => Int }) id: number,
    @Args('mutationId') mutationId: string,
  ): Promise<DisableWorkspaceSharingResult> {
    return {
      sharingDisabled: await this.content.disableWireframeSharing(
        this.userId(),
        id,
        mutationId,
      ),
    };
  }

  @CsrfProtected()
  @Mutation(() => BatchCanvasPositionsResult)
  batchCanvasPositions(
    @Args('input') input: BatchCanvasPositionsInput,
  ): Promise<BatchCanvasPositionsResult> {
    return this.content.batchCanvasPositions(this.userId(), input);
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return identity.userId;
  }
}
