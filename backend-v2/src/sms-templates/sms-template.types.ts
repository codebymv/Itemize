import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class SmsMessageInfo {
  @Field(() => Int) length: number;
  @Field(() => Int) segments: number;
  @Field(() => String) encoding: 'GSM' | 'Unicode';
  @Field(() => Int) charsRemaining: number;
}

@ObjectType()
export class SmsTemplate {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field(() => String) name: string;
  @Field(() => String) message: string;
  @Field(() => [String]) variables: string[];
  @Field(() => String) category: string;
  @Field(() => Boolean) isActive: boolean;
  @Field(() => Int, { nullable: true }) createdById: number | null;
  @Field(() => String, { nullable: true }) createdByName: string | null;
  @Field(() => SmsMessageInfo) messageInfo: SmsMessageInfo;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
}

@ObjectType()
export class SmsTemplatePage {
  @Field(() => [SmsTemplate]) nodes: SmsTemplate[];
  @Field(() => PageInfo) pageInfo: PageInfo;
}

@ObjectType()
export class SmsTemplateCategory {
  @Field(() => String) category: string;
  @Field(() => Int) count: number;
}

@ObjectType()
export class DeleteSmsTemplateResult {
  @Field(() => Int) deletedId: number;
  @Field(() => Boolean) success: boolean;
}
