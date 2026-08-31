import React, { useEffect, useState } from 'react';
import { Monitor, QrCode, Share2, Smartphone, Tablet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Page } from '@/services/pagesApi';
import { getPageVersion, type PageVersion } from '@/services/pageVersionsApi';
import type { LandingPageDocument } from '@/lib/landingPageDocument';
import { LandingPagePreviewFrame } from '@/components/LandingPagePreviewFrame';

type Device = 'desktop' | 'tablet' | 'mobile';

interface PagePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: Page;
  organizationId: number;
  versionId?: number;
}

const versionDocument = (
  page: Page,
  version: PageVersion,
): LandingPageDocument => ({
  name: version.content.name || page.name,
  slug: version.content.slug || page.slug,
  seo_title: version.content.seo_title,
  seo_description: version.content.seo_description,
  seo_keywords: version.content.seo_keywords,
  og_image: version.content.og_image,
  favicon_url: version.content.favicon_url,
  theme: { ...page.theme, ...(version.content.theme || {}) },
  custom_css: version.content.custom_css,
  custom_js: version.content.custom_js,
  custom_head: version.content.custom_head,
  organization_name: page.created_by_name || '',
  sections: version.content.sections || [],
});

export function PagePreviewDialog({
  open,
  onOpenChange,
  page,
  organizationId,
  versionId,
}: PagePreviewDialogProps) {
  const [device, setDevice] = useState<Device>('desktop');
  const [version, setVersion] = useState<PageVersion | null>(null);
  const [error, setError] = useState('');
  const loading = Boolean(versionId && !version && !error);

  useEffect(() => {
    let active = true;
    setVersion(null);
    setError('');
    if (!open || !versionId) return () => {
      active = false;
    };

    void getPageVersion(page.id, versionId, organizationId)
      .then((result) => {
        if (active) setVersion(result);
      })
      .catch(() => {
        if (active) setError('This version preview could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [open, organizationId, page.id, versionId]);

  const previewPage: LandingPageDocument | null = versionId
    ? version
      ? versionDocument(page, version)
      : null
    : page;
  const deviceWidths: Record<Device, string> = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px',
  };
  const publicUrl = `${window.location.origin}/p/${page.slug}`;

  const copyLink = () => {
    void navigator.clipboard.writeText(publicUrl);
  };

  const generateQRCode = () => {
    window.open(
      `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
        publicUrl,
      )}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="flex h-[90vh] max-w-7xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <DialogTitle className="truncate text-lg font-semibold">
                {page.name}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Preview this page at desktop, tablet, and mobile widths.
              </DialogDescription>
              <Badge variant="outline" className="shrink-0 text-xs">
                {versionId ? 'Version preview' : page.status === 'published' ? 'Live preview' : 'Draft preview'}
              </Badge>
            </div>
            <div className="flex min-w-0 w-full items-center gap-2 sm:ml-auto sm:w-auto sm:shrink-0">
              <DeviceSelector device={device} onChange={setDevice} />
              {!versionId && page.status === 'published' && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyLink}
                    title="Copy public link"
                    aria-label="Copy public link"
                    className="h-10 w-10 shrink-0"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={generateQRCode}
                    title="Public page QR code"
                    aria-label="Open public page QR code"
                    className="h-10 w-10 shrink-0"
                  >
                    <QrCode className="h-4 w-4" />
                  </Button>
                </>
              )}
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  aria-label="Close page preview"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 bg-gray-100 dark:bg-gray-950 p-4 overflow-auto">
          <div
            className="mx-auto bg-white shadow-2xl rounded-lg overflow-hidden border transition-[width] duration-200"
            style={{ width: deviceWidths[device], maxWidth: '100%', height: '100%' }}
          >
            {loading ? (
              <div className="grid h-full place-items-center text-muted-foreground">
                Loading version…
              </div>
            ) : error ? (
              <div className="grid h-full place-items-center text-destructive">
                {error}
              </div>
            ) : (
              previewPage && <LandingPagePreviewFrame page={previewPage} title={`${page.name} preview`} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeviceSelector({
  device,
  onChange,
}: {
  device: Device;
  onChange: (device: Device) => void;
}) {
  const options = [
    { value: 'desktop' as const, label: 'Desktop', icon: Monitor },
    { value: 'tablet' as const, label: 'Tablet', icon: Tablet },
    { value: 'mobile' as const, label: 'Mobile', icon: Smartphone },
  ];

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg bg-muted/50 p-1 sm:flex-none">
      {options.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant={device === value ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onChange(value)}
          className="h-8 min-w-0 flex-1 gap-2 px-2 sm:flex-none sm:px-3"
          aria-label={`${label} preview`}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}
    </div>
  );
}
