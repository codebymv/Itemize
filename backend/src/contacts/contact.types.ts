import {
  Field,
  Float,
  GraphQLISODateTime,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { PageInfo } from '../common/pagination';
import {
  ContactActivityType,
  ContactProfileSectionStatus,
  ContactSource,
  ContactStatus,
} from './contact.enums';

@ObjectType()
export class ContactActivity {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  contactId: number;

  @Field(() => Int, { nullable: true })
  userId: number | null;

  @Field(() => String, { nullable: true })
  userName: string | null;

  @Field(() => String, { nullable: true })
  userEmail: string | null;

  @Field(() => ContactActivityType)
  type: ContactActivityType;

  @Field(() => String, { nullable: true })
  title: string | null;

  @Field(() => GraphQLJSON)
  content: Record<string, unknown>;

  @Field(() => GraphQLJSON)
  metadata: Record<string, unknown>;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class ContactActivityPage {
  @Field(() => [ContactActivity])
  nodes: ContactActivity[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class ContactContentItem {
  @Field(() => Int)
  id: number;

  @Field(() => String)
  title: string;

  @Field(() => String, { nullable: true })
  category: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class ContactContentCollection {
  @Field(() => [ContactContentItem])
  nodes: ContactContentItem[];

  @Field(() => Int)
  total: number;

  @Field(() => Boolean)
  hasMore: boolean;
}

@ObjectType()
export class ContactContent {
  @Field(() => ContactContentCollection)
  lists: ContactContentCollection;

  @Field(() => ContactContentCollection)
  notes: ContactContentCollection;

  @Field(() => ContactContentCollection)
  whiteboards: ContactContentCollection;
}

@ObjectType()
export class ContactProfileInvoice {
  @Field(() => Int)
  id: number;

  @Field()
  number: string;

  @Field()
  status: string;

  @Field(() => Float)
  total: number;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  dueDate: Date;
}

@ObjectType()
export class ContactProfileSignature {
  @Field(() => Int)
  id: number;

  @Field()
  title: string;

  @Field()
  status: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  sentAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  signedAt: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class ContactProfilePayment {
  @Field(() => Int)
  id: number;

  @Field(() => Int, { nullable: true })
  invoiceId: number | null;

  @Field(() => String, { nullable: true })
  invoiceNumber: string | null;

  @Field(() => Float)
  amount: number;

  @Field(() => GraphQLISODateTime)
  date: Date;
}

@ObjectType()
export class ContactProfileCommunication {
  @Field(() => Int)
  id: number;

  @Field()
  type: string;

  @Field()
  direction: string;

  @Field()
  subject: string;

  @Field()
  content: string;

  @Field(() => GraphQLISODateTime)
  date: Date;
}

@ObjectType()
export class ContactProfileNote {
  @Field(() => Int)
  id: number;

  @Field()
  title: string;

  @Field()
  content: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class ContactProfileList {
  @Field(() => Int)
  id: number;

  @Field()
  title: string;

  @Field(() => String, { nullable: true })
  category: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class ContactProfileTask {
  @Field(() => Int)
  id: number;

  @Field()
  title: string;

  @Field()
  description: string;

  @Field()
  status: string;

  @Field()
  priority: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  dueDate: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  completedAt: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class ContactProfileBooking {
  @Field(() => Int)
  id: number;

  @Field()
  title: string;

  @Field(() => Int)
  calendarId: number;

  @Field(() => GraphQLISODateTime)
  startTime: Date;

  @Field(() => GraphQLISODateTime)
  endTime: Date;

  @Field()
  status: string;

  @Field()
  source: string;
}

@ObjectType()
export class ContactProfileInvoiceCollection {
  @Field(() => ContactProfileSectionStatus)
  status: ContactProfileSectionStatus;

  @Field(() => [ContactProfileInvoice])
  nodes: ContactProfileInvoice[];

  @Field(() => Int)
  total: number;

  @Field()
  hasMore: boolean;
}

@ObjectType()
export class ContactProfileSignatureCollection {
  @Field(() => ContactProfileSectionStatus)
  status: ContactProfileSectionStatus;

  @Field(() => [ContactProfileSignature])
  nodes: ContactProfileSignature[];

  @Field(() => Int)
  total: number;

  @Field()
  hasMore: boolean;
}

@ObjectType()
export class ContactProfilePaymentCollection {
  @Field(() => ContactProfileSectionStatus)
  status: ContactProfileSectionStatus;

  @Field(() => [ContactProfilePayment])
  nodes: ContactProfilePayment[];

  @Field(() => Int)
  total: number;

  @Field()
  hasMore: boolean;
}

@ObjectType()
export class ContactProfileActivityCollection {
  @Field(() => ContactProfileSectionStatus)
  status: ContactProfileSectionStatus;

  @Field(() => [ContactActivity])
  nodes: ContactActivity[];

  @Field(() => Int)
  total: number;

  @Field()
  hasMore: boolean;
}

@ObjectType()
export class ContactProfileNoteCollection {
  @Field(() => ContactProfileSectionStatus)
  status: ContactProfileSectionStatus;

  @Field(() => [ContactProfileNote])
  nodes: ContactProfileNote[];

  @Field(() => Int)
  total: number;

  @Field()
  hasMore: boolean;
}

@ObjectType()
export class ContactProfileListCollection {
  @Field(() => ContactProfileSectionStatus)
  status: ContactProfileSectionStatus;

  @Field(() => [ContactProfileList])
  nodes: ContactProfileList[];

  @Field(() => Int)
  total: number;

  @Field()
  hasMore: boolean;
}

@ObjectType()
export class ContactProfileCommunicationCollection {
  @Field(() => ContactProfileSectionStatus)
  status: ContactProfileSectionStatus;

  @Field(() => [ContactProfileCommunication])
  nodes: ContactProfileCommunication[];

  @Field(() => Int)
  total: number;

  @Field()
  hasMore: boolean;
}

@ObjectType()
export class ContactProfileTaskCollection {
  @Field(() => ContactProfileSectionStatus)
  status: ContactProfileSectionStatus;

  @Field(() => [ContactProfileTask])
  nodes: ContactProfileTask[];

  @Field(() => Int)
  total: number;

  @Field()
  hasMore: boolean;
}

@ObjectType()
export class ContactProfileBookingCollection {
  @Field(() => ContactProfileSectionStatus)
  status: ContactProfileSectionStatus;

  @Field(() => [ContactProfileBooking])
  nodes: ContactProfileBooking[];

  @Field(() => Int)
  total: number;

  @Field()
  hasMore: boolean;
}

@ObjectType()
export class Contact {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => String, { nullable: true })
  firstName: string | null;

  @Field(() => String, { nullable: true })
  lastName: string | null;

  @Field(() => String, { nullable: true })
  email: string | null;

  @Field(() => String, { nullable: true })
  phone: string | null;

  @Field(() => String, { nullable: true })
  company: string | null;

  @Field(() => String, { nullable: true })
  jobTitle: string | null;

  @Field(() => GraphQLJSON)
  address: Record<string, unknown>;

  @Field(() => ContactSource)
  source: ContactSource;

  @Field(() => ContactStatus)
  status: ContactStatus;

  @Field(() => GraphQLJSON)
  customFields: Record<string, unknown>;

  @Field(() => [String])
  tags: string[];

  @Field(() => Int, { nullable: true })
  assignedToId: number | null;

  @Field(() => String, { nullable: true })
  assignedToName: string | null;

  @Field(() => String, { nullable: true })
  assignedToEmail: string | null;

  @Field(() => Int, { nullable: true })
  createdById: number | null;

  @Field(() => String, { nullable: true })
  createdByName: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class ContactPage {
  @Field(() => [Contact])
  nodes: Contact[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class ContactProfile {
  @Field(() => Contact)
  contact: Contact;

  @Field(() => ContactProfileInvoiceCollection)
  invoices: ContactProfileInvoiceCollection;

  @Field(() => ContactProfileSignatureCollection)
  signatures: ContactProfileSignatureCollection;

  @Field(() => ContactProfilePaymentCollection)
  payments: ContactProfilePaymentCollection;

  @Field(() => ContactProfileActivityCollection)
  activities: ContactProfileActivityCollection;

  @Field(() => ContactProfileNoteCollection)
  notes: ContactProfileNoteCollection;

  @Field(() => ContactProfileListCollection)
  lists: ContactProfileListCollection;

  @Field(() => ContactProfileCommunicationCollection)
  communications: ContactProfileCommunicationCollection;

  @Field(() => ContactProfileTaskCollection)
  tasks: ContactProfileTaskCollection;

  @Field(() => ContactProfileBookingCollection)
  bookings: ContactProfileBookingCollection;
}

@ObjectType()
export class DeleteContactResult {
  @Field(() => Int)
  deletedId: number;
}

@ObjectType()
export class BulkContactMutationResult {
  @Field(() => [Int])
  requestedIds: number[];

  @Field(() => [Int])
  matchedIds: number[];

  @Field(() => [Int])
  changedIds: number[];

  @Field(() => [Int])
  rejectedIds: number[];
}
