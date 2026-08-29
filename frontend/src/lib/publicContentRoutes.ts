export const publicFormPath = (identifier: string | number): string =>
  `/f/${encodeURIComponent(String(identifier))}`;

export const legacyPublicFormPath = (identifier: string | number): string =>
  `/form/${encodeURIComponent(String(identifier))}`;
