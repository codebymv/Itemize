import { Field, Float, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SignatureTemplate {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field() title: string;
  @Field(() => String, { nullable: true }) description: string | null;
  @Field(() => String, { nullable: true }) message: string | null;
  @Field() hasFile: boolean;
  @Field(() => String, { nullable: true }) fileName: string | null;
  @Field(() => String, { nullable: true }) fileType: string | null;
  @Field(() => Float, { nullable: true }) fileSize: number | null;
  @Field(() => Int, { nullable: true }) createdById: number | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
}

@ObjectType()
export class SignatureTemplateRole {
  @Field(() => Int) id: number;
  @Field(() => Int) templateId: number;
  @Field() roleName: string;
  @Field(() => Int) signingOrder: number;
}

@ObjectType()
export class SignatureTemplateField {
  @Field(() => Int) id: number;
  @Field(() => Int) templateId: number;
  @Field(() => String, { nullable: true }) roleName: string | null;
  @Field() fieldType: string;
  @Field(() => Int) pageNumber: number;
  @Field(() => Float) xPosition: number;
  @Field(() => Float) yPosition: number;
  @Field(() => Float) width: number;
  @Field(() => Float) height: number;
  @Field(() => String, { nullable: true }) label: string | null;
  @Field() isRequired: boolean;
  @Field(() => Int, { nullable: true }) fontSize: number | null;
  @Field(() => String, { nullable: true }) fontFamily: string | null;
  @Field(() => String, { nullable: true }) textAlign: string | null;
  @Field() locked: boolean;
}

@ObjectType()
export class SignatureTemplateDetail {
  @Field(() => SignatureTemplate) template: SignatureTemplate;
  @Field(() => [SignatureTemplateRole]) roles: SignatureTemplateRole[];
  @Field(() => [SignatureTemplateField]) fields: SignatureTemplateField[];
}
