import type {
  InvoiceEmailPreviewRequest,
  InvoiceEmailPreviewResponse,
} from './invoicesApi';
import { graphqlMutationRequest } from './graphqlClient';

export const previewInvoiceEmailViaGraphql = async (
  request: InvoiceEmailPreviewRequest,
  organizationId?: number,
): Promise<InvoiceEmailPreviewResponse> => {
  const data = await graphqlMutationRequest<
    { previewInvoiceEmail: InvoiceEmailPreviewResponse },
    {
      input: {
        message: string;
        subject?: string;
        includePaymentLink: boolean;
      };
    }
  >(
    `mutation PreviewInvoiceEmail($input: PreviewInvoiceEmailInput!) {
      previewInvoiceEmail(input: $input) { html }
    }`,
    {
      input: {
        message: request.message,
        ...(request.subject === undefined ? {} : { subject: request.subject }),
        includePaymentLink: request.includePaymentLink ?? false,
      },
    },
    organizationId,
  );
  return data.previewInvoiceEmail;
};
