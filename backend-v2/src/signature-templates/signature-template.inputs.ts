import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { SignatureRecipientInput } from '../signature-documents/signature-document.inputs';

@InputType()
export class SignatureTemplateRoleInput {
  @Field() roleName: string;
  @Field(() => Int, { nullable: true }) signingOrder?: number;
}

@InputType()
export class SignatureTemplateFieldInput {
  @Field(() => String, { nullable: true }) roleName?: string | null;
  @Field() fieldType: string;
  @Field(() => Int) pageNumber: number;
  @Field(() => Float) xPosition: number;
  @Field(() => Float) yPosition: number;
  @Field(() => Float) width: number;
  @Field(() => Float) height: number;
  @Field(() => String, { nullable: true }) label?: string | null;
  @Field(() => Boolean, { nullable: true }) isRequired?: boolean;
  @Field(() => Int, { nullable: true }) fontSize?: number | null;
  @Field(() => String, { nullable: true }) fontFamily?: string | null;
  @Field(() => String, { nullable: true }) textAlign?: string | null;
  @Field(() => Boolean, { nullable: true }) locked?: boolean;
}

@InputType()
export class CreateSignatureTemplateInput {
  @Field() title: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) message?: string | null;
  @Field(() => [SignatureTemplateRoleInput], { nullable: true }) roles?: SignatureTemplateRoleInput[];
  @Field(() => [SignatureTemplateFieldInput], { nullable: true }) fields?: SignatureTemplateFieldInput[];
}

@InputType()
export class UpdateSignatureTemplateInput {
  @Field(() => String, { nullable: true }) title?: string | null;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) message?: string | null;
  @Field(() => [SignatureTemplateRoleInput], { nullable: true }) roles?: SignatureTemplateRoleInput[] | null;
  @Field(() => [SignatureTemplateFieldInput], { nullable: true }) fields?: SignatureTemplateFieldInput[] | null;
}

@InputType()
export class InstantiateSignatureTemplateInput {
  @Field(() => String, { nullable: true }) title?: string | null;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) message?: string | null;
  @Field(() => String, { nullable: true }) routingMode?: string;
  @Field(() => Int, { nullable: true }) expirationDays?: number;
  @Field(() => String, { nullable: true }) senderName?: string | null;
  @Field(() => String, { nullable: true }) senderEmail?: string | null;
  @Field(() => [SignatureRecipientInput], { nullable: true }) recipients?: SignatureRecipientInput[];
}
