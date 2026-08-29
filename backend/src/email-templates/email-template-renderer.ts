import {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} from '../common/branded-transactional-email';
import {
  compileEmailTemplateBody,
  renderEmailHtmlVariables,
  renderEmailTextVariables,
} from './email-template-content';

export type EmailTemplateRenderInput = {
  subject: string;
  preheader?: string | null;
  bodyHtml: string;
  bodyText?: string | null;
  data?: Record<string, unknown>;
  test?: boolean;
  footerText?: string;
  footerHtml?: string;
};

export type RenderedEmailTemplate = {
  subject: string;
  html: string;
  text: string | null;
};

/** Authoritative renderer for user-authored Itemize email content. */
export const renderEmailTemplateDocument = (
  input: EmailTemplateRenderInput,
): RenderedEmailTemplate => {
  const data = input.data ?? {};
  const renderedSubject = renderEmailTextVariables(input.subject, data);
  const subject = input.test ? `[TEST] ${renderedSubject}` : renderedSubject;
  const preheader = renderEmailTextVariables(input.preheader || renderedSubject, data);
  const renderedBody = renderEmailHtmlVariables(input.bodyHtml, data);
  const bodyHtml = compileEmailTemplateBody(renderedBody);
  const testBanner = input.test
    ? '<div style="margin:0 0 18px;padding:10px 12px;background:#fef3c7;color:#92400e;border-radius:8px;font-size:13px;font-weight:700">TEST EMAIL</div>'
    : '';

  return {
    subject,
    html: brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: preheader,
      heading: renderedSubject,
      bodyHtml: `${testBanner}${bodyHtml}`,
      footerText: input.footerText || 'Sent with Itemize.',
      ...(input.footerHtml ? { footerHtml: input.footerHtml } : {}),
    }),
    text: input.bodyText ? renderEmailTextVariables(input.bodyText, data) : null,
  };
};
