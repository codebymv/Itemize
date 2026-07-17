import {
  Field,
  GraphQLISODateTime,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { PageInfo } from '../common/pagination';
import { ContactActivityType, ContactSource, ContactStatus } from './contact.enums';

@ObjectType()
export class ContactActivity {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  contactId: number;

  @Field(() => Int, { nullable: true })
  userId: number | null;

  @Field(() => String, { nullable: true })
  userName: string | null;

  @Field(() => String, { nullable: true })
  userEmail: string | null;

  @Field(() => ContactActivityType)
  type: ContactActivityType;

  @Field(() => String, { nullable: true })
  title: string | null;

  @Field(() => GraphQLJSON)
  content: Record<string, unknown>;

  @Field(() => GraphQLJSON)
  metadata: Record<string, unknown>;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class ContactActivityPage {
  @Field(() => [ContactActivity])
  nodes: ContactActivity[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class ContactContentItem {
  @Field(() => Int)
  id: number;

  @Field(() => String)
  title: string;

  @Field(() => String, { nullable: true })
  category: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class ContactContentCollection {
  @Field(() => [ContactContentItem])
  nodes: ContactContentItem[];

  @Field(() => Int)
  total: number;

  @Field(() => Boolean)
  hasMore: boolean;
}

@ObjectType()
export class ContactContent {
  @Field(() => ContactContentCollection)
  lists: ContactContentCollection;

  @Field(() => ContactContentCollection)
  notes: ContactContentCollection;

  @Field(() => ContactContentCollection)
  whiteboards: ContactContentCollection;
}

@ObjectType()
export class Contact {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => String, { nullable: true })
  firstName: string | null;

  @Field(() => String, { nullable: true })
  lastName: string | null;

  @Field(() => String, { nullable: true })
  email: string | null;

  @Field(() => String, { nullable: true })
  phone: string | null;

  @Field(() => String, { nullable: true })
  company: string | null;

  @Field(() => String, { nullable: true })
  jobTitle: string | null;

  @Field(() => GraphQLJSON)
  address: Record<string, unknown>;

  @Field(() => ContactSource)
  source: ContactSource;

  @Field(() => ContactStatus)
  status: ContactStatus;

  @Field(() => GraphQLJSON)
  customFields: Record<string, unknown>;

  @Field(() => [String])
  tags: string[];

  @Field(() => Int, { nullable: true })
  assignedToId: number | null;

  @Field(() => String, { nullable: true })
  assignedToName: string | null;

  @Field(() => String, { nullable: true })
  assignedToEmail: string | null;

  @Field(() => Int, { nullable: true })
  createdById: number | null;

  @Field(() => String, { nullable: true })
  createdByName: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class ContactPage {
  @Field(() => [Contact])
  nodes: Contact[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class DeleteContactResult {
  @Field(() => Int)
  deletedId: number;
}

@ObjectType()
export class BulkContactMutationResult {
  @Field(() => [Int])
  requestedIds: number[];

  @Field(() => [Int])
  matchedIds: number[];

  @Field(() => [Int])
  changedIds: number[];

  @Field(() => [Int])
  rejectedIds: number[];
}
