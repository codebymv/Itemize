import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CreateInvoiceBusinessInput {
  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => String, { nullable: true })
  phone?: string | null;

  @Field(() => String, { nullable: true })
  address?: string | null;

  @Field(() => String, { nullable: true })
  taxId?: string | null;
}

@InputType()
export class UpdateInvoiceBusinessInput {
  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => String, { nullable: true })
  phone?: string | null;

  @Field(() => String, { nullable: true })
  address?: string | null;

  @Field(() => String, { nullable: true })
  taxId?: string | null;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean | null;
}
