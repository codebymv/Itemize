import { useHeader } from '@/contexts/HeaderContext';

/** Renders PageLayout title/actions for public routes that have no AppShell header. */
export function PublicPageHeader() {
  const { headerContent } = useHeader();
  if (!headerContent) return null;

  return (
    <header className="flex h-14 items-center border-b px-4 bg-background sticky top-0 z-40 w-full min-w-0">
      <div className="flex-1 flex items-center min-w-0 overflow-hidden py-px">
        {headerContent}
      </div>
    </header>
  );
}
