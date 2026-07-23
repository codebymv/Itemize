import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SignatureEmailPreview {
  @Field() html: string;
  @Field() subject: string;
}
