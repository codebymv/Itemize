import { useMemo } from 'react';
import { Layout } from 'lucide-react';

import {
  buildLandingPageDocument,
  type LandingPageDocument,
} from '@/lib/landingPageDocument';
import { cn } from '@/lib/utils';
import { PreviewPlaceholder } from '@/components/preview/PreviewPlaceholder';

interface LandingPagePreviewFrameProps {
  page: LandingPageDocument;
  title: string;
  className?: string;
}

export function LandingPagePreviewFrame({
  page,
  title,
  className,
}: LandingPagePreviewFrameProps) {
  const hasPreviewContent = (page.sections || []).some(
    section => section.settings?.visible !== false,
  );
  const documentHtml = useMemo(
    () => buildLandingPageDocument(page, window.location.origin),
    [page],
  );

  if (!hasPreviewContent) {
    return (
      <PreviewPlaceholder
        icon={Layout}
        title="No page content yet"
        description="Add a section to build this page."
        className={cn('h-full min-h-80 rounded-none border-0 bg-background', className)}
      />
    );
  }

  return (
    <iframe
      srcDoc={documentHtml}
      className={cn('h-full w-full border-0 bg-white', className)}
      title={title}
      sandbox="allow-forms allow-popups allow-scripts"
      referrerPolicy="no-referrer"
    />
  );
}
