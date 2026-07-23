import { Field, InputType } from '@nestjs/graphql';
import { SignatureDocumentStatus } from './signature-document.enums';

@InputType()
export class SignatureDocumentFilterInput {
  @Field(() => SignatureDocumentStatus, { nullable: true })
  status?: SignatureDocumentStatus;
}
