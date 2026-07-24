import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateWorkspaceVaultItemInput,
  CreateWorkspaceVaultInput,
  UpdateWorkspaceVaultItemInput,
  UpdateWorkspaceVaultInput,
  WorkspaceVaultFilterInput,
} from './vault.inputs';
import { VaultService } from './vault.service';
import {
  DeleteWorkspaceVaultResult,
  DeleteWorkspaceVaultItemResult,
  WorkspaceVault,
  WorkspaceVaultItem,
  WorkspaceVaultItemsResult,
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

  @CsrfProtected()
  @Mutation(() => WorkspaceVaultItem)
  addWorkspaceVaultItem(
    @Args('vaultId', { type: () => Int }) vaultId: number,
    @Args('input') input: CreateWorkspaceVaultItemInput,
  ): Promise<WorkspaceVaultItem> {
    return this.vaults.addItem(this.userId(), vaultId, input);
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceVaultItemsResult)
  addWorkspaceVaultItems(
    @Args('vaultId', { type: () => Int }) vaultId: number,
    @Args('items', { type: () => [CreateWorkspaceVaultItemInput] })
    items: CreateWorkspaceVaultItemInput[],
  ): Promise<WorkspaceVaultItemsResult> {
    return this.vaults.addItems(this.userId(), vaultId, items);
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceVaultItem)
  updateWorkspaceVaultItem(
    @Args('vaultId', { type: () => Int }) vaultId: number,
    @Args('itemId', { type: () => Int }) itemId: number,
    @Args('input') input: UpdateWorkspaceVaultItemInput,
  ): Promise<WorkspaceVaultItem> {
    return this.vaults.updateItem(this.userId(), vaultId, itemId, input);
  }

  @CsrfProtected()
  @Mutation(() => DeleteWorkspaceVaultItemResult)
  deleteWorkspaceVaultItem(
    @Args('vaultId', { type: () => Int }) vaultId: number,
    @Args('itemId', { type: () => Int }) itemId: number,
  ): Promise<DeleteWorkspaceVaultItemResult> {
    return this.vaults.deleteItem(this.userId(), vaultId, itemId);
  }

  @CsrfProtected()
  @Mutation(() => WorkspaceVaultItemsResult)
  reorderWorkspaceVaultItems(
    @Args('vaultId', { type: () => Int }) vaultId: number,
    @Args('itemIds', { type: () => [Int] }) itemIds: number[],
  ): Promise<WorkspaceVaultItemsResult> {
    return this.vaults.reorderItems(this.userId(), vaultId, itemIds);
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
