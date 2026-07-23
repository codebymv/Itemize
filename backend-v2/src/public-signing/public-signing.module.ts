import { Module } from '@nestjs/common';
import { SignatureFilesModule } from '../signature-files/signature-files.module';
import { PublicSigningController } from './public-signing.controller';
import { PublicSigningRepository } from './public-signing.repository';
import { PublicSigningService } from './public-signing.service';
import { SignatureCompletionJobsRepository } from './signature-completion-jobs.repository';
import { SignatureCompletionJobsService } from './signature-completion-jobs.service';

@Module({
  imports: [SignatureFilesModule],
  controllers: [PublicSigningController],
  providers: [
    PublicSigningRepository,
    PublicSigningService,
    SignatureCompletionJobsRepository,
    SignatureCompletionJobsService,
  ],
  exports: [
    PublicSigningRepository,
    PublicSigningService,
    SignatureCompletionJobsRepository,
    SignatureCompletionJobsService,
  ],
})
export class PublicSigningModule {}
