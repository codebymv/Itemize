import { Args, Int, Query, Resolver } from '@nestjs/graphql';
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
  ): Promise<InvoiceEditorBootstrap> {
    return this.editor.invoiceBootstrap(this.organizationId(), invoiceId);
  }

  @OrganizationScoped()
  @Query(() => EstimateEditorBootstrap)
  estimateEditorBootstrap(
    @Args('estimateId', { type: () => Int, nullable: true }) estimateId?: number,
    @Args('initialContactId', { type: () => Int, nullable: true })
    initialContactId?: number,
  ): Promise<EstimateEditorBootstrap> {
    return this.editor.estimateBootstrap(
      this.organizationId(),
      estimateId,
      initialContactId,
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
