import { Field, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import {
  ContactActivityType,
  ContactBulkTagsMode,
  ContactSource,
  ContactSortField,
  ContactStatus,
  SortDirection,
} from './contact.enums';

@InputType()
export class ContactActivityFilterInput {
  @Field(() => ContactActivityType, { nullable: true })
  type?: ContactActivityType;
}

@InputType()
export class CreateContactActivityInput {
  @Field(() => ContactActivityType)
  type: ContactActivityType;

  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => GraphQLJSON, { nullable: true })
  content?: Record<string, unknown> | null;

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: Record<string, unknown> | null;
}

@InputType()
export class CreateContactInput {
  @Field(() => String, { nullable: true })
  firstName?: string;

  @Field(() => String, { nullable: true })
  lastName?: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => String, { nullable: true })
  phone?: string;

  @Field(() => String, { nullable: true })
  company?: string;

  @Field(() => String, { nullable: true })
  jobTitle?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  address?: Record<string, unknown>;

  @Field(() => ContactSource, { nullable: true })
  source?: ContactSource;

  @Field(() => ContactStatus, { nullable: true })
  status?: ContactStatus;

  @Field(() => GraphQLJSON, { nullable: true })
  customFields?: Record<string, unknown>;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field(() => Int, { nullable: true })
  assignedToId?: number;
}

@InputType()
export class UpdateContactInput {
  @Field(() => String, { nullable: true })
  firstName?: string | null;

  @Field(() => String, { nullable: true })
  lastName?: string | null;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => String, { nullable: true })
  phone?: string | null;

  @Field(() => String, { nullable: true })
  company?: string | null;

  @Field(() => String, { nullable: true })
  jobTitle?: string | null;

  @Field(() => GraphQLJSON, { nullable: true })
  address?: Record<string, unknown> | null;

  @Field(() => ContactSource, { nullable: true })
  source?: ContactSource | null;

  @Field(() => ContactStatus, { nullable: true })
  status?: ContactStatus | null;

  @Field(() => GraphQLJSON, { nullable: true })
  customFields?: Record<string, unknown> | null;

  @Field(() => [String], { nullable: true })
  tags?: string[] | null;

  @Field(() => Int, { nullable: true })
  assignedToId?: number | null;
}

@InputType()
export class ContactFilterInput {
  @Field(() => String, { nullable: true })
  search?: string;

  @Field(() => ContactStatus, { nullable: true })
  status?: ContactStatus;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field(() => Int, { nullable: true })
  assignedToId?: number;
}

@InputType()
export class ContactSortInput {
  @Field(() => ContactSortField, { defaultValue: ContactSortField.CREATED_AT })
  field = ContactSortField.CREATED_AT;

  @Field(() => SortDirection, { defaultValue: SortDirection.DESC })
  direction = SortDirection.DESC;
}

@InputType()
export class BulkContactUpdatesInput {
  @Field(() => ContactStatus, { nullable: true })
  status?: ContactStatus | null;

  @Field(() => Int, { nullable: true })
  assignedToId?: number | null;

  @Field(() => [String], { nullable: true })
  tags?: string[] | null;

  @Field(() => ContactBulkTagsMode, { nullable: true })
  tagsMode?: ContactBulkTagsMode | null;
}

@InputType()
export class BulkUpdateContactsInput {
  @Field(() => [Int])
  contactIds: number[];

  @Field(() => BulkContactUpdatesInput)
  updates: BulkContactUpdatesInput;
}
