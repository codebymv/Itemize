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
export class OrganizationAllowance {
  @Field(() => Int)
  ownedCount: number;

  @Field(() => Int)
  limit: number;

  @Field()
  canCreate: boolean;

  @Field()
  sourcePlan: string;
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

@ObjectType()
export class OrganizationInvitation {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field()
  organizationName: string;

  @Field()
  email: string;

  @Field()
  role: string;

  @Field()
  status: string;

  @Field(() => Int, { nullable: true })
  invitedBy: number | null;

  @Field(() => String, { nullable: true })
  invitedByName: string | null;

  @Field(() => GraphQLISODateTime)
  invitedAt: Date;

  @Field(() => GraphQLISODateTime)
  expiresAt: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastSentAt: Date | null;

  @Field()
  deliverySent: boolean;
}

@ObjectType()
export class OrganizationInvitationPreview {
  @Field()
  organizationName: string;

  @Field()
  email: string;

  @Field()
  role: string;

  @Field()
  status: string;

  @Field(() => GraphQLISODateTime)
  expiresAt: Date;

  @Field(() => String, { nullable: true })
  invitedByName: string | null;
}

@ObjectType()
export class OrganizationInvitationAcceptance {
  @Field(() => Int)
  organizationId: number;

  @Field()
  organizationName: string;

  @Field()
  role: string;
}
