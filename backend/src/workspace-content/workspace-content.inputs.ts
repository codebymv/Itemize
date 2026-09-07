import { Field, Float, InputType, Int } from '@nestjs/graphql';

@InputType()
export class WorkspaceContentFilterInput {
  @Field(() => String, { nullable: true })
  search?: string;

  @Field(() => Int, { nullable: true })
  categoryId?: number;

  /** `active` (default), `archived`, or `all`. */
  @Field(() => String, { nullable: true })
  archived?: string | null;
}

@InputType()
export class SetWorkspaceContentArchivedInput {
  @Field()
  mutationId: string;

  /** list | note | whiteboard | wireframe | frame */
  @Field()
  type: string;

  @Field(() => Int)
  id: number;

  @Field()
  archived: boolean;
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
