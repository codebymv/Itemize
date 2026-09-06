import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

/**
 * A reference a workspace card makes to a CRM or money entity, hydrated for
 * the card's owner with the entity's current label and state. Anything the
 * owner can no longer reach is omitted, so a pill renders as plain text.
 */
@ObjectType()
export class WorkspaceReference {
  @Field()
  entityType: string;

  @Field(() => Int)
  entityId: number;

  @Field()
  label: string;

  @Field(() => String, { nullable: true })
  status: string | null;

  @Field(() => String, { nullable: true })
  total: string | null;

  @Field(() => String, { nullable: true })
  currency: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  sentAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  viewedAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  paidAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  acceptedAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  declinedAt: Date | null;
}

/** A workspace card that references an entity, for the entity page's back-trace. */
@ObjectType()
export class WorkspaceReferenceSource {
  @Field()
  sourceType: string;

  @Field(() => Int)
  sourceId: number;

  @Field()
  title: string;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

/** One row of the `$` list: a money document the organization owns. */
@ObjectType()
export class MoneyDocumentSuggestion {
  @Field()
  entityType: string;

  @Field(() => Int)
  entityId: number;

  @Field()
  label: string;

  @Field(() => String, { nullable: true })
  detail: string | null;

  @Field(() => String, { nullable: true })
  status: string | null;

  @Field(() => String, { nullable: true })
  total: string | null;

  @Field(() => String, { nullable: true })
  currency: string | null;

  @Field(() => Int, { nullable: true })
  contactId: number | null;
}
