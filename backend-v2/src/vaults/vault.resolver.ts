import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateWorkspaceVaultInput,
  UpdateWorkspaceVaultInput,
  WorkspaceVaultFilterInput,
} from './vault.inputs';
import { VaultService } from './vault.service';
import {
  DeleteWorkspaceVaultResult,
  WorkspaceVault,
  WorkspaceVaultPage,
} from './vault.types';

@Resolver(() => WorkspaceVault)
export class VaultResolver {
  constructor(
    private readonly vaults: VaultService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Query(() => WorkspaceVaultPage)
  workspaceVaults(
    @Args('filter', { nullable: true }) filter?: WorkspaceVaultFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<WorkspaceVaultPage> {
    return this.vaults.list(this.userId(), filter, page);
  }

  @Query(() => WorkspaceVault)
  workspaceVault(
    @Args('id', { type: () => Int }) id: number,
    @Args('masterPassword', { nullable: true }) masterPassword?: string,
  ): Promise<WorkspaceVault> {
    return this.vaults.get(this.userId(), id, masterPassword);
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceVault)
  createWorkspaceVault(
    @Args('input') input: CreateWorkspaceVaultInput,
  ): Promise<WorkspaceVault> {
    return this.vaults.create(this.userId(), input);
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceVault)
  updateWorkspaceVault(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateWorkspaceVaultInput,
  ): Promise<WorkspaceVault> {
    return this.vaults.update(this.userId(), id, input);
  }

  @CsrfProtected()
  @Mutation(() => DeleteWorkspaceVaultResult)
  deleteWorkspaceVault(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteWorkspaceVaultResult> {
    return this.vaults.delete(this.userId(), id);
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
