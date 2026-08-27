import { Field, InputType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@InputType()
export class CreateOrganizationInput {
  @Field()
  name: string;

  @Field(() => GraphQLJSON, { nullable: true })
  settings?: Record<string, unknown>;
}

@InputType()
export class UpdateOrganizationInput {
  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => GraphQLJSON, { nullable: true })
  settings?: Record<string, unknown> | null;

  @Field(() => String, { nullable: true })
  logoUrl?: string | null;
}

@InputType()
export class AddOrganizationMemberInput {
  @Field()
  email: string;

  @Field()
  role: string;
}

@InputType()
export class CreateOrganizationInvitationInput {
  @Field()
  email: string;

  @Field()
  role: string;
}
