import {
  Field,
  Float,
  GraphQLISODateTime,
  InputType,
  Int,
} from '@nestjs/graphql';

@InputType()
export class CreateWorkspaceWhiteboardInput {
  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => String, { nullable: true })
  category?: string | null;

  @Field(() => String, { nullable: true })
  canvasData?: string | null;

  @Field(() => Int, { nullable: true })
  canvasWidth?: number | null;

  @Field(() => Int, { nullable: true })
  canvasHeight?: number | null;

  @Field(() => String, { nullable: true })
  backgroundColor?: string | null;

  @Field(() => Float, { nullable: true })
  positionX?: number | null;

  @Field(() => Float, { nullable: true })
  positionY?: number | null;

  @Field(() => Int, { nullable: true })
  zIndex?: number | null;

  @Field(() => String, { nullable: true })
  colorValue?: string | null;
}

@InputType()
export class UpdateWorkspaceWhiteboardInput {
  @Field()
  mutationId: string;

  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt: Date;

  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => String, { nullable: true })
  category?: string | null;

  @Field(() => String, { nullable: true })
  canvasData?: string | null;

  @Field(() => Int, { nullable: true })
  canvasWidth?: number | null;

  @Field(() => Int, { nullable: true })
  canvasHeight?: number | null;

  @Field(() => String, { nullable: true })
  backgroundColor?: string | null;

  @Field(() => Float, { nullable: true })
  positionX?: number | null;

  @Field(() => Float, { nullable: true })
  positionY?: number | null;

  @Field(() => Int, { nullable: true })
  zIndex?: number | null;

  @Field(() => String, { nullable: true })
  colorValue?: string | null;
}
