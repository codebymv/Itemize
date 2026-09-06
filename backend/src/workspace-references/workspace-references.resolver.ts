import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { AccountScoped, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { WorkspaceReferencesService } from './workspace-references.service';
import {
  MoneyDocumentSuggestion,
  WorkspaceReferenceSource,
} from './workspace-references.types';

@Resolver()
export class WorkspaceReferencesResolver {
  constructor(
    private readonly references: WorkspaceReferencesService,
    private readonly requestContext: RequestContextService,
  ) {}

  /**
   * The signed-in user's own workspace cards that reference an entity. Cards
   * are account-owned, so this is account-scoped even though the entity lives
   * in an organization; the repository still requires current membership.
   */
  @AccountScoped()
  @Query(() => [WorkspaceReferenceSource])
  workspaceReferencesTo(
    @Args('entityType') entityType: string,
    @Args('entityId', { type: () => Int }) entityId: number,
  ): Promise<WorkspaceReferenceSource[]> {
    return this.references.referencesTo(this.userId(), entityType, entityId);
  }

  /** Rows for the `$` trigger, from the selected organization's money documents. */
  @OrganizationScoped()
  @Query(() => [MoneyDocumentSuggestion])
  moneyDocumentSuggestions(
    @Args('query', { nullable: true }) query?: string,
    @Args('contactId', { type: () => Int, nullable: true }) contactId?: number,
  ): Promise<MoneyDocumentSuggestion[]> {
    return this.references.suggestMoneyDocuments(this.organizationId(), query, contactId);
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return identity.userId;
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
