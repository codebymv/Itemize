import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped, RequiresPlan } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import { ClientTasksService } from './client-tasks.service';
import {
  ClientTask, ClientTaskFilterInput, ClientTaskPage,
  CreateClientTaskInput, UpdateClientTaskInput,
} from './client-task.types';

@RequiresPlan()
@Resolver(() => ClientTask)
export class ClientTasksResolver {
  constructor(
    private readonly tasks: ClientTasksService,
    private readonly context: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => ClientTaskPage)
  clientTasks(
    @Args('filter', { nullable: true }) filter?: ClientTaskFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ) {
    return this.tasks.list(this.organizationId(), this.userId(), filter ?? undefined, page ?? undefined);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ClientTask)
  createClientTask(
    @Args('input') input: CreateClientTaskInput,
    @Args('idempotencyKey') key: string,
  ) {
    return this.tasks.create(this.organizationId(), this.userId(), input, key);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ClientTask)
  updateClientTask(
    @Args('id', { type: () => Int }) id: number,
    @Args('expectedVersion', { type: () => Int }) version: number,
    @Args('input') input: UpdateClientTaskInput,
    @Args('idempotencyKey') key: string,
  ) {
    return this.tasks.update(this.organizationId(), this.userId(), id, version, input, key);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ClientTask)
  transitionClientTask(
    @Args('id', { type: () => Int }) id: number,
    @Args('expectedVersion', { type: () => Int }) version: number,
    @Args('status') status: string,
    @Args('idempotencyKey') key: string,
  ) {
    return this.tasks.transition(this.organizationId(), this.userId(), id, version, status, key);
  }

  private organizationId(): number {
    const organization = this.context.current().organization;
    if (!organization) throw new Error('Organization context required');
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.context.current().identity;
    if (!identity) throw new Error('Authenticated identity required');
    return identity.userId;
  }
}
