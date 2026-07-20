const escapeAttribute = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[char] as string);

export const sandboxedEmailPreviewDocument = (previewHtml: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Preview</title>
  <style>html, body, iframe { width: 100%; height: 100%; margin: 0; border: 0; }</style>
</head>
<body>
  <iframe sandbox="allow-same-origin" title="Email Preview" srcdoc="${escapeAttribute(previewHtml)}"></iframe>
</body>
</html>`;
