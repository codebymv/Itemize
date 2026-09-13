/** Without a receipt or a definite rejection, another send needs operator review. */
export class EmailAcceptanceUnknownError extends Error {
  readonly retryable = false;
  readonly providerOutcomeUnknown = true;
  constructor() { super('Email acceptance could not be verified; review provider history before resending'); }
}

export function verifyEmailProviderResponse(response: { ok: boolean; status: number }, id: unknown): void {
  if (response.status >= 500 || response.status === 409 || (response.ok &&
    (typeof id !== 'string' || id.trim().length === 0 || id.length > 255))) {
    throw new EmailAcceptanceUnknownError();
  }
}
