import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { CreateFormInput, FormFieldInput, UpdateFormInput } from './form.inputs';
import {
  DeleteFormResult,
  DeleteFormSubmissionResult,
  Form,
  FormSubmissionPage,
  ReplaceFormFieldsResult,
} from './form.types';
import { FormsService } from './forms.service';

@Resolver(() => Form)
export class FormsResolver {
  constructor(
    private readonly forms: FormsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => [Form], { name: 'forms' })
  formsList(
    @Args('status', { type: () => String, nullable: true }) status?: string,
  ): Promise<Form[]> {
    return this.forms.list(this.organizationId(), status);
  }

  @OrganizationScoped()
  @Query(() => Form)
  form(@Args('id', { type: () => Int }) id: number): Promise<Form> {
    return this.forms.get(this.organizationId(), id);
  }

  @OrganizationScoped()
  @Query(() => FormSubmissionPage)
  formSubmissions(
    @Args('formId', { type: () => Int }) formId: number,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit: number,
  ): Promise<FormSubmissionPage> {
    return this.forms.submissions(this.organizationId(), formId, page, limit);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Form)
  createForm(@Args('input') input: CreateFormInput): Promise<Form> {
    return this.forms.create(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Form)
  updateForm(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateFormInput,
  ): Promise<Form> {
    return this.forms.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteFormResult)
  async deleteForm(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteFormResult> {
    return { deletedId: await this.forms.delete(this.organizationId(), id) };
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Form)
  duplicateForm(@Args('id', { type: () => Int }) id: number): Promise<Form> {
    return this.forms.duplicate(this.organizationId(), this.userId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ReplaceFormFieldsResult)
  async replaceFormFields(
    @Args('formId', { type: () => Int }) formId: number,
    @Args('fields', { type: () => [FormFieldInput] }) fields: FormFieldInput[],
  ): Promise<ReplaceFormFieldsResult> {
    return {
      fields: await this.forms.replaceFields(
        this.organizationId(),
        formId,
        fields,
      ),
    };
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteFormSubmissionResult)
  async deleteFormSubmission(
    @Args('formId', { type: () => Int }) formId: number,
    @Args('submissionId', { type: () => Int }) submissionId: number,
  ): Promise<DeleteFormSubmissionResult> {
    return {
      deletedId: await this.forms.deleteSubmission(
        this.organizationId(),
        formId,
        submissionId,
      ),
    };
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
