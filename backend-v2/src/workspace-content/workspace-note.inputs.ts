import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class CreateWorkspaceNoteInput {
  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => String, { nullable: true })
  content?: string | null;

  @Field(() => String, { nullable: true })
  category?: string | null;

  @Field(() => String, { nullable: true })
  colorValue?: string | null;

  @Field(() => Int, { nullable: true })
  positionX?: number | null;

  @Field(() => Int, { nullable: true })
  positionY?: number | null;

  @Field(() => Int, { nullable: true })
  width?: number | null;

  @Field(() => Int, { nullable: true })
  height?: number | null;

  @Field(() => Int, { nullable: true })
  zIndex?: number | null;
}

@InputType()
export class UpdateWorkspaceNoteInput {
  @Field()
  mutationId: string;

  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => String, { nullable: true })
  content?: string | null;

  @Field(() => String, { nullable: true })
  category?: string | null;

  @Field(() => String, { nullable: true })
  colorValue?: string | null;

  @Field(() => Int, { nullable: true })
  positionX?: number | null;

  @Field(() => Int, { nullable: true })
  positionY?: number | null;

  @Field(() => Int, { nullable: true })
  width?: number | null;

  @Field(() => Int, { nullable: true })
  height?: number | null;

  @Field(() => Int, { nullable: true })
  zIndex?: number | null;
}
