import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateEmailTemplateInput,
  EmailTemplateFilterInput,
  UpdateEmailTemplateInput,
} from './email-template.inputs';
import {
  DeleteEmailTemplateResult,
  EmailTemplate,
  EmailTemplateCategory,
  EmailTemplatePage,
} from './email-template.types';
import { EmailTemplatesService } from './email-templates.service';

@Resolver(() => EmailTemplate)
export class EmailTemplatesResolver {
  constructor(
    private readonly templates: EmailTemplatesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => EmailTemplatePage)
  emailTemplates(
    @Args('filter', { nullable: true }) filter?: EmailTemplateFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<EmailTemplatePage> {
    return this.templates.list(this.organizationId(), filter, page);
  }

  @OrganizationScoped()
  @Query(() => EmailTemplate)
  emailTemplate(@Args('id', { type: () => Int }) id: number): Promise<EmailTemplate> {
    return this.templates.detail(this.organizationId(), id);
  }

  @OrganizationScoped()
  @Query(() => [EmailTemplateCategory])
  emailTemplateCategories(): Promise<EmailTemplateCategory[]> {
    return this.templates.categories(this.organizationId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => EmailTemplate)
  createEmailTemplate(@Args('input') input: CreateEmailTemplateInput): Promise<EmailTemplate> {
    return this.templates.create(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => EmailTemplate)
  updateEmailTemplate(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateEmailTemplateInput,
  ): Promise<EmailTemplate> {
    return this.templates.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => EmailTemplate)
  duplicateEmailTemplate(@Args('id', { type: () => Int }) id: number): Promise<EmailTemplate> {
    return this.templates.duplicate(this.organizationId(), id, this.userId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteEmailTemplateResult)
  deleteEmailTemplate(@Args('id', { type: () => Int }) id: number): Promise<DeleteEmailTemplateResult> {
    return this.templates.delete(this.organizationId(), id);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
