import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class EmailTemplateFilterInput {
  @Field(() => String, { nullable: true })
  category?: string;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean;

  @Field(() => String, { nullable: true })
  search?: string;
}

@InputType()
export class CreateEmailTemplateInput {
  @Field(() => String)
  name: string;

  @Field(() => String)
  subject: string;

  @Field(() => String)
  bodyHtml: string;

  @Field(() => String, { nullable: true })
  bodyText?: string | null;

  @Field(() => String, { defaultValue: 'general' })
  category = 'general';

  @Field(() => Boolean, { defaultValue: true })
  isActive = true;
}

@InputType()
export class UpdateEmailTemplateInput {
  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => String, { nullable: true })
  subject?: string | null;

  @Field(() => String, { nullable: true })
  bodyHtml?: string | null;

  @Field(() => String, { nullable: true })
  bodyText?: string | null;

  @Field(() => String, { nullable: true })
  category?: string | null;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean | null;
}
