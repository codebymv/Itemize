import {
  Field,
  Float,
  GraphQLISODateTime,
  InputType,
  Int,
} from '@nestjs/graphql';

@InputType()
export class CreateWorkspaceFrameInput {
  @Field()
  idempotencyKey: string;

  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => String, { nullable: true })
  category?: string | null;

  @Field(() => String, { nullable: true })
  colorValue?: string | null;

  @Field(() => Float, { nullable: true })
  positionX?: number | null;

  @Field(() => Float, { nullable: true })
  positionY?: number | null;

  @Field(() => Float, { nullable: true })
  width?: number | null;

  @Field(() => Float, { nullable: true })
  height?: number | null;

  @Field(() => Int, { nullable: true })
  contactId?: number | null;
}

@InputType()
export class UpdateWorkspaceFrameInput {
  @Field()
  mutationId: string;

  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt: Date;

  @Field(() => String, { nullable: true })
  title?: string | null;

  /** Null clears the frame's category. */
  @Field(() => String, { nullable: true })
  category?: string | null;

  @Field(() => String, { nullable: true })
  colorValue?: string | null;

  @Field(() => Float, { nullable: true })
  positionX?: number | null;

  @Field(() => Float, { nullable: true })
  positionY?: number | null;

  @Field(() => Float, { nullable: true })
  width?: number | null;

  @Field(() => Float, { nullable: true })
  height?: number | null;

  @Field(() => Int, { nullable: true })
  contactId?: number | null;
}
