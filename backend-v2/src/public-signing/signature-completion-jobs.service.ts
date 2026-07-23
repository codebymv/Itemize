import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import {
  SIGNATURE_FILE_STORAGE,
  SignatureFileStorage,
} from '../signature-files/signature-file-storage.provider';
import {
  boundedInteger,
} from '../workflow-jobs/workflow-job.util';
import {
  SignatureCompletionClaim,
  SignatureCompletionJobsRepository,
  SignatureCompletionSnapshot,
} from './signature-completion-jobs.repository';

export type SignatureCompletionRun = {
  claimed: number;
  completed: number;
  retry: number;
  deadLetter: number;
  stale: number;
};

class SignatureCompletionError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
    this.name = 'SignatureCompletionError';
  }
}

@Injectable()
export class SignatureCompletionJobsService {
  constructor(
    private readonly repository: SignatureCompletionJobsRepository,
    @Inject(SIGNATURE_FILE_STORAGE) private readonly storage: SignatureFileStorage,
  ) {}

  async run(options: {
    batchSize?: number;
    leaseSeconds?: number;
    maxAttempts?: number;
    baseDelayMs?: number;
    maximumDelayMs?: number;
    jobId?: number | null;
  } = {}): Promise<SignatureCompletionRun> {
    const batchSize = boundedInteger(options.batchSize, 10, 1, 50);
    const leaseSeconds = boundedInteger(options.leaseSeconds, 300, 1, 3600);
    const maxAttempts = boundedInteger(options.maxAttempts, 5, 1, 20);
    const baseDelayMs = boundedInteger(options.baseDelayMs, 60_000, 1, 86_400_000);
    const maximumDelayMs = Math.max(
      baseDelayMs,
      boundedInteger(options.maximumDelayMs, 86_400_000, 1, 86_400_000),
    );
    const summary: SignatureCompletionRun = {
      claimed: 0,
      completed: 0,
      retry: 0,
      deadLetter: 0,
      stale: 0,
    };
    for (let index = 0; index < batchSize; index += 1) {
      const claim = await this.repository.claim(leaseSeconds, options.jobId ?? null);
      if (!claim) break;
      summary.claimed += 1;
      try {
        const snapshot = await this.repository.snapshot(claim);
        if (!snapshot) {
          const outcome = await this.repository.fail(
            claim,
            new SignatureCompletionError('Signature completion snapshot is unavailable'),
            {
              maxAttempts,
              baseDelayMs,
              maximumDelayMs,
              retryable: false,
            },
          );
          if (outcome === 'dead_letter') summary.deadLetter += 1;
          else summary.stale += 1;
          continue;
        }
        const artifact = await this.generate(claim, snapshot);
        if (await this.repository.complete(claim, artifact)) {
          summary.completed += 1;
        } else {
          await this.storage.remove(artifact.fileUrl);
          summary.stale += 1;
        }
      } catch (error) {
        const typed = error as Error & { retryable?: boolean };
        const outcome = await this.repository.fail(claim, error, {
          maxAttempts,
          baseDelayMs,
          maximumDelayMs,
          retryable: typed.retryable,
        });
        if (outcome === 'retry') summary.retry += 1;
        else if (outcome === 'dead_letter') summary.deadLetter += 1;
        else summary.stale += 1;
      }
      if (options.jobId) break;
    }
    return summary;
  }

  private async generate(
    claim: SignatureCompletionClaim,
    snapshot: SignatureCompletionSnapshot,
  ): Promise<{ fileUrl: string; sha256: string }> {
    const source = await this.storage.read(snapshot.document.file_url);
    if (!source || source.length < 5 || source.length > 20 * 1024 * 1024) {
      throw new SignatureCompletionError('Original signature PDF is unavailable or invalid');
    }
    if (source.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new SignatureCompletionError('Original signature file is not a PDF');
    }
    let pdf: PDFDocument;
    try {
      pdf = await PDFDocument.load(source, {
        ignoreEncryption: false,
        updateMetadata: false,
      });
    } catch {
      throw new SignatureCompletionError('Original signature PDF could not be parsed');
    }
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const field of snapshot.fields) {
      let page: PDFPage;
      try {
        page = pdf.getPage(field.page_number - 1);
      } catch {
        throw new SignatureCompletionError('Signature field references a missing PDF page');
      }
      await this.drawField(pdf, page, font, field);
    }
    await this.certificate(pdf, font, snapshot);
    const bytes = Buffer.from(await pdf.save());
    if (bytes.length > 25 * 1024 * 1024) {
      throw new SignatureCompletionError('Completed signature PDF is too large');
    }
    const fileUrl = await this.storage.store({
      buffer: bytes,
      organizationId: claim.organization_id,
      resourceId: claim.document_id,
      scope: 'document',
    });
    return {
      fileUrl,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }

