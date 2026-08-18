import React from 'react';
import { usePageHeader } from '@/hooks/usePageHeader';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';

export type PageFrame = 'surface' | 'flush' | 'split';

export interface PageLayoutProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  leading?: React.ReactNode;
  headerActions?: React.ReactNode;
  mobileActions?: React.ReactNode | false;
  mobileClassName?: string;
  frame?: PageFrame;
  nav?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  surfaceClassName?: string;
  contentClassName?: string;
}

export function PageLayout({
  title,
  icon,
  leading,
  headerActions,
  mobileActions,
  mobileClassName,
  frame = 'surface',
  nav,
  children,
  className,
  surfaceClassName,
  contentClassName,
}: PageLayoutProps) {
  usePageHeader({
    title,
    icon,
    leading,
    rightContent: headerActions,
  });

  const mobileBar =
    mobileActions && mobileActions !== false ? (
      <MobileControlsBar className={mobileClassName}>{mobileActions}</MobileControlsBar>
    ) : null;

  if (frame === 'flush') {
    return (
      <>
        {mobileBar}
        {children}
      </>
    );
  }

  const surface = (
    <PageSurface
      className={surfaceClassName ?? (frame === 'split' ? 'h-full' : undefined)}
      contentClassName={
        contentClassName ?? (frame === 'split' ? 'p-0 sm:p-0 h-full' : undefined)
      }
    >
      {children}
    </PageSurface>
  );

  return (
    <>
      {mobileBar}
      <PageContainer className={className}>
        {nav ? (
          <div className="flex flex-col md:flex-row gap-6 md:gap-8">
            {nav}
            <div className="min-w-0 flex-1">{surface}</div>
          </div>
        ) : (
          surface
        )}
      </PageContainer>
    </>
  );
}

export default PageLayout;
