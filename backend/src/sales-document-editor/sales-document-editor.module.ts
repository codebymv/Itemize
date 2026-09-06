import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { EstimatesModule } from '../estimates/estimates.module';
import { InvoiceBusinessesModule } from '../invoice-businesses/invoice-businesses.module';
import { InvoiceSettingsModule } from '../invoice-settings/invoice-settings.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ProductsModule } from '../products/products.module';
import { WorkspaceReferencesModule } from '../workspace-references/workspace-references.module';
import { SalesDocumentEditorResolver } from './sales-document-editor.resolver';
import { SalesDocumentEditorService } from './sales-document-editor.service';

@Module({
  imports: [
    ContactsModule,
    ProductsModule,
    InvoiceBusinessesModule,
    InvoiceSettingsModule,
    InvoicesModule,
    EstimatesModule,
    WorkspaceReferencesModule,
  ],
  providers: [SalesDocumentEditorService, SalesDocumentEditorResolver],
})
export class SalesDocumentEditorModule {}
