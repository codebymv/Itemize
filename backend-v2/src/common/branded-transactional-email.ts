export type BrandedTransactionalEmailInput = {
  assetOrigin: string;
  previewText: string;
  eyebrow: string;
  reference?: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerText?: string;
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] as string);

export const brandedTransactionalEmail = (
  input: BrandedTransactionalEmailInput,
): string => {
  const origin = input.assetOrigin.replace(/\/$/, '');
  const iconUrl = escapeHtml(`${origin}/icon.png`);
  const wordmarkUrl = escapeHtml(`${origin}/textblack.png`);
  const reference = input.reference
    ? `<td align="right" style="padding-left:16px;white-space:nowrap">` +
      `<span style="display:inline-block;background:#2563eb;color:#ffffff;border-radius:999px;padding:7px 11px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase">${escapeHtml(input.reference)}</span>` +
      `</td>`
    : '';
  const cta = input.cta
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px"><tr><td align="center">` +
      `<a href="${escapeHtml(input.cta.url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px;font-weight:700;line-height:20px">${escapeHtml(input.cta.label)}</a>` +
      `</td></tr></table>`
    : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">` +
    `<title>${escapeHtml(input.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.previewText)}</div>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f1f5f9">` +
    `<tr><td align="center" style="padding:32px 16px">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">` +
    `<tr><td style="height:4px;background:#2563eb;font-size:0;line-height:0">&nbsp;</td></tr>` +
    `<tr><td style="padding:20px 28px;border-bottom:1px solid #e2e8f0">` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>` +
    `<td style="padding-right:10px"><img src="${iconUrl}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0"></td>` +
    `<td><img src="${wordmarkUrl}" height="24" alt="Itemize" style="display:block;height:24px;width:auto;max-width:120px;border:0"></td>` +
    `</tr></table></td></tr>` +
    `<tr><td style="padding:32px 28px 28px">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 14px"><tr>` +
    `<td style="color:#2563eb;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${escapeHtml(input.eyebrow)}</td>${reference}</tr></table>` +
    `<h1 style="margin:0 0 20px;color:#0f172a;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.02em">${escapeHtml(input.heading)}</h1>` +
    `<div style="color:#334155;font-size:15px;line-height:1.65">${input.bodyHtml}</div>${cta}` +
    `</td></tr>` +
    `<tr><td style="padding:20px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5">` +
    `${escapeHtml(input.footerText || 'Sent securely with Itemize.')}` +
    `</td></tr></table></td></tr></table></body></html>`;
};
