import { Field, Float, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';
import { SignatureDocumentStatus } from './signature-document.enums';

@ObjectType()
export class SignatureDocument {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field() title: string;
  @Field(() => String, { nullable: true }) documentNumber: string | null;
  @Field(() => String, { nullable: true }) description: string | null;
  @Field(() => String, { nullable: true }) message: string | null;
  @Field(() => SignatureDocumentStatus) status: SignatureDocumentStatus;
  @Field(() => Int) recipientCount: number;
  @Field() routingMode: string;
  @Field(() => Int, { nullable: true }) templateId: number | null;
  @Field(() => Int) expirationDays: number;
  @Field(() => GraphQLISODateTime, { nullable: true }) expiresAt: Date | null;
  @Field(() => String, { nullable: true }) senderName: string | null;
  @Field(() => String, { nullable: true }) senderEmail: string | null;
  @Field(() => Int, { nullable: true }) createdById: number | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) sentAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) completedAt: Date | null;
  @Field() hasFile: boolean;
  @Field() hasSignedFile: boolean;
  @Field(() => String, { nullable: true }) fileName: string | null;
  @Field(() => String, { nullable: true }) fileType: string | null;
  @Field(() => Float, { nullable: true }) fileSize: number | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
}

@ObjectType()
export class SignatureRecipient {
  @Field(() => Int) id: number;
  @Field(() => Int) documentId: number;
  @Field(() => Int) organizationId: number;
  @Field(() => Int, { nullable: true }) contactId: number | null;
  @Field(() => String, { nullable: true }) name: string | null;
  @Field() email: string;
  @Field(() => Int) signingOrder: number;
  @Field(() => String, { nullable: true }) roleName: string | null;
  @Field() routingStatus: string;
  @Field() status: string;
  @Field(() => GraphQLISODateTime, { nullable: true }) sentAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) viewedAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) signedAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) declinedAt: Date | null;
  @Field(() => String, { nullable: true }) declineReason: string | null;
  @Field() identityMethod: string;
  @Field(() => GraphQLISODateTime, { nullable: true }) identityVerifiedAt: Date | null;
}

@ObjectType()
export class SignatureField {
  @Field(() => Int) id: number;
  @Field(() => Int) documentId: number;
  @Field(() => Int, { nullable: true }) recipientId: number | null;
  @Field(() => String, { nullable: true }) roleName: string | null;
  @Field() fieldType: string;
  @Field(() => Int) pageNumber: number;
  @Field(() => Float) xPosition: number;
  @Field(() => Float) yPosition: number;
  @Field(() => Float) width: number;
  @Field(() => Float) height: number;
  @Field(() => String, { nullable: true }) label: string | null;
  @Field() isRequired: boolean;
  @Field(() => String, { nullable: true }) value: string | null;
  @Field(() => Int, { nullable: true }) fontSize: number | null;
  @Field(() => String, { nullable: true }) fontFamily: string | null;
  @Field(() => String, { nullable: true }) textAlign: string | null;
  @Field() locked: boolean;
}

@ObjectType()
export class SignatureAuditEvent {
  @Field(() => Int) id: number;
  @Field(() => Int) documentId: number;
  @Field(() => Int, { nullable: true }) recipientId: number | null;
  @Field() eventType: string;
  @Field(() => String, { nullable: true }) description: string | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
}

@ObjectType()
export class SignatureDocumentPage {
  @Field(() => [SignatureDocument]) nodes: SignatureDocument[];
  @Field(() => PageInfo) pageInfo: PageInfo;
}

@ObjectType()
export class SignatureDocumentDetail {
  @Field(() => SignatureDocument) document: SignatureDocument;
  @Field(() => [SignatureRecipient]) recipients: SignatureRecipient[];
  @Field(() => [SignatureField]) fields: SignatureField[];
  @Field(() => [SignatureAuditEvent]) audit: SignatureAuditEvent[];
}
