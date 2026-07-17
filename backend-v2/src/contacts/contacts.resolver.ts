import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  BulkUpdateContactsInput,
  ContactActivityFilterInput,
  ContactFilterInput,
  ContactSortInput,
  CreateContactActivityInput,
  CreateContactInput,
  UpdateContactInput,
} from './contact.inputs';
import {
  BulkContactMutationResult,
  Contact,
  ContactActivity,
  ContactActivityPage,
  ContactContent,
  ContactPage,
  ContactProfile,
  DeleteContactResult,
} from './contact.types';
import { ContactActivitiesService } from './contact-activities.service';
import { ContactContentService } from './contact-content.service';
import { ContactProfileService } from './contact-profile.service';
import { ContactsService } from './contacts.service';

@Resolver(() => Contact)
export class ContactsResolver {
  constructor(
    private readonly contacts: ContactsService,
    private readonly activities: ContactActivitiesService,
    private readonly content: ContactContentService,
    private readonly profiles: ContactProfileService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => ContactProfile)
  contactProfile(
    @Args('contactId', { type: () => Int }) contactId: number,
  ): Promise<ContactProfile> {
    return this.profiles.get(this.organizationId(), contactId);
  }

  @OrganizationScoped()
  @Query(() => ContactContent)
  contactContent(
    @Args('contactId', { type: () => Int }) contactId: number,
  ): Promise<ContactContent> {
    return this.content.get(this.organizationId(), contactId);
  }

  @OrganizationScoped()
  @Query(() => ContactActivityPage)
  contactActivities(
    @Args('contactId', { type: () => Int }) contactId: number,
    @Args('filter', { nullable: true }) filter?: ContactActivityFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<ContactActivityPage> {
    return this.activities.list(this.organizationId(), contactId, filter, page);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ContactActivity)
  addContactActivity(
    @Args('contactId', { type: () => Int }) contactId: number,
    @Args('input') input: CreateContactActivityInput,
  ): Promise<ContactActivity> {
    return this.activities.create(
      this.organizationId(),
      this.userId(),
      contactId,
      input,
    );
  }

  @OrganizationScoped()
  @Query(() => ContactPage, { name: 'contacts' })
  listContacts(
    @Args('filter', { nullable: true }) filter?: ContactFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
    @Args('sort', { nullable: true }) sort?: ContactSortInput,
  ): Promise<ContactPage> {
    return this.contacts.list(
      this.organizationId(),
      filter,
      page,
      sort,
    );
  }

  @OrganizationScoped()
  @Query(() => Contact, { nullable: true })
  contact(@Args('id', { type: () => Int }) id: number): Promise<Contact> {
    return this.contacts.get(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Contact)
  createContact(@Args('input') input: CreateContactInput): Promise<Contact> {
    return this.contacts.create(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Contact)
  updateContact(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateContactInput,
  ): Promise<Contact> {
    return this.contacts.update(this.organizationId(), this.userId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteContactResult)
  async deleteContact(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteContactResult> {
    return { deletedId: await this.contacts.delete(this.organizationId(), id) };
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => BulkContactMutationResult)
  bulkUpdateContacts(
    @Args('input') input: BulkUpdateContactsInput,
  ): Promise<BulkContactMutationResult> {
    return this.contacts.bulkUpdate(
      this.organizationId(),
      this.userId(),
      input,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => BulkContactMutationResult)
  bulkDeleteContacts(
    @Args('contactIds', { type: () => [Int] }) contactIds: number[],
  ): Promise<BulkContactMutationResult> {
    return this.contacts.bulkDelete(this.organizationId(), contactIds);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
