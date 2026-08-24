import {
  Field,
  GraphQLISODateTime,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@ObjectType()
export class Organization {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field()
  slug: string;

  @Field(() => GraphQLJSON)
  settings: Record<string, unknown>;

  @Field(() => String, { nullable: true })
  logoUrl: string | null;

  @Field()
  role: string;

  @Field()
  isDefault: boolean;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class OrganizationMember {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => Int)
  userId: number;

  @Field()
  role: string;

  @Field(() => GraphQLISODateTime)
  invitedAt: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  joinedAt: Date | null;

  @Field(() => Int, { nullable: true })
  invitedBy: number | null;

  @Field(() => String, { nullable: true })
  userName: string | null;

  @Field()
  email: string;
}

@ObjectType()
export class DeleteOrganizationResult {
  @Field(() => Int)
  deletedId: number;
}

@ObjectType()
export class RemoveOrganizationMemberResult {
  @Field(() => Int)
  removedMemberId: number;
}
