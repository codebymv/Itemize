import { brandedTransactionalEmail } from '../common/branded-transactional-email';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] as string);

export const replaceAdminEmailVariables = (
  value: string,
  variables: Record<string, string>,
): string => {
  let rendered = value;
  for (const [key, replacement] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), replacement);
  }
  return rendered;
};

export const normalizeAdminEmailBaseUrl = (value?: string): string => {
  const fallback = process.env.FRONTEND_URL?.trim() || 'https://itemize.cloud';
  const candidate = value?.trim() || fallback;
  const parsed = new URL(candidate);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('INVALID_BASE_URL');
  }
  return parsed.origin;
};

export const wrapAdminEmail = (
  bodyHtml: string,
  subject: string,
  baseUrl: string,
): string => {
  const safeBaseUrl = escapeHtml(baseUrl);
  const documentBody = bodyHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? bodyHtml;
  return brandedTransactionalEmail({
    assetOrigin: baseUrl,
    previewText: subject,
    heading: subject,
    bodyHtml: documentBody,
    footerHtml:
      `<a href="{{unsubscribeUrl}}" style="color:#2563eb;text-decoration:none">Unsubscribe</a> &middot; ` +
      `<a href="${safeBaseUrl}" style="color:#2563eb;text-decoration:none">Visit Itemize</a>`,
  });
};

export const renderAdminEmail = (
  subject: string,
  bodyHtml: string,
  variables: Record<string, string>,
  baseUrl: string,
): { subject: string; html: string } => {
  const renderedSubject = replaceAdminEmailVariables(subject, variables);
  const renderedBody = replaceAdminEmailVariables(bodyHtml, variables);
  return {
    subject: renderedSubject,
    html: replaceAdminEmailVariables(
      wrapAdminEmail(renderedBody, renderedSubject, baseUrl),
      variables,
    ),
  };
};
