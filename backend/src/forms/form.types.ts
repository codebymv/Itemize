import {
  Field,
  GraphQLISODateTime,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@ObjectType()
export class FormField {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  formId: number;

  @Field()
  fieldType: string;

  @Field()
  label: string;

  @Field(() => String, { nullable: true })
  placeholder: string | null;

  @Field(() => String, { nullable: true })
  helpText: string | null;

  @Field()
  isRequired: boolean;

  @Field(() => GraphQLJSON)
  validation: Record<string, unknown>;

  @Field(() => GraphQLJSON)
  options: unknown[];

  @Field(() => Int)
  fieldOrder: number;

  @Field()
  width: string;

  @Field(() => GraphQLJSON)
  conditions: Record<string, unknown>[];

  @Field(() => String, { nullable: true })
  mapToContactField: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}
@ObjectType()
export class Form {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field()
  slug: string;

  @Field()
  publicId: string;

  @Field()
  type: string;

  @Field()
  status: string;

  @Field()
  submitButtonText: string;

  @Field()
  successMessage: string;

  @Field(() => String, { nullable: true })
  redirectUrl: string | null;

  @Field()
  notifyOnSubmit: boolean;

  @Field(() => [String])
  notificationEmails: string[];

  @Field(() => GraphQLJSON)
  theme: Record<string, unknown>;

  @Field()
  createContact: boolean;

  @Field(() => [String])
  contactTags: string[];

  @Field(() => Int, { nullable: true })
  createdById: number | null;

  @Field(() => [FormField])
  fields: FormField[];

  @Field(() => Int)
  submissionCount: number;

  @Field(() => Int)
  fieldCount: number;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class FormSubmission {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  formId: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => Int, { nullable: true })
  contactId: number | null;

  @Field(() => GraphQLJSON)
  data: Record<string, unknown>;

  @Field(() => String, { nullable: true })
  ipAddress: string | null;

  @Field(() => String, { nullable: true })
  userAgent: string | null;

  @Field(() => String, { nullable: true })
  referrer: string | null;

  @Field(() => Int, { nullable: true })
  score: number | null;

  @Field(() => String, { nullable: true })
  contactFirstName: string | null;

  @Field(() => String, { nullable: true })
  contactLastName: string | null;

  @Field(() => String, { nullable: true })
  contactEmail: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class FormSubmissionPage {
  @Field(() => [FormSubmission])
  submissions: FormSubmission[];

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  limit: number;

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  totalPages: number;
}

@ObjectType()
export class ReplaceFormFieldsResult {
  @Field(() => [FormField])
  fields: FormField[];
}

@ObjectType()
export class DeleteFormResult {
  @Field(() => Int)
  deletedId: number;
}

@ObjectType()
export class DeleteFormSubmissionResult {
  @Field(() => Int)
  deletedId: number;
}
