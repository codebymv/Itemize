import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PageInput } from '../common/pagination';
import { CsrfProtected } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { WorkspaceContentFilterInput } from './workspace-content.inputs';
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
  DeleteWorkspaceListResult,
  DeleteWorkspaceNoteResult,
  WorkspaceList,
  WorkspaceListPage,
  WorkspaceNote,
  WorkspaceNotePage,
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

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return identity.userId;
  }
}
