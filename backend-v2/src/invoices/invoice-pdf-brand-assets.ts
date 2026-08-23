import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ASSET_TIMEOUT_MS = 5_000;

export type InvoicePdfImageAsset = {
  bytes: Uint8Array;
  format: 'png' | 'jpg';
};

export type InvoicePdfFontAssets = {
  regular: Uint8Array;
  semibold: Uint8Array;
  bold: Uint8Array;
};

@Injectable()
export class InvoicePdfBrandAssets {
  private fontsPromise: Promise<InvoicePdfFontAssets> | null = null;
  private itemizePromise: Promise<{
    icon: InvoicePdfImageAsset | null;
    wordmark: InvoicePdfImageAsset | null;
  }> | null = null;

  fonts(): Promise<InvoicePdfFontAssets> {
    this.fontsPromise ??= Promise.all([
      readFile(require.resolve('@fontsource/raleway/files/raleway-latin-400-normal.woff')),
      readFile(require.resolve('@fontsource/raleway/files/raleway-latin-600-normal.woff')),
      readFile(require.resolve('@fontsource/raleway/files/raleway-latin-700-normal.woff')),
    ]).then(([regular, semibold, bold]) => ({ regular, semibold, bold }));
    return this.fontsPromise;
  }

  itemize(): Promise<{
    icon: InvoicePdfImageAsset | null;
    wordmark: InvoicePdfImageAsset | null;
  }> {
    this.itemizePromise ??= Promise.all([
      this.fetchFixedAsset('/icon.png'),
      this.fetchFixedAsset('/textblack.png'),
    ]).then(([icon, wordmark]) => ({ icon, wordmark }));
    return this.itemizePromise;
  }

  async businessLogo(value: unknown): Promise<InvoicePdfImageAsset | null> {
    if (typeof value !== 'string' || !value.trim()) return null;
    const raw = value.trim();
    if (/^\/uploads\/logos\/[A-Za-z0-9._-]+$/.test(raw)) {
      if (process.env.NODE_ENV === 'production') return null;
      const origin = process.env.API_URL?.trim() || 'http://localhost:3001';
      return this.fetchImage(new URL(raw, origin));
    }

    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    const bucket = process.env.AWS_S3_BUCKET?.trim() || 'itemize-uploads';
    const region = process.env.AWS_REGION?.trim() || 'us-west-2';
    const expectedHost = `${bucket}.s3.${region}.amazonaws.com`;
    if (
      url.protocol !== 'https:' || url.hostname !== expectedHost ||
      url.username || url.password || url.search || url.hash ||
      !/^\/logos\/[A-Za-z0-9._/-]+$/.test(url.pathname) ||
      url.pathname.split('/').some((part) => part === '..')
    ) {
      return null;
    }
    return this.fetchImage(url);
  }

  private async fetchFixedAsset(path: string): Promise<InvoicePdfImageAsset | null> {
    const configured = process.env.EMAIL_ASSET_ORIGIN?.trim()
      || process.env.FRONTEND_URL?.trim()
      || 'https://itemize.cloud';
    let origin: URL;
    try {
      origin = new URL(configured);
    } catch {
      return null;
    }
    if (!['https:', 'http:'].includes(origin.protocol)) return null;
    return this.fetchImage(new URL(path, origin));
  }

  private async fetchImage(url: URL): Promise<InvoicePdfImageAsset | null> {
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
        headers: { Accept: 'image/png,image/jpeg' },
      });
      if (!response.ok) return null;
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > MAX_IMAGE_BYTES) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
      const format = this.imageFormat(bytes);
      return format ? { bytes, format } : null;
    } catch {
      return null;
    }
  }

  private imageFormat(bytes: Buffer): 'png' | 'jpg' | null {
    if (
      bytes.length >= 24 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      return 'png';
    }
    if (
      bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
      bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
    ) {
      return 'jpg';
    }
    return null;
  }
}
