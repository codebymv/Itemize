import { Args, Query, Resolver } from '@nestjs/graphql';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import { WorkspaceContentFilterInput } from './workspace-content.inputs';
import { WorkspaceContentService } from './workspace-content.service';
import {
  WorkspaceListPage,
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

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return identity.userId;
  }
}
