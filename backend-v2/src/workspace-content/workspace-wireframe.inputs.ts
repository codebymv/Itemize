import {
  Field,
  Float,
  GraphQLISODateTime,
  InputType,
  Int,
} from '@nestjs/graphql';

@InputType()
export class CreateWorkspaceWireframeInput {
  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => String, { nullable: true })
  category?: string | null;

  @Field(() => String, { nullable: true })
  flowData?: string | null;

  @Field(() => Float, { nullable: true })
  positionX?: number | null;

  @Field(() => Float, { nullable: true })
  positionY?: number | null;

  @Field(() => Int, { nullable: true })
  width?: number | null;

  @Field(() => Int, { nullable: true })
  height?: number | null;

  @Field(() => Int, { nullable: true })
  zIndex?: number | null;

  @Field(() => String, { nullable: true })
  colorValue?: string | null;
}

@InputType()
export class UpdateWorkspaceWireframeInput {
  @Field()
  mutationId: string;

  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt: Date;

  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => String, { nullable: true })
  category?: string | null;

  @Field(() => String, { nullable: true })
  flowData?: string | null;

  @Field(() => Float, { nullable: true })
  positionX?: number | null;

  @Field(() => Float, { nullable: true })
  positionY?: number | null;

  @Field(() => Int, { nullable: true })
  width?: number | null;

  @Field(() => Int, { nullable: true })
  height?: number | null;

  @Field(() => Int, { nullable: true })
  zIndex?: number | null;

  @Field(() => String, { nullable: true })
  colorValue?: string | null;
}
