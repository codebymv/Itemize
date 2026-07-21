import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import { CreateSmsTemplateInput, SmsTemplateFilterInput, UpdateSmsTemplateInput } from './sms-template.inputs';
import { DeleteSmsTemplateResult, SmsMessageInfo, SmsTemplate, SmsTemplateCategory, SmsTemplatePage } from './sms-template.types';
import { SmsTemplatesService } from './sms-templates.service';

@Resolver(() => SmsTemplate)
export class SmsTemplatesResolver {
  constructor(private readonly templates: SmsTemplatesService, private readonly requestContext: RequestContextService) {}
  @OrganizationScoped() @Query(() => SmsTemplatePage)
  smsTemplates(@Args('filter', { nullable: true }) filter?: SmsTemplateFilterInput, @Args('page', { nullable: true }) page?: PageInput) {
    return this.templates.list(this.organizationId(), filter, page);
  }
  @OrganizationScoped() @Query(() => SmsTemplate)
  smsTemplate(@Args('id', { type: () => Int }) id: number) { return this.templates.detail(this.organizationId(), id); }
  @OrganizationScoped() @Query(() => [SmsTemplateCategory])
  smsTemplateCategories() { return this.templates.categories(this.organizationId()); }
  @Query(() => SmsMessageInfo)
  smsMessageInfo(@Args('message') message: string) { this.userId(); return this.templates.messageInfo(message); }
  @CsrfProtected() @OrganizationScoped() @Mutation(() => SmsTemplate)
  createSmsTemplate(@Args('input') input: CreateSmsTemplateInput) { return this.templates.create(this.organizationId(), this.userId(), input); }
  @CsrfProtected() @OrganizationScoped() @Mutation(() => SmsTemplate)
  updateSmsTemplate(@Args('id', { type: () => Int }) id: number, @Args('input') input: UpdateSmsTemplateInput) { return this.templates.update(this.organizationId(), id, input); }
  @CsrfProtected() @OrganizationScoped() @Mutation(() => SmsTemplate)
  duplicateSmsTemplate(@Args('id', { type: () => Int }) id: number) { return this.templates.duplicate(this.organizationId(), id, this.userId()); }
  @CsrfProtected() @OrganizationScoped() @Mutation(() => DeleteSmsTemplateResult)
  deleteSmsTemplate(@Args('id', { type: () => Int }) id: number) { return this.templates.delete(this.organizationId(), id); }
  private organizationId() { const value = this.requestContext.current().organization; if (!value) throw new Error('Verified organization context is unavailable'); return value.organizationId; }
  private userId() { const value = this.requestContext.current().identity; if (!value) throw new Error('Verified identity context is unavailable'); return value.userId; }
}
