import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { SignatureDocument } from '../signature-documents/signature-document.types';
import { SignatureEmailPreviewInput } from './signature-delivery.inputs';
import { SignatureDeliveryService } from './signature-delivery.service';
import { SignatureEmailPreview, SignatureReminderSchedule } from './signature-delivery.types';

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

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => SignatureDocument)
  sendSignatureDocument(@Args('id', { type: () => Int }) id: number): Promise<SignatureDocument> {
    return this.service.send(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => SignatureDocument)
  sendSignatureReminder(@Args('id', { type: () => Int }) id: number): Promise<SignatureDocument> {
    return this.service.remind(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => SignatureReminderSchedule)
  scheduleSignatureReminders(
    @Args('id', { type: () => Int }) id: number,
    @Args('days', { type: () => Int, defaultValue: 2 }) days: number,
  ): Promise<SignatureReminderSchedule> {
    return this.service.schedule(this.organizationId(), id, days);
  }

  private organizationId(): number {
    const organization = this.context.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
