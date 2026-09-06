import { Injectable } from '@nestjs/common';
import { PageInput } from '../common/pagination';
import { ContactsService } from '../contacts/contacts.service';
import { EstimatesService } from '../estimates/estimates.service';
import { InvoiceBusinessesService } from '../invoice-businesses/invoice-businesses.service';
import { WorkspaceReferencesService } from '../workspace-references/workspace-references.service';
import { InvoiceSettingsService } from '../invoice-settings/invoice-settings.service';
import { InvoicesService } from '../invoices/invoices.service';
import { ProductsService } from '../products/products.service';
import {
  EstimateEditorBootstrap,
  InvoiceEditorBootstrap,
} from './sales-document-editor.types';

const page = (pageNumber: number, pageSize: number): PageInput =>
  Object.assign(new PageInput(), { page: pageNumber, pageSize });

@Injectable()
export class SalesDocumentEditorService {
  constructor(
    private readonly contacts: ContactsService,
    private readonly products: ProductsService,
    private readonly businesses: InvoiceBusinessesService,
    private readonly settings: InvoiceSettingsService,
    private readonly invoices: InvoicesService,
    private readonly estimates: EstimatesService,
    private readonly references: WorkspaceReferencesService,
  ) {}

  async invoiceBootstrap(
    organizationId: number,
    userId: number,
    invoiceId?: number | null,
    includeProducts = false,
  ): Promise<InvoiceEditorBootstrap> {
    const [contactsPage, productsPage, businessesPage, settings, invoice, referencedBy] =
      await Promise.all([
        this.contacts.list(organizationId),
        includeProducts
          ? this.products.list(organizationId, { isActive: true }, page(1, 100))
          : Promise.resolve(null),
        this.businesses.list(organizationId, page(1, 100)),
        this.settings.get(organizationId),
        invoiceId == null
          ? Promise.resolve(null)
          : this.invoices.get(organizationId, invoiceId),
        invoiceId == null
          ? Promise.resolve([])
          : this.references.referencesTo(userId, 'invoice', invoiceId),
      ]);

    return {
      contacts: contactsPage.nodes,
      products: productsPage?.nodes ?? [],
      businesses: businessesPage.nodes,
      settings,
      invoice,
      referencedBy,
    };
  }

  async estimateBootstrap(
    organizationId: number,
    userId: number,
    estimateId?: number | null,
    initialContactId?: number | null,
    includeProducts = false,
  ): Promise<EstimateEditorBootstrap> {
    const [contactsPage, productsPage, estimate, referencedBy] = await Promise.all([
      this.contacts.list(organizationId),
      includeProducts
        ? this.products.list(organizationId, { isActive: true }, page(1, 100))
        : Promise.resolve(null),
      estimateId == null
        ? Promise.resolve(null)
        : this.estimates.get(organizationId, estimateId),
      estimateId == null
        ? Promise.resolve([])
        : this.references.referencesTo(userId, 'estimate', estimateId),
    ]);
    const listedContact = initialContactId == null
      ? null
      : contactsPage.nodes.find((contact) => contact.id === initialContactId) ?? null;
    const initialContact = initialContactId == null || listedContact
      ? listedContact
      : await this.contacts.get(organizationId, initialContactId);

    return {
      contacts: contactsPage.nodes,
      products: productsPage?.nodes ?? [],
      estimate,
      initialContact,
      referencedBy,
    };
  }

}
