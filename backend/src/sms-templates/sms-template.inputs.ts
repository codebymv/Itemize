import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class SmsTemplateFilterInput {
  @Field(() => String, { nullable: true }) category?: string;
  @Field(() => Boolean, { nullable: true }) isActive?: boolean;
  @Field(() => String, { nullable: true }) search?: string;
}

@InputType()
export class CreateSmsTemplateInput {
  @Field(() => String) name: string;
  @Field(() => String) message: string;
  @Field(() => String, { defaultValue: 'general' }) category = 'general';
  @Field(() => Boolean, { defaultValue: true }) isActive = true;
}

@InputType()
export class UpdateSmsTemplateInput {
  @Field(() => String, { nullable: true }) name?: string | null;
  @Field(() => String, { nullable: true }) message?: string | null;
  @Field(() => String, { nullable: true }) category?: string | null;
  @Field(() => Boolean, { nullable: true }) isActive?: boolean | null;
}
