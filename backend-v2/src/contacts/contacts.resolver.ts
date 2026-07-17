import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  ContactFilterInput,
  ContactSortInput,
  CreateContactInput,
  UpdateContactInput,
} from './contact.inputs';
import { Contact, ContactPage, DeleteContactResult } from './contact.types';
import { ContactsService } from './contacts.service';

@Resolver(() => Contact)
export class ContactsResolver {
  constructor(
    private readonly contacts: ContactsService,
    private readonly requestContext: RequestContextService,
  ) {}

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