  private async drawField(
    pdf: PDFDocument,
    page: PDFPage,
    font: PDFFont,
    field: SignatureCompletionSnapshot['fields'][number],
  ): Promise<void> {
    const value = field.value || '';
    if (!value) return;
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const width = (Number(field.width) / 100) * pageWidth;
    const height = (Number(field.height) / 100) * pageHeight;
    const x = (Number(field.x_position) / 100) * pageWidth;
    const y = pageHeight - (Number(field.y_position) / 100) * pageHeight - height;
    if (field.field_type === 'signature' || field.field_type === 'initials') {
      const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
      if (!match) {
        throw new SignatureCompletionError('Stored signature image is invalid');
      }
      const imageBytes = Buffer.from(match[2], 'base64');
      const image = match[1] === 'png'
        ? await pdf.embedPng(imageBytes)
        : await pdf.embedJpg(imageBytes);
      page.drawImage(image, { x, y, width, height });
      return;
    }
    if (field.field_type === 'checkbox') {
      if (value === 'true') {
        page.drawText('X', {
          x: x + 2,
          y: y + 2,
          size: Math.max(6, Math.min(height - 2, 18)),
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
      }
      return;
    }
    page.drawText(this.encodable(font, value), {
      x: x + 2,
      y: y + 2,
      size: field.font_size || Math.max(6, Math.min(height - 2, 12)),
      font,
      color: rgb(0.1, 0.1, 0.1),
      maxWidth: Math.max(1, width - 4),
      lineHeight: Math.max(7, (field.font_size || 12) * 1.2),
    });
  }

  private async certificate(
    pdf: PDFDocument,
    font: PDFFont,
    snapshot: SignatureCompletionSnapshot,
  ): Promise<void> {
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage();
    let y = page.getHeight() - 50;
    const line = (
      value: string,
      options: { bold?: boolean; size?: number; indent?: number } = {},
    ) => {
      if (y < 45) {
        page = pdf.addPage();
        y = page.getHeight() - 45;
      }
      page.drawText(this.encodable(options.bold ? bold : font, value).slice(0, 140), {
        x: 40 + (options.indent || 0),
        y,
        size: options.size || 9,
        font: options.bold ? bold : font,
      });
      y -= (options.size || 9) + 6;
    };
    line('Certificate of Completion', { bold: true, size: 18 });
    y -= 8;
    line(`Document: ${snapshot.document.title}`, { size: 11 });
    if (snapshot.document.document_number) {
      line(`Document ID: ${snapshot.document.document_number}`, { size: 10 });
    }
    if (snapshot.document.original_sha256) {
      line(`Original SHA-256: ${snapshot.document.original_sha256}`, { size: 8 });
    }
    y -= 8;
    line('Recipients', { bold: true, size: 11 });
    for (const recipient of snapshot.recipients) {
      line(`${recipient.name || recipient.email} (${recipient.email})`, { indent: 8 });
      line(
        `Signed at: ${recipient.signed_at?.toISOString() || 'Unavailable'}`,
        { indent: 16, size: 8 },
      );
    }
    y -= 8;
    line('Audit Log', { bold: true, size: 11 });
    for (const event of snapshot.audit) {
      line(
        `${event.created_at.toISOString()} - ${event.event_type}`
          + `${event.description ? ` - ${event.description}` : ''}`,
        { indent: 8, size: 8 },
      );
    }
  }

  private encodable(font: PDFFont, value: string): string {
    const supported = new Set(font.getCharacterSet());
    return Array.from(value)
      .map((character) => supported.has(character.codePointAt(0) || 0) ? character : '?')
      .join('');
  }
}
