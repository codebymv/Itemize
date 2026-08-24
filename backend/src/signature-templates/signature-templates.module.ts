import { Module } from '@nestjs/common';
import { SignatureTemplatesRepository } from './signature-templates.repository';
import { SignatureTemplatesResolver } from './signature-templates.resolver';
import { SignatureTemplatesService } from './signature-templates.service';

@Module({providers:[SignatureTemplatesRepository,SignatureTemplatesService,SignatureTemplatesResolver]})
export class SignatureTemplatesModule {}
