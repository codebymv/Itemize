import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { SignatureDocumentStatus } from './signature-document.enums';

@InputType()
export class SignatureDocumentFilterInput {
  @Field(() => SignatureDocumentStatus, { nullable: true })
  status?: SignatureDocumentStatus;
}

@InputType()
export class SignatureRecipientInput {
  @Field(() => Int, { nullable: true }) contactId?: number | null;
  @Field(() => String, { nullable: true }) name?: string | null;
  @Field() email: string;
  @Field(() => Int, { nullable: true }) signingOrder?: number;
  @Field(() => String, { nullable: true }) roleName?: string | null;
  @Field(() => String, { nullable: true }) identityMethod?: string;
}

@InputType()
export class SignatureFieldInput {
  @Field(() => Int, { nullable: true }) recipientId?: number | null;
  @Field(() => String, { nullable: true }) roleName?: string | null;
  @Field() fieldType: string;
  @Field(() => Int) pageNumber: number;
  @Field(() => Float) xPosition: number;
  @Field(() => Float) yPosition: number;
  @Field(() => Float) width: number;
  @Field(() => Float) height: number;
  @Field(() => String, { nullable: true }) label?: string | null;
  @Field(() => Boolean, { nullable: true }) isRequired?: boolean;
  @Field(() => String, { nullable: true }) value?: string | null;
  @Field(() => Int, { nullable: true }) fontSize?: number | null;
  @Field(() => String, { nullable: true }) fontFamily?: string | null;
  @Field(() => String, { nullable: true }) textAlign?: string | null;
  @Field(() => Boolean, { nullable: true }) locked?: boolean;
}

@InputType()
export class CreateSignatureDocumentInput {
  @Field() title: string;
  @Field(() => String, { nullable: true }) documentNumber?: string | null;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) message?: string | null;
  @Field(() => Int, { nullable: true }) expirationDays?: number;
  @Field(() => String, { nullable: true }) senderName?: string | null;
  @Field(() => String, { nullable: true }) senderEmail?: string | null;
  @Field(() => String, { nullable: true }) timezone?: string | null;
  @Field(() => String, { nullable: true }) locale?: string | null;
  @Field(() => String, { nullable: true }) routingMode?: string;
  @Field(() => Int, { nullable: true }) templateId?: number | null;
  @Field(() => [SignatureRecipientInput], { nullable: true }) recipients?: SignatureRecipientInput[];
  @Field(() => [SignatureFieldInput], { nullable: true }) fields?: SignatureFieldInput[];
}

@InputType()
export class UpdateSignatureDraftInput {
  @Field(() => String, { nullable: true }) title?: string | null;
  @Field(() => String, { nullable: true }) documentNumber?: string | null;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) message?: string | null;
  @Field(() => Int, { nullable: true }) expirationDays?: number | null;
  @Field(() => String, { nullable: true }) senderName?: string | null;
  @Field(() => String, { nullable: true }) senderEmail?: string | null;
  @Field(() => String, { nullable: true }) timezone?: string | null;
  @Field(() => String, { nullable: true }) locale?: string | null;
  @Field(() => String, { nullable: true }) routingMode?: string | null;
  @Field(() => [SignatureRecipientInput], { nullable: true }) recipients?: SignatureRecipientInput[] | null;
  @Field(() => [SignatureFieldInput], { nullable: true }) fields?: SignatureFieldInput[] | null;
}
