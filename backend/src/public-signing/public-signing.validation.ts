import { createHash } from 'node:crypto';

const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const MAX_FIELDS = 500;
const MAX_TEXT_BYTES = 10_000;
const MAX_IMAGE_BYTES = 512 * 1024;
// Leave room for base64 expansion and JSON framing beneath the 1 MiB
// body/proxy limit shared by both HTTP origins.
const MAX_IMAGE_TOTAL_BYTES = 700 * 1024;
const MAX_VALUE_TOTAL_BYTES = 900 * 1024;

export class PublicSigningValidationError extends Error {
  constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message);
    this.name = 'PublicSigningValidationError';
  }
}

export type PublicSigningFieldValue = { id: number; value: string };

export const publicSigningTokenHash = (token: string): string | null => {
  if (!TOKEN.test(token)) return null;
  return createHash('sha256').update(token).digest('hex');
};

export const normalizePublicSigningSubmission = (
  payload: unknown,
): PublicSigningFieldValue[] => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PublicSigningValidationError(
      'Signature payload is invalid',
      'INVALID_SIGNATURE_PAYLOAD',
    );
  }
  const record = payload as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => key !== 'fields')
    || !Array.isArray(record.fields)
  ) {
    throw new PublicSigningValidationError(
      'Signature payload must contain only a fields array',
      'INVALID_SIGNATURE_PAYLOAD',
    );
  }
  if (record.fields.length > MAX_FIELDS) {
    throw new PublicSigningValidationError(
      `At most ${MAX_FIELDS} signature fields are allowed`,
      'SIGNATURE_FIELD_LIMIT',
    );
  }
  const ids = new Set<number>();
  let totalBytes = 0;
  const fields = record.fields.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new PublicSigningValidationError(
        `Signature field ${index + 1} is invalid`,
        'INVALID_SIGNATURE_FIELD',
      );
    }
    const field = candidate as Record<string, unknown>;
    if (
      Object.keys(field).some((key) => !['id', 'value'].includes(key))
      || !Number.isSafeInteger(field.id)
      || Number(field.id) < 1
      || typeof field.value !== 'string'
    ) {
      throw new PublicSigningValidationError(
        `Signature field ${index + 1} is invalid`,
        'INVALID_SIGNATURE_FIELD',
      );
    }
    const id = Number(field.id);
    if (ids.has(id)) {
      throw new PublicSigningValidationError(
        'Signature field IDs must be unique',
        'DUPLICATE_SIGNATURE_FIELD',
      );
    }
    ids.add(id);
    totalBytes += Buffer.byteLength(field.value);
    if (totalBytes > MAX_VALUE_TOTAL_BYTES) {
      throw new PublicSigningValidationError(
        'Signature payload is too large',
        'SIGNATURE_PAYLOAD_TOO_LARGE',
      );
    }
    return { id, value: field.value };
  });
  return fields;
};

export const validatePublicSigningFieldValue = (
  fieldType: string,
  value: string | undefined,
  required: boolean,
  imageBudget: { bytes: number },
): string | undefined => {
  if (value === undefined) {
    if (required) {
      throw new PublicSigningValidationError(
        'Missing required fields',
        'REQUIRED_SIGNATURE_FIELD_MISSING',
      );
    }
    return undefined;
  }
  if (fieldType === 'signature' || fieldType === 'initials') {
    if (!value) {
      if (required) {
        throw new PublicSigningValidationError(
          'Missing required fields',
          'REQUIRED_SIGNATURE_FIELD_MISSING',
        );
      }
      return '';
    }
    const bytes = signatureImage(value);
    imageBudget.bytes += bytes.length;
    if (imageBudget.bytes > MAX_IMAGE_TOTAL_BYTES) {
      throw new PublicSigningValidationError(
        'Signature images are too large',
        'SIGNATURE_IMAGE_TOTAL_TOO_LARGE',
      );
    }
    return value;
  }
  if (fieldType === 'checkbox') {
    if (!['', 'true', 'false'].includes(value)) {
      throw new PublicSigningValidationError(
        'Checkbox values must be true or false',
        'INVALID_SIGNATURE_CHECKBOX',
      );
    }
    if (required && value !== 'true') {
      throw new PublicSigningValidationError(
        'Required checkbox fields must be checked',
        'REQUIRED_SIGNATURE_CHECKBOX',
      );
    }
    return value;
  }
  if (fieldType === 'date') {
    if (!value) {
      if (required) {
        throw new PublicSigningValidationError(
          'Missing required fields',
          'REQUIRED_SIGNATURE_FIELD_MISSING',
        );
      }
      return '';
    }
    if (!validDate(value)) {
      throw new PublicSigningValidationError(
        'Date fields must use YYYY-MM-DD',
        'INVALID_SIGNATURE_DATE',
      );
    }
    return value;
  }
  if (fieldType !== 'text') {
    throw new PublicSigningValidationError(
      'Signature field type is not supported',
      'INVALID_SIGNATURE_FIELD_TYPE',
    );
  }
  if (Buffer.byteLength(value) > MAX_TEXT_BYTES) {
    throw new PublicSigningValidationError(
      'Signature text is too long',
      'SIGNATURE_TEXT_TOO_LONG',
    );
  }
  if (required && !value.trim()) {
    throw new PublicSigningValidationError(
      'Missing required fields',
      'REQUIRED_SIGNATURE_FIELD_MISSING',
    );
  }
  return value;
};

const validDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime())
    && date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3]);
};

const signatureImage = (value: string): Buffer => {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) {
    throw new PublicSigningValidationError(
      'Signature image must be a PNG or JPEG data URL',
      'INVALID_SIGNATURE_IMAGE',
    );
  }
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new PublicSigningValidationError(
      'Signature image is too large',
      'SIGNATURE_IMAGE_TOO_LARGE',
    );
  }
  const canonical = bytes.toString('base64').replace(/=+$/, '');
  if (canonical !== match[2].replace(/=+$/, '')) {
    throw new PublicSigningValidationError(
      'Signature image encoding is invalid',
      'INVALID_SIGNATURE_IMAGE',
    );
  }
  if (match[1] === 'png') {
    if (validPng(bytes)) return bytes;
  } else if (validJpeg(bytes)) return bytes;
  throw new PublicSigningValidationError(
    'Signature image content is invalid',
    'INVALID_SIGNATURE_IMAGE',
  );
};

const validPng = (bytes: Buffer): boolean => {
  if (
    bytes.length < 45
    || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return false;
  }
  let offset = 8;
  let first = true;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    if (first) {
      if (type !== 'IHDR' || length !== 13) return false;
      const width = bytes.readUInt32BE(offset + 8);
      const height = bytes.readUInt32BE(offset + 12);
      if (width < 1 || height < 1 || width > 4096 || height > 4096) return false;
      first = false;
    }
    if (type === 'IEND') return length === 0 && end === bytes.length;
    offset = end;
  }
  return false;
};

const validJpeg = (bytes: Buffer): boolean => {
  if (
    bytes.length < 11
    || bytes[0] !== 0xff
    || bytes[1] !== 0xd8
    || bytes.at(-2) !== 0xff
    || bytes.at(-1) !== 0xd9
  ) {
    return false;
  }
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  let dimensions = false;
  while (offset + 4 <= bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xda) return dimensions;
    if (marker === 0xd9) return dimensions && offset === bytes.length;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return false;
    if (startOfFrame.has(marker)) {
      if (length < 7) return false;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (width < 1 || height < 1 || width > 4096 || height > 4096) return false;
      dimensions = true;
    }
    offset += length;
  }
  return false;
};
