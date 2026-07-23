import { Module } from '@nestjs/common';
import { SignatureDocumentsRepository } from './signature-documents.repository';
import { SignatureDocumentsResolver } from './signature-documents.resolver';
import { SignatureDocumentsService } from './signature-documents.service';

@Module({ providers: [SignatureDocumentsRepository, SignatureDocumentsService, SignatureDocumentsResolver] })
export class SignatureDocumentsModule {}
