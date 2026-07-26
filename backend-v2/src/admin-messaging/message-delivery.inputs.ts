import { Field, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@InputType()
export class EnqueueContactEmailInput {
  @Field(() => Int) contactId: number;
  @Field(() => Int, { nullable: true }) templateId?: number | null;
  @Field(() => String, { nullable: true }) subject?: string | null;
  @Field(() => String, { nullable: true }) bodyHtml?: string | null;
  @Field(() => String, { nullable: true }) bodyText?: string | null;
  @Field(() => String, { nullable: true }) replyTo?: string | null;
  @Field() idempotencyKey: string;
}

@InputType()
export class EnqueueContactSmsInput {
  @Field(() => Int) contactId: number;
  @Field(() => Int, { nullable: true }) templateId?: number | null;
  @Field(() => String, { nullable: true }) message?: string | null;
  @Field() idempotencyKey: string;
}

@InputType()
export class SendEmailTemplateTestInput {
  @Field(() => Int) templateId: number;
  @Field() toEmail: string;
  @Field(() => GraphQLJSON, { nullable: true })
  sampleData?: Record<string, unknown> | null;
  @Field() idempotencyKey: string;
}

@InputType()
export class SendSmsTemplateTestInput {
  @Field(() => Int) templateId: number;
  @Field() toPhone: string;
  @Field(() => GraphQLJSON, { nullable: true })
  sampleData?: Record<string, unknown> | null;
  @Field() idempotencyKey: string;
}
