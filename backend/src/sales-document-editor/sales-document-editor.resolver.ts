import { Args, Info, Int, Query, Resolver } from '@nestjs/graphql';
import type { GraphQLResolveInfo, SelectionNode } from 'graphql';
import { OrganizationScoped, RequiresPlan } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { SalesDocumentEditorService } from './sales-document-editor.service';
import {
  EstimateEditorBootstrap,
  InvoiceEditorBootstrap,
} from './sales-document-editor.types';

@RequiresPlan()
@Resolver()
export class SalesDocumentEditorResolver {
  constructor(
    private readonly editor: SalesDocumentEditorService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => InvoiceEditorBootstrap)
  invoiceEditorBootstrap(
    @Args('invoiceId', { type: () => Int, nullable: true }) invoiceId?: number,
    @Info() info?: GraphQLResolveInfo,
  ): Promise<InvoiceEditorBootstrap> {
    return this.editor.invoiceBootstrap(
      this.organizationId(),
      invoiceId,
      this.requestsField(info, 'products'),
    );
  }

  @OrganizationScoped()
  @Query(() => EstimateEditorBootstrap)
  estimateEditorBootstrap(
    @Args('estimateId', { type: () => Int, nullable: true }) estimateId?: number,
    @Args('initialContactId', { type: () => Int, nullable: true })
    initialContactId?: number,
    @Info() info?: GraphQLResolveInfo,
  ): Promise<EstimateEditorBootstrap> {
    return this.editor.estimateBootstrap(
      this.organizationId(),
      estimateId,
      initialContactId,
      this.requestsField(info, 'products'),
    );
  }

  private requestsField(
    info: GraphQLResolveInfo | undefined,
    fieldName: string,
  ): boolean {
    if (!info) return false;
    const includesField = (selections: readonly SelectionNode[]): boolean =>
      selections.some((selection) => {
        if (selection.kind === 'Field') return selection.name.value === fieldName;
        if (selection.kind === 'InlineFragment') {
          return includesField(selection.selectionSet.selections);
        }
        const fragment = info.fragments[selection.name.value];
        return fragment
          ? includesField(fragment.selectionSet.selections)
          : false;
      });
    return info.fieldNodes.some((node) =>
      node.selectionSet
        ? includesField(node.selectionSet.selections)
        : false,
    );
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }
}
