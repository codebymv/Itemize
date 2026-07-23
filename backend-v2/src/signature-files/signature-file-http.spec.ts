import {
  signatureFileEffectiveRange,
  signatureFileEtag,
  signatureFileNotModified,
  SignatureFileRangeError,
  sliceSignatureFile,
} from './signature-file-http';

describe('signature file HTTP delivery', () => {
  const body = Buffer.from('0123456789');
  const hash = 'a'.repeat(64);
  const etag = `"sha256-${hash}"`;

  it.each([
    ['bytes=2-5', '2345', { start: 2, end: 5 }],
    ['bytes=7-', '789', { start: 7, end: 9 }],
    ['bytes=-3', '789', { start: 7, end: 9 }],
    ['bytes=0-99', '0123456789', { start: 0, end: 9 }],
  ])('normalizes one bounded byte range: %s', (header, value, range) => {
    expect(sliceSignatureFile(body, header)).toEqual({
      buffer: Buffer.from(value),
      totalLength: 10,
      range,
    });
  });

  it.each(['bytes=10-', 'bytes=5-2', 'bytes=0-1,3-4', 'items=0-1', 'bytes=-0'])(
    'rejects malformed or unsatisfiable ranges: %s',
    (header) => {
      expect(() => sliceSignatureFile(body, header)).toThrow(
        SignatureFileRangeError,
      );
    },
  );

  it('uses strong evidence hashes for conditional requests', () => {
    expect(signatureFileEtag(hash)).toBe(etag);
    expect(signatureFileEtag('not-a-hash')).toBeNull();
    expect(signatureFileNotModified(etag, etag)).toBe(true);
    expect(signatureFileNotModified(`W/${etag}`, etag)).toBe(true);
    expect(signatureFileNotModified('"other", *', etag)).toBe(true);
  });

  it('honors If-Range only for an exact strong validator', () => {
    expect(signatureFileEffectiveRange({ range: 'bytes=0-2' }, etag))
      .toBe('bytes=0-2');
    expect(signatureFileEffectiveRange({
      range: 'bytes=0-2',
      ifRange: etag,
    }, etag)).toBe('bytes=0-2');
    expect(signatureFileEffectiveRange({
      range: 'bytes=0-2',
      ifRange: '"stale"',
    }, etag)).toBeUndefined();
  });
});
