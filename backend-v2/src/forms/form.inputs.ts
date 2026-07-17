import { Field, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@InputType()
export class FormFieldInput {
  @Field(() => Int, { nullable: true })
  id?: number;

  @Field()
  fieldType: string;

  @Field()
  label: string;

  @Field(() => String, { nullable: true })
  placeholder?: string | null;

  @Field(() => String, { nullable: true })
  helpText?: string | null;

  @Field(() => Boolean, { nullable: true })
  isRequired?: boolean;

  @Field(() => GraphQLJSON, { nullable: true })
  validation?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  options?: unknown[];

  @Field(() => String, { nullable: true })
  width?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  conditions?: Record<string, unknown>[];

  @Field(() => String, { nullable: true })
  mapToContactField?: string | null;
}
@InputType()
export class CreateFormInput {
  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  type?: string;

  @Field(() => String, { nullable: true })
  submitButtonText?: string;

  @Field(() => String, { nullable: true })
  successMessage?: string;

  @Field(() => String, { nullable: true })
  redirectUrl?: string | null;

  @Field(() => Boolean, { nullable: true })
  notifyOnSubmit?: boolean;

  @Field(() => [String], { nullable: true })
  notificationEmails?: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  theme?: Record<string, unknown>;

  @Field(() => Boolean, { nullable: true })
  createContact?: boolean;

  @Field(() => [String], { nullable: true })
  contactTags?: string[];

  @Field(() => [FormFieldInput], { nullable: true })
  fields?: FormFieldInput[];
}

@InputType()
export class UpdateFormInput {
  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  type?: string | null;

  @Field(() => String, { nullable: true })
  status?: string | null;

  @Field(() => String, { nullable: true })
  submitButtonText?: string | null;

  @Field(() => String, { nullable: true })
  successMessage?: string | null;

  @Field(() => String, { nullable: true })
  redirectUrl?: string | null;

  @Field(() => Boolean, { nullable: true })
  notifyOnSubmit?: boolean | null;

  @Field(() => [String], { nullable: true })
  notificationEmails?: string[] | null;

  @Field(() => GraphQLJSON, { nullable: true })
  theme?: Record<string, unknown> | null;

  @Field(() => Boolean, { nullable: true })
  createContact?: boolean | null;

  @Field(() => [String], { nullable: true })
  contactTags?: string[] | null;
}
