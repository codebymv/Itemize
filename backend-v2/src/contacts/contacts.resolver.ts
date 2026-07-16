import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import { ContactFilterInput, ContactSortInput } from './contact.inputs';
import { Contact, ContactPage } from './contact.types';
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

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
