import { Module } from '@nestjs/common';
import { EmailTemplatesRepository } from './email-templates.repository';
import { EmailTemplatesResolver } from './email-templates.resolver';
import { EmailTemplatesService } from './email-templates.service';

@Module({
  providers: [EmailTemplatesRepository, EmailTemplatesService, EmailTemplatesResolver],
  exports: [EmailTemplatesService],
})
export class EmailTemplatesModule {}
