import { useMemo } from 'react';
import { Layout } from 'lucide-react';

import {
  buildLandingPageDocument,
  type LandingPageDocument,
} from '@/lib/landingPageDocument';
import { cn } from '@/lib/utils';

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
      <div className={cn('grid h-full min-h-80 place-items-center bg-background px-6 text-center', className)}>
        <div className="max-w-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
            <Layout className="h-6 w-6 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-base font-medium">No page content yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Add a section in the editor to build this page.</p>
        </div>
      </div>
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
