import { useHeader } from '@/contexts/HeaderContext';
import { PUBLIC_SHELL_WIDTH } from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';

/** Renders PageLayout title/actions for public routes that have no AppShell header. */
export function PublicPageHeader() {
  const { headerContent } = useHeader();
  if (!headerContent) return null;

  return (
    <header className="sticky top-0 z-40 w-full min-w-0 border-b bg-background">
      <div
        className={cn(
          PUBLIC_SHELL_WIDTH,
          'flex h-14 items-center min-w-0 [&_.ml-2]:ml-0 [&_.mr-4]:mr-0',
        )}
      >
        <div className="flex-1 flex items-center min-w-0 overflow-hidden py-px">
          {headerContent}
        </div>
      </div>
    </header>
  );
}
