import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Monitor, Smartphone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { sandboxedEmailPreviewDocument } from '@/lib/emailPreviewWindow';
import { cn } from '@/lib/utils';

type PreviewDevice = 'desktop' | 'mobile';

interface EmailPreviewFrameProps {
  html: string | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

const DEVICE_WIDTHS: Record<PreviewDevice, number> = { desktop: 720, mobile: 375 };

export function EmailPreviewFrame({ html, loading = false, error, className }: EmailPreviewFrameProps) {
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(1);
  const [measured, setMeasured] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentObserverRef = useRef<ResizeObserver | null>(null);
  const deviceWidth = DEVICE_WIDTHS[device];

  const measureContent = useCallback(() => {
    const frame = iframeRef.current;
    const document = frame?.contentDocument;
    const view = frame?.contentWindow;
    if (!document?.documentElement || !document.body || !view) return;

    // The parent preview viewport owns scrolling. Prevent the embedded email
    // document from creating a second, nested scrollbar.
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    const bodyRect = document.body.getBoundingClientRect();
    const bodyStyles = view.getComputedStyle(document.body);
    const bodyMarginBottom = Number.parseFloat(bodyStyles.marginBottom) || 0;
    const bodyPaddingBottom = Number.parseFloat(bodyStyles.paddingBottom) || 0;
    const childBottom = Array.from(document.body.children).reduce((bottom, child) => {
      const rect = child.getBoundingClientRect();
      const marginBottom = Number.parseFloat(view.getComputedStyle(child).marginBottom) || 0;
      return Math.max(bottom, rect.bottom + marginBottom);
    }, bodyRect.top + bodyPaddingBottom);
    const range = document.createRange();
    range.selectNodeContents(document.body);
    const rangeBottom = range.getBoundingClientRect().bottom;
    const intrinsicHeight = Math.ceil(Math.max(childBottom, rangeBottom) + bodyMarginBottom);
    const overflowingHeight = document.body.scrollHeight > frame.clientHeight
      ? document.body.scrollHeight
      : 0;
    const nextHeight = Math.max(
      intrinsicHeight,
      overflowingHeight,
      1,
    );
    setContentHeight(Math.ceil(nextHeight));
    setMeasured(true);
  }, []);

  const handleFrameLoad = useCallback(() => {
    contentObserverRef.current?.disconnect();
    window.requestAnimationFrame(() => {
      measureContent();
      const document = iframeRef.current?.contentDocument;
      if (!document?.body || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measureContent);
      observer.observe(document.body);
      observer.observe(document.documentElement);
      contentObserverRef.current = observer;
    });
  }, [measureContent]);

  useEffect(() => {
    setContentHeight(1);
    setMeasured(false);
    return () => contentObserverRef.current?.disconnect();
  }, [device, html]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    const updateScale = () => {
      const available = Math.max(0, viewport.clientWidth - 32);
      setScale(Number(Math.min(1, available / deviceWidth).toFixed(3)) || 1);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [deviceWidth]);

  const openPreview = () => {
    if (!html) return;
    const nextWindow = window.open('', '_blank');
    if (!nextWindow) return;
    nextWindow.opener = null;
    nextWindow.document.write(sandboxedEmailPreviewDocument(html));
    nextWindow.document.close();
  };

  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      <div className="flex min-h-10 items-center justify-end gap-1">
        {loading && <Loader2 className="mr-auto h-4 w-4 animate-spin text-muted-foreground" aria-label="Updating preview" />}
        <div className="flex items-center rounded-lg bg-muted/60 p-1" aria-label="Preview device">
          <Button type="button" variant="toggle" size="compact" className="px-2.5" onClick={() => setDevice('desktop')} aria-label="Desktop preview" aria-pressed={device === 'desktop'}>
            <Monitor className="h-4 w-4" /><span className="hidden sm:inline">Desktop</span>
          </Button>
          <Button type="button" variant="toggle" size="compact" className="px-2.5" onClick={() => setDevice('mobile')} aria-label="Mobile preview" aria-pressed={device === 'mobile'}>
            <Smartphone className="h-4 w-4" /><span className="hidden sm:inline">Mobile</span>
          </Button>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" disabled={!html} onClick={openPreview} aria-label="Open preview in a new window" title="Open preview in a new window">
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-lg border bg-muted/40 p-4">
        {html ? (
          <div
            className="relative mx-auto overflow-hidden"
            style={{
              width: deviceWidth * scale,
              height: (measured ? contentHeight : 680) * scale,
            }}
          >
            <iframe
              key={device}
              ref={iframeRef}
              title={`${device === 'mobile' ? 'Mobile' : 'Desktop'} rendered email preview`}
              sandbox="allow-same-origin"
              referrerPolicy="no-referrer"
              srcDoc={html}
              scrolling="no"
              onLoad={handleFrameLoad}
              className="absolute left-0 top-0 origin-top-left rounded-md border-0 bg-white shadow-sm"
              style={{ width: deviceWidth, height: contentHeight, transform: `scale(${scale})`, opacity: measured ? 1 : 0 }}
            />
          </div>
        ) : (
          <div className="grid h-[min(680px,60vh)] place-items-center text-sm text-muted-foreground">{loading ? 'Preparing preview…' : 'Enter message content to see a preview'}</div>
        )}
      </div>
    </div>
  );
}
