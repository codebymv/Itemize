import {
  Field,
  Float,
  GraphQLISODateTime,
  InputType,
  Int,
} from '@nestjs/graphql';

@InputType()
export class WorkspaceListItemInput {
  @Field()
  id: string;

  @Field()
  text: string;

  @Field()
  completed: boolean;
}

@InputType()
export class CreateWorkspaceListInput {
  @Field()
  title: string;

  @Field(() => String, { nullable: true })
  category?: string | null;

  @Field(() => [WorkspaceListItemInput], { nullable: true })
  items?: WorkspaceListItemInput[] | null;

  @Field(() => String, { nullable: true })
  colorValue?: string | null;

  @Field(() => Float, { nullable: true })
  positionX?: number | null;

  @Field(() => Float, { nullable: true })
  positionY?: number | null;

  @Field(() => Int, { nullable: true })
  width?: number | null;

  @Field(() => Int, { nullable: true })
  height?: number | null;
}

@InputType()
export class UpdateWorkspaceListInput {
  @Field()
  mutationId: string;

  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt: Date;

  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => String, { nullable: true })
  category?: string | null;

  @Field(() => [WorkspaceListItemInput], { nullable: true })
  items?: WorkspaceListItemInput[] | null;

  @Field(() => String, { nullable: true })
  colorValue?: string | null;

  @Field(() => Float, { nullable: true })
  positionX?: number | null;

  @Field(() => Float, { nullable: true })
  positionY?: number | null;

  @Field(() => Int, { nullable: true })
  width?: number | null;

  @Field(() => Int, { nullable: true })
  height?: number | null;
}
