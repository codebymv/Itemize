import { Response } from 'express';

export type SignatureFileRange = {
  start: number;
  end: number;
};

export type SignatureFileRead = {
  buffer: Buffer;
  totalLength: number;
  range: SignatureFileRange | null;
};

export type SignatureFileDeliveryRequest = {
  range?: string;
  ifRange?: string;
  ifNoneMatch?: string;
};

export type DeliveredSignatureFile = SignatureFileRead & {
  filename: string;
  etag: string | null;
  notModified: boolean;
};

export class SignatureFileRangeError extends Error {
  constructor(readonly totalLength: number) {
    super('Requested signature file range is not satisfiable');
  }
}

export function signatureFileRange(
  header: string | undefined,
  totalLength: number,
): SignatureFileRange | null {
  if (!header) return null;
  if (!Number.isSafeInteger(totalLength) || totalLength < 0) {
    throw new SignatureFileRangeError(0);
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || totalLength === 0) {
    throw new SignatureFileRangeError(totalLength);
  }
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new SignatureFileRangeError(totalLength);
    }
    return {
      start: Math.max(totalLength - suffixLength, 0),
      end: totalLength - 1,
    };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : totalLength - 1;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start < 0
    || requestedEnd < start
    || start >= totalLength
  ) {
    throw new SignatureFileRangeError(totalLength);
  }
  return { start, end: Math.min(requestedEnd, totalLength - 1) };
}

export function sliceSignatureFile(
  buffer: Buffer,
  rangeHeader?: string,
): SignatureFileRead {
  const range = signatureFileRange(rangeHeader, buffer.length);
  return {
    buffer: range ? buffer.subarray(range.start, range.end + 1) : buffer,
    totalLength: buffer.length,
    range,
  };
}

export function signatureFileEtag(hash: string | null | undefined): string | null {
  return hash && /^[a-f0-9]{64}$/i.test(hash)
    ? `"sha256-${hash.toLowerCase()}"`
    : null;
}

export function signatureFileNotModified(
  header: string | undefined,
  etag: string | null,
): boolean {
  if (!header || !etag) return false;
  return header.split(',').some((candidate) => {
    const normalized = candidate.trim();
    return normalized === '*'
      || normalized === etag
      || normalized.replace(/^W\//, '') === etag;
  });
}

export function signatureFileEffectiveRange(
  request: SignatureFileDeliveryRequest,
  etag: string | null,
): string | undefined {
  if (!request.range) return undefined;
  if (!request.ifRange) return request.range;
  return etag && request.ifRange.trim() === etag ? request.range : undefined;
}

export function sendSignatureFile(
  response: Response,
  file: DeliveredSignatureFile,
  disposition: 'inline' | 'attachment',
  publicCapability = false,
): void {
  response.set({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': 'sandbox',
    'X-Content-Type-Options': 'nosniff',
    ...(file.etag ? { ETag: file.etag } : {}),
    ...(publicCapability
      ? {
          'Referrer-Policy': 'no-referrer',
          'X-Robots-Tag': 'noindex, nofollow',
        }
      : {}),
  });
  if (file.notModified) {
    response.status(304).end();
    return;
  }
  response.set({
    'Content-Disposition': `${disposition}; filename="${file.filename}"`,
    'Content-Length': String(file.buffer.length),
    'Content-Type': 'application/pdf',
    ...(file.range
      ? {
          'Content-Range':
            `bytes ${file.range.start}-${file.range.end}/${file.totalLength}`,
        }
      : {}),
  });
  response.status(file.range ? 206 : 200).send(file.buffer);
}

export function sendSignatureRangeError(
  response: Response,
  error: SignatureFileRangeError,
  publicCapability = false,
): void {
  response.status(416).set({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Content-Range': `bytes */${error.totalLength}`,
    'Content-Security-Policy': 'sandbox',
    'X-Content-Type-Options': 'nosniff',
    ...(publicCapability
      ? {
          'Referrer-Policy': 'no-referrer',
          'X-Robots-Tag': 'noindex, nofollow',
        }
      : {}),
  }).end();
}
