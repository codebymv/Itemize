import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvoiceLogoCleanupModule } from '../invoice-logo-cleanup/invoice-logo-cleanup.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { InvoiceLogoUploadGuard } from './invoice-logo-upload.guard';
import { InvoiceLogoUploadsController } from './invoice-logo-uploads.controller';
import { InvoiceLogoUploadsRepository } from './invoice-logo-uploads.repository';
import { InvoiceLogoUploadsService } from './invoice-logo-uploads.service';

@Module({
  imports: [AuthModule, OrganizationsModule, InvoiceLogoCleanupModule],
  controllers: [InvoiceLogoUploadsController],
  providers: [InvoiceLogoUploadGuard, InvoiceLogoUploadsRepository, InvoiceLogoUploadsService],
})
export class InvoiceLogoUploadsModule {}
