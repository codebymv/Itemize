import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SignatureFileGuard } from './signature-file.guard';
import {
  LegacySignatureFileStorage,
  SIGNATURE_FILE_STORAGE,
} from './signature-file-storage.provider';
import { SignatureFilesController } from './signature-files.controller';
import { SignatureFilesRepository } from './signature-files.repository';
import { SignatureFilesService } from './signature-files.service';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [SignatureFilesController],
  providers: [
    SignatureFileGuard,
    SignatureFilesRepository,
    SignatureFilesService,
    LegacySignatureFileStorage,
    {
      provide: SIGNATURE_FILE_STORAGE,
      useExisting: LegacySignatureFileStorage,
    },
  ],
})
export class SignatureFilesModule {}
