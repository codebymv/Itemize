import { useEffect, useRef, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { previewEmailTemplate, type EmailTemplatePreview } from '@/services/emailApi';
import type { EmailContentValue } from './EmailContentEditor';

interface EmailPreviewPaneProps {
  organizationId: number;
  content: EmailContentValue;
}

export function EmailPreviewPane({ organizationId, content }: EmailPreviewPaneProps) {
  const [preview, setPreview] = useState<EmailTemplatePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const next = await previewEmailTemplate({
          subject: content.subject || 'Untitled email',
          preheader: content.preheader || null,
          body_html: content.bodyHtml || '<p>Start writing to preview your email.</p>',
          body_text: content.bodyText || null,
        }, organizationId);
        if (requestId === requestRef.current) {
          setPreview(next);
          setError(null);
        }
      } catch {
        if (requestId === requestRef.current) setError('Preview is temporarily unavailable. Your draft has not been changed.');
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [content, organizationId]);

  return (
    <div className="space-y-3">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="truncate text-sm font-medium">{preview?.subject || content.subject || 'Untitled email'}</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Updating preview" />}
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="overflow-hidden rounded-lg border bg-white">
        {preview ? (
          <iframe
            title="Rendered email preview"
            sandbox=""
            srcDoc={preview.html}
            className="h-[620px] w-full bg-white"
          />
        ) : (
          <div className="flex h-[620px] items-center justify-center text-sm text-muted-foreground">Preparing preview…</div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Preview uses safe sample recipient data and Itemize’s delivery-safe email shell.</p>
    </div>
  );
}
