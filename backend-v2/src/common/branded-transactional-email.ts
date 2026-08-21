export type BrandedTransactionalEmailInput = {
  assetOrigin: string;
  previewText: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerText?: string;
};

const EMAIL_TOKENS = {
  background: '#f1f5f9',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  foreground: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  border: '#e2e8f0',
  primary: '#2563eb',
  radius: '12px',
  controlRadius: '8px',
  font: "'Raleway','Segoe UI',Roboto,Arial,sans-serif",
} as const;

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] as string);

export const transactionalEmailAssetOrigin = (
  environment: NodeJS.ProcessEnv = process.env,
): string => {
  const fallback = 'https://itemize.cloud';
  try {
    const configured = new URL(
      environment.EMAIL_ASSET_ORIGIN
      ?? environment.PROD_URL
      ?? fallback,
    );
    return configured.protocol === 'https:' ? configured.origin : fallback;
  } catch {
    return fallback;
  }
};

export const brandedTransactionalEmail = (
  input: BrandedTransactionalEmailInput,
): string => {
  const origin = input.assetOrigin.replace(/\/$/, '');
  const logoUrl = escapeHtml(`${origin}/cover.png`);
  const cta = input.cta
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px"><tr><td align="center">` +
      `<a href="${escapeHtml(input.cta.url)}" style="display:inline-block;background:${EMAIL_TOKENS.primary};color:#ffffff!important;text-decoration:none;padding:14px 24px;border-radius:${EMAIL_TOKENS.controlRadius};font-size:15px;font-weight:800;line-height:20px">${escapeHtml(input.cta.label)}</a>` +
      `</td></tr></table>`
    : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">` +
    `<title>${escapeHtml(input.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:${EMAIL_TOKENS.background};color:${EMAIL_TOKENS.foreground};font-family:${EMAIL_TOKENS.font};-webkit-text-size-adjust:100%">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.previewText)}</div>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${EMAIL_TOKENS.background}">` +
    `<tr><td align="center" style="padding:32px 16px">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:${EMAIL_TOKENS.surface};border:1px solid ${EMAIL_TOKENS.border};border-radius:${EMAIL_TOKENS.radius};overflow:hidden">` +
    `<tr><td style="height:4px;background:${EMAIL_TOKENS.primary};font-size:0;line-height:0">&nbsp;</td></tr>` +
    `<tr><td style="padding:18px 28px;border-bottom:1px solid ${EMAIL_TOKENS.border}">` +
    `<a href="${escapeHtml(origin)}" style="display:inline-block;text-decoration:none;color:${EMAIL_TOKENS.foreground}" aria-label="Itemize">` +
    `<img src="${logoUrl}" width="160" alt="Itemize" style="display:block;width:160px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none">` +
    `</a></td></tr>` +
    `<tr><td style="padding:32px 28px 28px">` +
    `<h1 style="margin:0 0 20px;color:${EMAIL_TOKENS.foreground};font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-0.02em">${escapeHtml(input.heading)}</h1>` +
    `<div style="color:${EMAIL_TOKENS.body};font-size:15px;line-height:1.65">${input.bodyHtml}</div>${cta}` +
    `</td></tr>` +
    `<tr><td style="padding:20px 28px;background:${EMAIL_TOKENS.surfaceMuted};border-top:1px solid ${EMAIL_TOKENS.border};color:${EMAIL_TOKENS.muted};font-size:12px;line-height:1.5">` +
    `${escapeHtml(input.footerText || 'Sent securely with Itemize.')}` +
    `</td></tr></table></td></tr></table></body></html>`;
};
