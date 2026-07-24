import React, { useEffect, useMemo, useState } from 'react';
import { Monitor, QrCode, Share2, Smartphone, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Page } from '@/services/pagesApi';
import { getPageVersion, type PageVersion } from '@/services/pageVersionsApi';
import {
  buildLandingPageDocument,
  type LandingPageDocument,
} from '@/lib/landingPageDocument';

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
  const documentHtml = useMemo(
    () =>
      previewPage
        ? buildLandingPageDocument(previewPage, window.location.origin)
        : '',
    [previewPage],
  );

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
      <DialogContent className="max-w-7xl h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-lg font-semibold">
                {page.name}
              </DialogTitle>
              <Badge variant="outline" className="text-xs">
                {versionId ? 'Version Preview' : 'Live Preview'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <DeviceSelector device={device} onChange={setDevice} />
              {!versionId && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyLink}
                    title="Copy public link"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={generateQRCode}
                    title="Public page QR code"
                  >
                    <QrCode className="h-4 w-4" />
                  </Button>
                </>
              )}
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
              <iframe
                srcDoc={documentHtml}
                className="w-full h-full border-0"
                title={`${page.name} preview`}
                sandbox="allow-forms allow-popups allow-scripts"
                referrerPolicy="no-referrer"
              />
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
    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
      {options.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant={device === value ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onChange(value)}
          className="gap-2 h-8 px-3"
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}
    </div>
  );
}
