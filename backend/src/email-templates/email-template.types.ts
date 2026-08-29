import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class EmailTemplate {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => String)
  name: string;

  @Field(() => String)
  subject: string;

  @Field(() => String, { nullable: true })
  preheader: string | null;

  @Field(() => String)
  bodyHtml: string;

  @Field(() => String, { nullable: true })
  bodyText: string | null;

  @Field(() => [String])
  variables: string[];

  @Field(() => String)
  category: string;

  @Field(() => Boolean)
  isActive: boolean;

  @Field(() => Int, { nullable: true })
  createdById: number | null;

  @Field(() => String, { nullable: true })
  createdByName: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @Field(() => Int, { nullable: true })
  draftVersion: number | null;

  @Field(() => Int, { nullable: true })
  publishedVersion: number | null;

  @Field(() => String, { nullable: true })
  draftSubject: string | null;

  @Field(() => String, { nullable: true })
  draftPreheader: string | null;

  @Field(() => String, { nullable: true })
  draftBodyHtml: string | null;

  @Field(() => String, { nullable: true })
  draftBodyText: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  draftUpdatedAt: Date | null;

  @Field(() => Boolean, { nullable: true })
  draftIsActive: boolean | null;

  @Field(() => Boolean)
  hasUnpublishedChanges: boolean;
}

@ObjectType()
export class EmailTemplatePreview {
  @Field(() => String)
  subject: string;

  @Field(() => String)
  html: string;

  @Field(() => String, { nullable: true })
  text: string | null;

  @Field(() => [String])
  variables: string[];
}

@ObjectType()
export class EmailTemplatePage {
  @Field(() => [EmailTemplate])
  nodes: EmailTemplate[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class EmailTemplateCategory {
  @Field(() => String)
  category: string;

  @Field(() => Int)
  count: number;
}

@ObjectType()
export class DeleteEmailTemplateResult {
  @Field(() => Int)
  deletedId: number;

  @Field(() => Boolean)
  success: boolean;
}
