import { createHash } from 'node:crypto';

export const SIGNATURE_CONSENT_VERSION = 'itemize-esign-v1';

export const SIGNATURE_CONSENT_TEXT =
  'I agree to use electronic records and signatures for this document, and I intend my electronic signature to be legally binding.';

export const SIGNATURE_CONSENT_SHA256 = createHash('sha256')
  .update(SIGNATURE_CONSENT_TEXT, 'utf8')
  .digest('hex');
