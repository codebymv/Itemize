import type { ReactNode } from 'react';
import { Moon, ShieldCheck, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { PUBLIC_SHELL_WIDTH } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type PublicContentType = 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';

const contentLabels: Record<PublicContentType, string> = {
  list: 'List',
  note: 'Note',
  whiteboard: 'Whiteboard',
  wireframe: 'Wireframe',
  vault: 'Vault',
};

export function BrandedPublicHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className={cn(PUBLIC_SHELL_WIDTH, 'flex h-16 items-center justify-between gap-4')}>
        <a href="https://itemize.cloud" className="group flex items-center gap-2.5" aria-label="Itemize home">
          <img
            src="/icon.png"
            alt=""
            aria-hidden="true"
            className="h-8 w-8 shrink-0 transition-transform group-hover:-translate-y-0.5"
          />
          <img src="/textblack.png" alt="Itemize" className="h-6 w-auto dark:hidden" />
          <img src="/textwhite.png" alt="" aria-hidden="true" className="hidden h-6 w-auto dark:block" />
        </a>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button asChild size="sm" className="h-9 px-3 sm:px-4">
            <a href="/register?mode=trial">Try Itemize</a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            aria-label={`Use ${dark ? 'light' : 'dark'} theme`}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}

export function BrandedPublicPage({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <BrandedPublicHeader />
      {children}
    </main>
  );
}

export function BrandedPublicContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-12', className)}>
      {children}
    </div>
  );
}

export function BrandedPublicCard({
  children,
  className,
  contentClassName,
  showBrandRule = true,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  showBrandRule?: boolean;
}) {
  return (
    <Card className={cn('overflow-hidden shadow-sm', className)}>
      {showBrandRule && <div className="h-1 bg-primary" aria-hidden="true" />}
      <CardContent className={cn('p-0', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function SharedItemCard({
  children,
  title,
  contentType,
  category,
  creatorName,
  createdAt,
  updatedAt,
  isLive,
  accentColor,
  className,
  contentClassName,
}: {
  children: ReactNode;
  title: string;
  contentType: PublicContentType;
  category?: string;
  creatorName?: string;
  createdAt?: string;
  updatedAt?: string;
  isLive?: boolean;
  accentColor?: string;
  className?: string;
  contentClassName?: string;
}) {
  const sharedDate = createdAt ? new Date(createdAt) : null;
  const updatedDate = updatedAt ? new Date(updatedAt) : null;
  const formattedSharedDate = sharedDate && !Number.isNaN(sharedDate.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(sharedDate)
    : null;
  const formattedUpdatedDate = updatedDate && !Number.isNaN(updatedDate.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(updatedDate)
    : null;

  return (
    <BrandedPublicCard className={className}>
      <section className="border-b border-border bg-muted/25 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {accentColor && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: accentColor }}
                  aria-hidden="true"
                />
              )}
              Shared {contentLabels[contentType]}
            </p>
            <h1 className="mt-2 break-words text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {category && (
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                {category}
              </span>
            )}
            {isLive && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Live
              </span>
            )}
          </div>
        </div>
        {(creatorName || formattedSharedDate || formattedUpdatedDate) && (
          <p className="mt-3 text-sm text-muted-foreground">
            {creatorName ? `Shared by ${creatorName}` : 'Shared with Itemize'}
            {formattedSharedDate ? ` on ${formattedSharedDate}` : ''}
            {!formattedSharedDate && formattedUpdatedDate ? ` · Updated ${formattedUpdatedDate}` : ''}
          </p>
        )}
      </section>
      <div className={cn('p-5 sm:p-7', contentClassName)}>{children}</div>
    </BrandedPublicCard>
  );
}

export function PublicProductCTA() {
  return (
    <BrandedPublicCard showBrandRule={false} className="bg-muted/20">
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold">Bring your work together</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and share notes, lists, whiteboards, wireframes, and secure vaults from one focused workspace.
          </p>
        </div>
        <Button asChild className="sm:shrink-0">
          <a href="/register?mode=trial">Try Itemize</a>
        </Button>
      </div>
    </BrandedPublicCard>
  );
}

export function PublicPrivateLinkNotice({
  contentLabel,
  sensitive = false,
}: {
  contentLabel: string;
  sensitive?: boolean;
}) {
  return (
    <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
      <ShieldCheck className="h-3.5 w-3.5" />
      {sensitive
        ? `This private link provides access to this ${contentLabel}. Treat it like the information it contains.`
        : `This private link provides access to this ${contentLabel}. Please do not forward it.`}
    </p>
  );
}
