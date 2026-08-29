import type {
  SignatureDocument,
  SignatureField,
  SignatureRecipient,
} from '@/services/signaturesApi';

export interface SignatureRecipientSummary {
  total: number;
  waiting: number;
  signed: number;
  attention: number;
}

export interface SignatureDraftReadiness {
  hasTitle: boolean;
  hasFile: boolean;
  hasRecipients: boolean;
  recipientsComplete: boolean;
  hasFields: boolean;
  ready: boolean;
}

export const isSignatureDocumentEditable = (document: SignatureDocument | null): boolean =>
  !document || document.status === 'draft';

export const hasSignatureProcessingFailure = (document: SignatureDocument): boolean =>
  document.delivery_state === 'failed' || document.completion_state === 'dead_letter';

export const getSignatureRecipientSummary = (
  recipients: SignatureRecipient[],
): SignatureRecipientSummary => recipients.reduce<SignatureRecipientSummary>((summary, recipient) => {
  summary.total += 1;
  if (recipient.status === 'signed') {
    summary.signed += 1;
  } else if (recipient.status === 'declined' || recipient.delivery_state === 'dead_letter') {
    summary.attention += 1;
  } else {
    summary.waiting += 1;
  }
  return summary;
}, { total: 0, waiting: 0, signed: 0, attention: 0 });

export const getSignatureDraftReadiness = ({
  title,
  hasFile,
  recipients,
  fields,
}: {
  title: string;
  hasFile: boolean;
  recipients: SignatureRecipient[];
  fields: SignatureField[];
}): SignatureDraftReadiness => {
  const hasTitle = title.trim().length > 0;
  const hasRecipients = recipients.length > 0;
  const recipientsComplete = hasRecipients && recipients.every(recipient =>
    Boolean(recipient.name?.trim())
    && Boolean(recipient.email?.trim())
    && Boolean(recipient.role_name?.trim()),
  );
  const hasFields = fields.length > 0;

  return {
    hasTitle,
    hasFile,
    hasRecipients,
    recipientsComplete,
    hasFields,
    ready: hasTitle && hasFile && recipientsComplete && hasFields,
  };
};
