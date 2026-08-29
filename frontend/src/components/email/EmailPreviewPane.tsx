import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { previewEmailTemplate, type EmailTemplatePreview } from '@/services/emailApi';
import type { EmailContentValue } from './EmailContentEditor';
import { EmailPreviewFrame } from './EmailPreviewFrame';

interface EmailPreviewPaneProps {
  organizationId: number;
  content: EmailContentValue;
  className?: string;
}

export function EmailPreviewPane({ organizationId, content, className }: EmailPreviewPaneProps) {
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
        if (requestId === requestRef.current) {
          setError('Preview is temporarily unavailable. Your draft has not been changed.');
        }
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [content, organizationId]);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <EmailPreviewFrame html={preview?.html || null} loading={loading} error={error} className="min-h-0 flex-1" />
    </div>
  );
}
