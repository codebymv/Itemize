import { registerEnumType } from '@nestjs/graphql';

export enum SignatureDocumentStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

registerEnumType(SignatureDocumentStatus, { name: 'SignatureDocumentStatus' });
