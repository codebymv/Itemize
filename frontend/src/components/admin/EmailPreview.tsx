'use client';

import { useEffect, useRef, useState } from 'react';
import { EmailPreviewFrame } from '@/components/email/EmailPreviewFrame';
import { getPreview } from '@/services/adminEmailApi';

interface EmailPreviewProps {
  subject: string;
  bodyHtml: string;
  className?: string;
}

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export function EmailPreview({ subject, bodyHtml, className }: EmailPreviewProps) {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    if (!bodyHtml.trim()) {
      setPreviewHtml(null);
      setError(null);
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await getPreview({ subject, bodyHtml });
        if (requestId === requestRef.current) {
          setPreviewHtml(response.html || null);
          setError(null);
        }
      } catch (previewError) {
        if (requestId === requestRef.current) {
          setError(getErrorMessage(previewError, 'Preview is temporarily unavailable.'));
        }
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [subject, bodyHtml]);

  return <EmailPreviewFrame html={previewHtml} loading={loading} error={error} className={className} />;
}
