import { Field, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@InputType()
export class LandingPageFilterInput {
  @Field(() => String, { nullable: true }) status?: string;
  @Field(() => String, { nullable: true }) search?: string;
}

@InputType()
export class LandingPageSectionInput {
  @Field() sectionType: string;
  @Field(() => String, { nullable: true }) name?: string | null;
  @Field(() => GraphQLJSON, { nullable: true }) content?: Record<string, unknown>;
  @Field(() => GraphQLJSON, { nullable: true }) settings?: Record<string, unknown>;
}

@InputType()
export class CreateLandingPageInput {
  @Field() name: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) slug?: string;
  @Field(() => GraphQLJSON, { nullable: true }) theme?: Record<string, unknown>;
  @Field(() => GraphQLJSON, { nullable: true }) settings?: Record<string, unknown>;
  @Field(() => String, { nullable: true }) seoTitle?: string | null;
  @Field(() => String, { nullable: true }) seoDescription?: string | null;
  @Field(() => String, { nullable: true }) seoKeywords?: string | null;
  @Field(() => String, { nullable: true }) ogImage?: string | null;
  @Field(() => [LandingPageSectionInput], { nullable: true })
  sections?: LandingPageSectionInput[];
}

@InputType()
export class UpdateLandingPageInput {
  @Field(() => String, { nullable: true }) name?: string | null;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) slug?: string | null;
  @Field(() => String, { nullable: true }) status?: string | null;
  @Field(() => GraphQLJSON, { nullable: true }) theme?: Record<string, unknown> | null;
  @Field(() => GraphQLJSON, { nullable: true }) settings?: Record<string, unknown> | null;
  @Field(() => String, { nullable: true }) seoTitle?: string | null;
  @Field(() => String, { nullable: true }) seoDescription?: string | null;
  @Field(() => String, { nullable: true }) seoKeywords?: string | null;
  @Field(() => String, { nullable: true }) ogImage?: string | null;
  @Field(() => String, { nullable: true }) faviconUrl?: string | null;
  @Field(() => String, { nullable: true }) customCss?: string | null;
  @Field(() => String, { nullable: true }) customJs?: string | null;
  @Field(() => String, { nullable: true }) customHead?: string | null;
}

@InputType()
export class AddLandingPageSectionInput extends LandingPageSectionInput {
  @Field(() => Int, { nullable: true }) position?: number;
}

@InputType()
export class UpdateLandingPageSectionInput {
  @Field(() => String, { nullable: true }) sectionType?: string | null;
  @Field(() => String, { nullable: true }) name?: string | null;
  @Field(() => GraphQLJSON, { nullable: true }) content?: Record<string, unknown> | null;
  @Field(() => GraphQLJSON, { nullable: true }) settings?: Record<string, unknown> | null;
}
