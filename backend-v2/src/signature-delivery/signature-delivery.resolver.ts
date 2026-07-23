import { Args, Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { SignatureEmailPreviewInput } from './signature-delivery.inputs';
import { SignatureDeliveryService } from './signature-delivery.service';
import { SignatureEmailPreview } from './signature-delivery.types';

@Resolver(() => SignatureEmailPreview)
export class SignatureDeliveryResolver {
  constructor(
    private readonly service: SignatureDeliveryService,
    private readonly context: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => SignatureEmailPreview)
  previewSignatureEmail(@Args('input') input: SignatureEmailPreviewInput): Promise<SignatureEmailPreview> {
    const organization = this.context.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return this.service.preview(organization.organizationId, input);
  }
}
