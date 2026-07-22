import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AdminEmailLog {
  @Field(() => Int) id: number;
  @Field() recipientEmail: string;
  @Field(() => Int, { nullable: true }) recipientId: number | null;
  @Field(() => String, { nullable: true }) recipientName: string | null;
  @Field() subject: string;
  @Field(() => String, { nullable: true }) bodyHtml: string | null;
  @Field() status: string;
  @Field(() => String, { nullable: true }) externalId: string | null;
  @Field(() => String, { nullable: true }) errorMessage: string | null;
  @Field(() => Int, { nullable: true }) sentBy: number | null;
  @Field(() => String, { nullable: true }) sentByName: string | null;
  @Field(() => String, { nullable: true }) sentByEmail: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) sentAt: Date | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
}

@ObjectType()
export class AdminEmailLogPage {
  @Field(() => [AdminEmailLog]) logs: AdminEmailLog[];
  @Field(() => Int) total: number;
  @Field() hasMore: boolean;
}

@ObjectType()
export class AdminEmailTemplate {
  @Field(() => Int) id: number;
  @Field() name: string;
  @Field() subject: string;
  @Field() bodyHtml: string;
  @Field() category: string;
  @Field() isActive: boolean;
  @Field(() => Int, { nullable: true }) organizationId: number | null;
  @Field(() => String, { nullable: true }) organizationName: string | null;
  @Field(() => Int, { nullable: true }) createdBy: number | null;
  @Field(() => String, { nullable: true }) createdByName: string | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
}

@ObjectType()
export class AdminEmailTemplatePage {
  @Field(() => [AdminEmailTemplate]) templates: AdminEmailTemplate[];
  @Field(() => Int) total: number;
}

@ObjectType()
export class AdminEmailPreview {
  @Field() html: string;
  @Field() subject: string;
}

@ObjectType()
export class AdminEmailBatchResult {
  @Field(() => Int) batchId: number;
  @Field() status: string;
  @Field(() => Int) accepted: number;
  @Field() replayed: boolean;
}
