import { Field, InputType, Int } from '@nestjs/graphql';
import {
  ContactSortField,
  ContactStatus,
  SortDirection,
} from './contact.enums';

@InputType()
export class ContactFilterInput {
  @Field(() => String, { nullable: true })
  search?: string;

  @Field(() => ContactStatus, { nullable: true })
  status?: ContactStatus;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field(() => Int, { nullable: true })
  assignedToId?: number;
}

@InputType()
export class ContactSortInput {
  @Field(() => ContactSortField, { defaultValue: ContactSortField.CREATED_AT })
  field = ContactSortField.CREATED_AT;

  @Field(() => SortDirection, { defaultValue: SortDirection.DESC })
  direction = SortDirection.DESC;
}
