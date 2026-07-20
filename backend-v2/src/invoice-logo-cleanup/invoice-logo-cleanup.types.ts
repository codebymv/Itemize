import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class InvoiceLogoRemovalResult {
  @Field()
  success: boolean;

  @Field()
  cleanupQueued: boolean;
}
