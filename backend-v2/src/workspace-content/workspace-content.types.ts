import {
  Field,
  Float,
  GraphQLISODateTime,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class WorkspaceListItem {
  @Field()
  id: string;

  @Field()
  text: string;

  @Field()
  completed: boolean;
}

@ObjectType()
export class WorkspaceList {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  userId: number;

  @Field()
  title: string;

  @Field()
  category: string;

  @Field(() => Int, { nullable: true })
  categoryId: number | null;

  @Field(() => [WorkspaceListItem])
  items: WorkspaceListItem[];

  @Field(() => String, { nullable: true })
  colorValue: string | null;

  @Field(() => Float)
  positionX: number;

  @Field(() => Float)
  positionY: number;

  @Field(() => Float, { nullable: true })
  width: number | null;

  @Field(() => Float, { nullable: true })
  height: number | null;

  @Field(() => Int)
  zIndex: number;

  @Field(() => String, { nullable: true })
  shareToken: string | null;

  @Field()
  isPublic: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  sharedAt: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class WorkspaceListPage {
  @Field(() => [WorkspaceList])
  nodes: WorkspaceList[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class WorkspaceNote {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  userId: number;

  @Field()
  title: string;

  @Field()
  content: string;

  @Field()
  category: string;

  @Field(() => Int, { nullable: true })
  categoryId: number | null;

  @Field(() => String, { nullable: true })
  colorValue: string | null;

  @Field(() => Float)
  positionX: number;

  @Field(() => Float)
  positionY: number;

  @Field(() => Float, { nullable: true })
  width: number | null;

  @Field(() => Float, { nullable: true })
  height: number | null;

  @Field(() => Int)
  zIndex: number;

  @Field(() => String, { nullable: true })
  shareToken: string | null;

  @Field()
  isPublic: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  sharedAt: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class WorkspaceNotePage {
  @Field(() => [WorkspaceNote])
  nodes: WorkspaceNote[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}
