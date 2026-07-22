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

export const wrapAdminEmail = (bodyHtml: string, subject: string, baseUrl: string): string => {
  if (/<!doctype|<html[\s>]/i.test(bodyHtml)) return bodyHtml;
  const safeSubject = escapeHtml(subject);
  const safeBaseUrl = escapeHtml(baseUrl);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeSubject}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1e293b;background:#fff;margin:0;padding:0">
<div style="max-width:600px;margin:0 auto;padding:20px;background:#fff">
<div style="text-align:center;padding:20px;background:#fff;border-radius:12px 12px 0 0"><a href="${safeBaseUrl}" target="_blank" rel="noopener"><img src="${safeBaseUrl}/cover.png" alt="Itemize" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0"></a></div>
<div style="background:#fff;padding:40px 30px;border-radius:0 0 12px 12px;box-shadow:0 4px 6px -1px rgba(0,0,0,.1)">${bodyHtml}</div>
<div style="text-align:center;padding:30px 20px;color:#64748b;font-size:13px"><p style="margin:0 0 10px">© ${new Date().getUTCFullYear()} Itemize. All rights reserved.</p><p style="margin:0"><a href="{{unsubscribeUrl}}" style="color:#2563eb;text-decoration:none">Unsubscribe</a> · <a href="${safeBaseUrl}" style="color:#2563eb;text-decoration:none">Visit Website</a></p></div>
</div></body></html>`;
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
