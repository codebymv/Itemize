import { Field, Float, InputType, Int } from '@nestjs/graphql';

@InputType()
export class WorkspaceContentFilterInput {
  @Field(() => String, { nullable: true })
  search?: string;

  @Field(() => Int, { nullable: true })
  categoryId?: number;
}

@InputType()
export class CanvasPositionUpdateInput {
  @Field()
  type: string;

  @Field(() => Int)
  id: number;

  @Field(() => Float)
  positionX: number;

  @Field(() => Float)
  positionY: number;

  @Field(() => Float, { nullable: true })
  width?: number;

  @Field(() => Float, { nullable: true })
  height?: number;
}

@InputType()
export class BatchCanvasPositionsInput {
  @Field()
  mutationId: string;

  @Field(() => [CanvasPositionUpdateInput])
  updates: CanvasPositionUpdateInput[];
}
