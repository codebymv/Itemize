import {
  Field,
  Float,
  GraphQLISODateTime,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';

/**
 * A named region on the canvas. Membership is spatial and computed by the
 * client from geometry, so a frame carries nothing but its own rectangle,
 * its look, and an optional client binding.
 */
@ObjectType()
export class WorkspaceFrame {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  userId: number;

  @Field()
  title: string;

  @Field()
  colorValue: string;

  /** Flows down onto the cards inside; null pushes nothing. */
  @Field(() => String, { nullable: true })
  category: string | null;

  @Field(() => Float)
  positionX: number;

  @Field(() => Float)
  positionY: number;

  @Field(() => Float)
  width: number;

  @Field(() => Float)
  height: number;

  @Field(() => Int)
  zIndex: number;

  @Field(() => Int, { nullable: true })
  contactId: number | null;

  @Field(() => String, { nullable: true })
  contactName: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  archivedAt: Date | null;
}

@ObjectType()
export class WorkspaceFramePage {
  @Field(() => [WorkspaceFrame])
  nodes: WorkspaceFrame[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class DeleteWorkspaceFrameResult {
  @Field(() => Int)
  deletedId: number;
}
