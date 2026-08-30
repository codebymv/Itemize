import React from 'react';
import { usePageHeader } from '@/hooks/usePageHeader';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { PageActionsBar } from '@/components/layout/PageActionsBar';
import { cn } from '@/lib/utils';
import type {
  DesktopHeaderToolsProps,
  ResponsiveHeaderToolsProps,
} from '@/components/layout/DesktopHeaderTools';

export type PageFrame = 'surface' | 'flush' | 'split';
export type NavigationBreakpoint = 'md' | 'wide';

export interface PageLayoutProps {
  title: string;
  icon?: React.ReactNode;
  leading?: React.ReactNode;
  /** Section selector shown in the shell until the page's navigation column becomes available. */
  compactNavigation?: React.ReactNode;
  /** Commands rendered responsively in the sticky mobile and desktop shell lanes. */
  headerTools?: ResponsiveHeaderToolsProps;
  /** Rule-bound desktop controls rendered in the single shell command lane. */
  desktopTools?: DesktopHeaderToolsProps;
  /** Commands and query controls rendered in a wrapping card inside the page. */
  pageActions?: React.ReactNode;
  mobileActions?: React.ReactNode | false;
  mobileClassName?: string;
  frame?: PageFrame;
  nav?: React.ReactNode;
  navigationBreakpoint?: NavigationBreakpoint;
  navigationClassName?: string;
  children: React.ReactNode;
  className?: string;
  surfaceClassName?: string;
  contentClassName?: string;
}

export function PageLayout({
  title,
  icon,
  leading,
  compactNavigation,
  headerTools,
  desktopTools,
  pageActions,
  mobileActions,
  mobileClassName,
  frame = 'surface',
  nav,
  navigationBreakpoint = 'md',
  navigationClassName,
  children,
  className,
  surfaceClassName,
  contentClassName,
}: PageLayoutProps) {
  usePageHeader({
    title,
    icon,
    leading,
    compactNavigation,
    compactNavigationBreakpoint: navigationBreakpoint,
    headerTools,
    desktopTools,
  });

  const mobileBar =
    mobileActions && mobileActions !== false ? (
      <MobileControlsBar className={mobileClassName}>{mobileActions}</MobileControlsBar>
    ) : null;

  const desktopBar = pageActions ? (
    <PageActionsBar label={`${title} actions`}>{pageActions}</PageActionsBar>
  ) : null;

  if (frame === 'flush') {
    return (
      <>
        {mobileBar}
        {desktopBar ? (
          <div className="px-3 pt-4 sm:px-6 lg:px-8">{desktopBar}</div>
        ) : null}
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
        {desktopBar}
        {nav ? (
          <div
            className={cn(
              'flex flex-col',
              navigationBreakpoint === 'wide'
                ? 'gap-0 lg:flex-row lg:gap-8'
                : 'gap-6 md:flex-row md:gap-8',
              navigationClassName,
            )}
          >
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
