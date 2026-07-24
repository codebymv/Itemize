import {
  Field,
  GraphQLISODateTime,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@ObjectType()
export class LandingPageVersion {
  @Field(() => Int) id: number;
  @Field(() => Int) pageId: number;
  @Field(() => Int) versionNumber: number;
  @Field(() => GraphQLJSON) content: Record<string, unknown>;
  @Field(() => String, { nullable: true }) description: string | null;
  @Field(() => Int, { nullable: true }) createdBy: number | null;
  @Field(() => String, { nullable: true }) createdByName: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) publishedAt: Date | null;
  @Field() isCurrent: boolean;
  @Field(() => GraphQLISODateTime) createdAt: Date;
}

@ObjectType()
export class LandingPageVersionsResult {
  @Field(() => [LandingPageVersion]) versions: LandingPageVersion[];
  @Field(() => Int, { nullable: true }) currentVersionId: number | null;
}

@ObjectType()
export class DeleteLandingPageVersionResult {
  @Field(() => Int) deletedId: number;
}
