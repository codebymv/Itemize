import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the rules in ./index.md. These are the invariants that let a status
 * read the same on a list row, a stat card and a detail header — the kind that
 * decay silently, one convenient inline class at a time.
 */

// vitest runs from the frontend workspace root.
const SRC = join(process.cwd(), 'src');
const INDEX_CSS = readFileSync(join(SRC, 'index.css'), 'utf8');

const posix = (absolutePath: string) => relative(SRC, absolutePath).split(sep).join('/');

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === 'node_modules' ? [] : sourceFiles(full);
    }
    if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

const ALL_SOURCES = sourceFiles().map(file => ({ path: posix(file), body: readFileSync(file, 'utf8') }));

const read = (path: string) =>
  ALL_SOURCES.find(file => file.path === path)?.body ??
  (() => { throw new Error(`expected ${path} to exist`); })();

describe('visual language: one palette', () => {
  // bg-<c>-100 paired with text-<c>-800 is the status pill signature.
  const PILL = /bg-(blue|green|orange|red|gray|slate|yellow|sky|amber|purple|pink)-100[^"'`]*text-\1-800/;

  const PALETTE_OWNER = 'lib/statusVisuals.ts';
  // Reputation widget types are a categorical scale, not a status; see badge-utils.
  const CATEGORICAL = { path: 'lib/badge-utils.ts', colors: ['purple', 'pink'] };

  it('declares status pill classes in exactly one module', () => {
    const offenders = ALL_SOURCES.filter(file => {
      if (file.path === PALETTE_OWNER) return false;
      const matches: string[] = file.body.match(new RegExp(PILL, 'g')) ?? [];
      if (matches.length === 0) return false;
      if (file.path !== CATEGORICAL.path) return true;
      return !matches.every(match => CATEGORICAL.colors.some(color => match.includes(color)));
    });

    expect(
      offenders.map(file => file.path),
      'status colors must come from lib/statusVisuals (via defineStatus, STATUS_THEME_CLASSES or badge-utils), never an inline class',
    ).toEqual([]);
  });

  it('keeps every palette consumer deriving rather than restating', () => {
    ['hooks/useStatStyles.ts', 'lib/badge-utils.ts', 'design-system/design-tokens.ts'].forEach(path => {
      expect(read(path), `${path} must read the palette from lib/statusVisuals`)
        .toMatch(/STATUS_THEME_CLASSES/);
    });
  });

  it('does not reintroduce status colors as Badge variants', () => {
    const badge = read('components/ui/badge.tsx');
    ['success:', 'warning:', 'info:'].forEach(variant => {
      expect(badge, `Badge must not carry a ${variant} variant; pass a StatusVisual badgeClass`)
        .not.toContain(variant);
    });
  });

  it('keeps application badges from declaring ad hoc palette colors', () => {
    const INLINE_BADGE_COLOR = /<Badge\b[^>]*className=["'][^"']*(?:bg|border|text)-(?:blue|green|orange|red|gray|amber|yellow|sky|slate|purple|pink)-\d+/;
    const allowedPromotionalBadges = new Set(['components/subscription/PricingCards.tsx']);
    const offenders = ALL_SOURCES.filter(file => (
      !allowedPromotionalBadges.has(file.path) && INLINE_BADGE_COLOR.test(file.body)
    ));

    expect(
      offenders.map(file => file.path),
      'application badges must use semantic Badge variants or a declared StatusVisual',
    ).toEqual([]);
  });
});

describe('visual language: shared page chrome', () => {
  const INDEX_PAGES = [
    'pages/AdminPage.tsx',
    'pages/DashboardPage.tsx',
    'pages/SettingsPage.tsx',
    'pages/UserHome.tsx',
    'pages/workspace/ContentsPage.tsx',
    'pages/workspace/SharedPage.tsx',
    'pages/contacts/ContactsPage.tsx',
    'pages/pipelines/PipelinesPage.tsx',
    'pages/invoices/InvoicesPage.tsx',
    'pages/invoices/EstimatesPage.tsx',
    'pages/invoices/PaymentsPage.tsx',
    'pages/invoices/ProductsPage.tsx',
    'pages/invoices/RecurringInvoicesPage.tsx',
    'pages/signatures/SignaturesPage.tsx',
    'pages/signatures/SignatureTemplatesPage.tsx',
    'pages/automations/AutomationsPage.tsx',
    'pages/campaigns/CampaignsPage.tsx',
    'pages/segments/SegmentsPage.tsx',
    'pages/email-templates/EmailTemplatesPage.tsx',
    'pages/sms-templates/SMSTemplatesPage.tsx',
    'pages/pages/LandingPagesPage.tsx',
    'pages/forms/FormsPage.tsx',
    'pages/inbox/InboxPage.tsx',
    'pages/chat-widget/ChatWidgetPage.tsx',
    'pages/social/SocialPage.tsx',
    'pages/calendars/CalendarsPage.tsx',
    'pages/bookings/BookingsPage.tsx',
    'pages/reputation/ReputationPage.tsx',
    'pages/reputation/ReputationRequestsPage.tsx',
    'pages/reputation/ReputationWidgetsPage.tsx',
    'pages/reputation/ReputationSettingsPage.tsx',
  ];

  /**
   * Routed entity pages. WorkflowBuilderPage is deliberately absent: it is a
   * full-bleed builder on frame="flush" with viewport-height math and no
   * identity block, closer to the canvas pages than to a detail page.
   */
  const DETAIL_PAGES = [
    'pages/campaigns/CampaignDetailPage.tsx',
    'pages/contacts/ContactDetailPage.tsx',
    'pages/email-templates/EmailTemplateEditorPage.tsx',
    'pages/forms/FormEditorPage.tsx',
    'pages/invoices/EstimateEditorPage.tsx',
    'pages/invoices/InvoiceEditorPage.tsx',
    'pages/pages/PageEditorPage.tsx',
    'pages/segments/SegmentEditorPage.tsx',
    'pages/signatures/SignatureEditorPage.tsx',
    'pages/signatures/SignatureTemplateEditorPage.tsx',
    'pages/sms-templates/SMSTemplateEditorPage.tsx',
    'pages/calendars/CalendarSettingsPage.tsx',
    'pages/reputation/ReputationWidgetEditorPage.tsx',
  ];

  const SPECIAL_APP_PAGES = [
    'pages/DocsPage.tsx',
    'pages/StatusPage.tsx',
    'pages/canvas.tsx',
    'pages/automations/WorkflowBuilderPage.tsx',
  ];

  const PROTECTED_ROUTE_COMPONENTS = [
    'AdminPage',
    'AutomationsPage',
    'BookingsPage',
    'CalendarSettingsPage',
    'CalendarsPage',
    'CampaignDetailPage',
    'CampaignsPage',
    'CanvasPage',
    'ChatWidgetPage',
    'ContactDetailPage',
    'ContactsPage',
    'ContentsPage',
    'DashboardPage',
    'EmailTemplateEditorPage',
    'EmailTemplatesPage',
    'EstimateEditorPage',
    'EstimatesPage',
    'FormEditorPage',
    'FormsPage',
    'InboxPage',
    'InvoiceEditorPage',
    'InvoicesPage',
    'LandingPagesPage',
    'PageEditorPage',
    'PaymentsPage',
    'PipelinesPage',
    'ProductsPage',
    'RecurringInvoicesPage',
    'ReputationPage',
    'ReputationRequestsPage',
    'ReputationSettingsPage',
    'ReputationWidgetEditorPage',
    'ReputationWidgetsPage',
    'SegmentEditorPage',
    'SegmentsPage',
    'SettingsPage',
    'SharedPage',
    'SignatureEditorPage',
    'SignatureTemplateEditorPage',
    'SignatureTemplatesPage',
    'SignaturesPage',
    'SMSTemplateEditorPage',
    'SMSTemplatesPage',
    'SocialPage',
    'UserHome',
    'WorkflowBuilderPage',
  ].sort();

  it.each([...INDEX_PAGES, ...DETAIL_PAGES, ...SPECIAL_APP_PAGES])('%s renders through PageLayout', path => {
    expect(read(path)).toMatch(/from ['"]@\/components\/layout\/PageLayout['"]/);
  });

  it('enrolls every protected application route in the page-layout contract', () => {
    const app = read('App.tsx');
    const protectedRoutes = app.slice(
      app.indexOf('{/* Protected routes with sidebar layout */}'),
      app.indexOf('{/* Catch-all route */}'),
    );
    const routedComponents = [...protectedRoutes.matchAll(
      /<Route\s+path="[^"]+"\s+element=\{(?:<AuthenticatedLayout>)?<([A-Z][A-Za-z0-9]+)/g,
    )]
      .map(match => match[1])
      .filter(name => name !== 'Navigate' && !name.endsWith('Redirect'));

    expect([...new Set(routedComponents)].sort()).toEqual(PROTECTED_ROUTE_COMPONENTS);
  });

  it('keeps plan-gated routes inside the shared shell identity contract', () => {
    const app = read('App.tsx');
    const entitlementGate = app.slice(app.indexOf('const EntitledRoute'), app.indexOf('const AppOrPublicLayout'));
    expect(entitlementGate).toContain('<PageLayout title="UPGRADE"');
    expect(entitlementGate).toContain('text-blue-600 dark:text-blue-400');
  });

  it.each(DETAIL_PAGES)('%s uses the shared identity block', path => {
    expect(read(path)).toMatch(/from ['"]@\/components\/layout\/EntityDetailHeader['"]/);
  });

  it('keeps detail pages off hand-rolled identity blocks', () => {
    const HAND_ROLLED = /h-14 w-14 shrink-0 items-center justify-center rounded-full/;
    const offenders = DETAIL_PAGES.filter(path => HAND_ROLLED.test(read(path)));

    expect(offenders, 'use EntityDetailHeader instead of rebuilding its icon disc').toEqual([]);
  });

  it('keeps Scheduling sibling routes in the sidebar instead of duplicating them in the shell', () => {
    expect(read('pages/calendars/CalendarsPage.tsx')).not.toMatch(/modeNavigation|compactNavigation/);
    expect(read('pages/bookings/BookingsPage.tsx')).not.toMatch(/modeNavigation|compactNavigation/);
    expect(read('pages/calendars/CalendarsPage.tsx')).toContain('title="CALENDARS"');
    expect(read('pages/bookings/BookingsPage.tsx')).toContain('title="BOOKINGS"');
  });

  it('keeps the public booking links backed by a real public route', () => {
    expect(read('App.tsx')).toContain('path="/book/:identifier"');
    expect(read('pages/bookings/PublicBookingPage.tsx')).toContain('getAvailableSlots');
    expect(read('pages/bookings/PublicBookingPage.tsx')).toContain('submitPublicBooking');
  });

  it('keeps configurable services on the shared in-app preview surface', () => {
    expect(read('pages/chat-widget/ChatWidgetPreview.tsx'))
      .toContain('@/components/preview/LiveServicePreview');
    expect(read('pages/calendars/CalendarBookingPreview.tsx'))
      .toContain('@/components/preview/LiveServicePreview');
    expect(read('pages/reputation/components/ReputationWidgetPreview.tsx'))
      .toContain('@/components/preview/LiveServicePreview');
  });

  it('keeps saved availability controls on the shared settings row', () => {
    [
      'pages/chat-widget/ChatWidgetPage.tsx',
      'pages/calendars/CalendarSettingsPage.tsx',
      'pages/email-templates/EmailTemplateEditorPage.tsx',
      'pages/sms-templates/SMSTemplateEditorPage.tsx',
      'pages/segments/SegmentEditorPage.tsx',
      'pages/invoices/ProductsPage.tsx',
      'pages/reputation/ReputationWidgetEditorPage.tsx',
      'pages/reputation/ReputationSettingsPage.tsx',
    ].forEach(path => {
      expect(read(path), `${path} must use AvailabilitySettingRow`)
        .toContain('AvailabilitySettingRow');
    });
  });

  it('does not put an immediate automation lifecycle switch inside a clickable list row', () => {
    expect(read('pages/automations/AutomationsPage.tsx')).not.toContain("@/components/ui/switch");
    expect(read('pages/automations/AutomationsPage.tsx')).toContain('Activate automation');
    expect(read('pages/automations/AutomationsPage.tsx')).toContain('Deactivate automation');
  });

  it('keeps persisted service status separate from unsaved availability controls', () => {
    expect(read('pages/chat-widget/ChatWidgetPage.tsx'))
      .toContain('getCommunicationAvailabilityVisual(persistedIsActive)');
    expect(read('pages/chat-widget/ChatWidgetPage.tsx'))
      .not.toContain('getCommunicationAvailabilityVisual(config.is_active)');
    expect(read('pages/calendars/CalendarSettingsPage.tsx'))
      .toContain('getCalendarStatusVisual(calendar.is_active)');
    expect(read('pages/calendars/CalendarBookingPreview.tsx'))
      .toContain('config.liveIsActive');
  });

  it('keeps page identity owned by PageLayout rather than page-level header contexts', () => {
    const offenders = ALL_SOURCES.filter(file => file.path.startsWith('pages/') && (
      file.body.includes('@/contexts/HeaderContext') ||
      file.body.includes('@/hooks/usePageHeader') ||
      file.body.includes('setHeaderContent')
    ));

    expect(offenders.map(file => file.path)).toEqual([]);
  });

  it('keeps every StatCard summary inside ResponsiveCardRail', () => {
    const offenders = ALL_SOURCES.filter(file => (
      file.path.startsWith('pages/') &&
      file.body.includes('<StatCard') &&
      !file.body.includes('<ResponsiveCardRail')
    ));

    expect(offenders.map(file => file.path)).toEqual([]);
  });

  it('keeps mobile query controls at a 44px minimum touch target', () => {
    const mobileQueryBar = read('components/layout/MobileQueryBar.tsx');
    const responsiveHeaderTools = read('components/layout/DesktopHeaderTools.tsx');
    expect(mobileQueryBar).toContain('[&_button]:min-h-11');
    expect(mobileQueryBar).toContain('[&_input]:min-h-11');
    expect(responsiveHeaderTools).toContain('data-mobile-header-tools');
    expect(INDEX_CSS).toMatch(/\.desktop-header-tools--responsive button[\s\S]{0,160}min-height: 2\.75rem/);
    expect(INDEX_CSS).toMatch(/\.desktop-header-tools--responsive button[\s\S]{0,240}min-width: 2\.75rem/);
  });

  it('keeps navigation and refresh utilities out of the primary-action hierarchy', () => {
    const dashboard = read('pages/DashboardPage.tsx');
    const status = read('pages/StatusPage.tsx');

    expect(dashboard).toMatch(/secondaryAction:\s*<HeaderAction prominence="secondary" label="Canvas"/);
    expect(dashboard).not.toMatch(/primaryAction:\s*<HeaderAction[^>]*label="Canvas"/);
    expect(status).toContain('secondaryAction: renderHeaderRefreshAction()');
    expect(status).not.toContain('primaryAction: renderHeaderRefreshAction()');
  });

  it('keeps sole create commands in the primary-action slot', () => {
    const reputationSettings = read('pages/reputation/ReputationSettingsPage.tsx');
    expect(reputationSettings).toMatch(/primaryAction:\s*mode === 'platforms'/);
    expect(reputationSettings).toContain('label="Add platform"');
    expect(reputationSettings).not.toContain('secondaryAction: mode === \'platforms\'');
  });

  it('keeps routed list queries in one responsive typed command declaration', () => {
    const lists = read('pages/UserHome.tsx');
    expect(lists).toContain('HeaderSearch');
    expect(lists).toContain('HeaderAction');
    expect(lists).toContain('headerTools=');
    expect(lists).not.toContain('MobileQueryBar');
    expect(lists).not.toContain('pageActions=');

    const offenders = ALL_SOURCES.filter(file => (
      file.path.startsWith('pages/') &&
      !file.path.includes('/components/') &&
      file.body.includes('HeaderSearch') &&
      !file.body.includes('headerTools=')
    ));
    expect(offenders.map(file => file.path)).toEqual([]);
  });

  it('keeps page commands on the unified responsive shell contract', () => {
    const legacyProps = ALL_SOURCES.filter(file => (
      file.path.startsWith('pages/') &&
      (
        file.body.includes('desktopTools=') ||
        file.body.includes('mobileActions=') ||
        file.body.includes('mobileClassName=')
      )
    ));
    expect(legacyProps.map(file => file.path)).toEqual([]);

    expect(read('components/layout/PageLayout.tsx')).toContain('headerTools?: ResponsiveHeaderToolsProps');
    expect(read('hooks/usePageHeader.tsx')).toContain('<ResponsiveHeaderTools {...headerTools} />');
  });

  it('keeps dynamic app-shell icons on the shared blue accent', () => {
    const admin = read('pages/AdminPage.tsx');
    expect(admin).toContain('text-blue-600 dark:text-blue-400');
    expect(admin).not.toContain('shrink-0 text-primary');
  });

  it('keeps page-shell icons legible in both themes', () => {
    [...INDEX_PAGES, ...DETAIL_PAGES, ...SPECIAL_APP_PAGES].forEach(path => {
      const pageLayoutIcons = [...read(path).matchAll(
        /<PageLayout[\s\S]{0,600}?icon=\{<[^>]+className="([^"]+)"\s*\/>\}/g,
      )];
      expect(pageLayoutIcons.length, `${path} must expose a concrete PageLayout icon`).toBeGreaterThan(0);
      pageLayoutIcons.forEach(match => {
        expect(match[1], `${path} PageLayout icon must use the shared light-theme accent`)
          .toContain('text-blue-600');
        expect(match[1], `${path} PageLayout icon must use the shared dark-theme accent`)
          .toContain('dark:text-blue-400');
      });
    });
  });

  it('keeps the mobile shell identity row on one 48px rhythm with touch controls', () => {
    const shell = read('components/AppShell.tsx');
    expect(shell).toContain('row-start-2 flex min-h-12');
    expect(shell).toContain('px-4 py-0.5');
    expect(shell).not.toContain('px-4 py-2 md:order-1');
    expect(shell).toContain('grid-cols-[auto_minmax(0,1fr)_auto]');
    expect(shell).toContain('src="/textblack.png"');
    expect(shell).toContain('src="/textwhite.png"');

    const heading = read('components/layout/ResponsivePageHeading.tsx');
    expect(heading).toContain('inline-flex h-11 w-11');
    expect(read('components/layout/pageHeaderLayout.ts')).toContain('whitespace-normal break-words');
  });

  it('hands mobile controls to desktop tools at one shared 768px breakpoint', () => {
    expect(read('hooks/use-mobile.tsx')).toContain('const MOBILE_BREAKPOINT = 768');
    expect(read('components/MobileControlsBar.tsx')).toContain('md:hidden');
    expect(read('components/AppShell.tsx')).toContain('md:hidden');
    expect(INDEX_CSS).toMatch(/@media \(min-width: 768px\) \{\s*\.desktop-header-tools \{\s*display: block;/);
    expect(INDEX_CSS).toContain('.desktop-header-tools--responsive');
  });

  it('keeps legacy body-level mobile command rows out of application pages', () => {
    const mobileQueryBars = ALL_SOURCES.filter(file => (
      file.path.startsWith('pages/') && file.body.includes('MobileQueryBar')
    ));
    expect(mobileQueryBars.map(file => file.path)).toEqual([]);
  });

  it('keeps Canvas on the same responsive shell query contract as routed lists', () => {
    const canvas = read('pages/canvas.tsx');
    const toolbar = read('pages/canvas/components/CanvasToolbar.tsx');
    expect(canvas).toContain('headerTools={createCanvasHeaderTools');
    expect(canvas).not.toContain('MobileQueryBar');
    expect(toolbar).toContain('HeaderCombinedQuery');
    expect(toolbar).toContain('data-canvas-add-button');
  });

  it('keeps module identity icons aligned between the sidebar and representative section headings', () => {
    const sidebar = read('components/AppSidebar.tsx');
    const modules = [
      { title: 'Dashboard', icon: 'LayoutDashboard', page: 'pages/DashboardPage.tsx' },
      { title: 'Workspace', icon: 'Map', page: 'pages/canvas.tsx' },
      { title: 'Contacts', icon: 'Users', page: 'pages/contacts/ContactsPage.tsx' },
      { title: 'Pipelines', icon: 'Kanban', page: 'pages/pipelines/PipelinesPage.tsx' },
      { title: 'Sales & Payments', icon: 'Receipt', page: 'pages/invoices/InvoicesPage.tsx' },
      { title: 'Documents', icon: 'FileSignature', page: 'pages/signatures/SignaturesPage.tsx' },
      { title: 'Automations', icon: 'Zap', page: 'pages/automations/AutomationsPage.tsx' },
      { title: 'Campaigns', icon: 'Megaphone', page: 'pages/campaigns/CampaignsPage.tsx' },
      { title: 'Pages & Forms', icon: 'Layout', page: 'pages/pages/LandingPagesPage.tsx' },
      { title: 'Communications', icon: 'MessageSquare', page: 'pages/inbox/InboxPage.tsx' },
      { title: 'Scheduling', icon: 'CalendarDays', page: 'pages/calendars/CalendarsPage.tsx' },
      { title: 'Reputation', icon: 'Star', page: 'pages/reputation/ReputationPage.tsx' },
    ];

    modules.forEach(({ title, icon, page }) => {
      expect(sidebar, `${title} must keep its declared module icon`)
        .toMatch(new RegExp(`title: '${title.replace('&', '\\&')}'[\\s\\S]{0,80}icon: ${icon}`));
      expect(read(page), `${page} must echo the ${title} module icon in its shell heading`)
        .toContain(`icon={<${icon}`);
    });
  });

  it('uses semantic neutral tokens in shell navigation and summary chrome', () => {
    const semanticChrome = [
      'pages/admin/components/AdminNav.tsx',
      'pages/SettingsPage.tsx',
      'pages/inbox/InboxPage.tsx',
      'pages/DashboardPage.tsx',
      'pages/automations/WorkflowBuilderPage.tsx',
    ];
    const RAW_NEUTRAL = /(?:text|bg|border)-(?:gray|slate)-\d+/;

    semanticChrome.forEach(path => {
      const source = read(path)
        // React Flow handles are diagram primitives, not application chrome.
        .replace(/<Handle[^>]*className="[^"]*"[^>]*\/>/g, '');
      expect(source, `${path} must use semantic theme tokens for neutral application chrome`)
        .not.toMatch(RAW_NEUTRAL);
    });
  });

  it('shares branded chrome across public transaction surfaces while preserving authored canvases', () => {
    [
      'pages/bookings/PublicBookingPage.tsx',
      'pages/invoices/PublicEstimatePage.tsx',
      'pages/invoices/PublicInvoicePaymentPage.tsx',
      'pages/reputation/PublicReviewPage.tsx',
      'pages/sign/SignPage.tsx',
    ].forEach(path => {
      expect(read(path), `${path} must render through BrandedPublicPage`)
        .toContain('BrandedPublicPage');
    });

    expect(read('components/SharedContentLayout.tsx')).toContain('BrandedPublicPage');
    expect(read('pages/pages/PublicLandingPage.tsx')).toContain('buildLandingPageDocument');
    expect(read('pages/pages/PublicLandingPage.tsx')).toContain('<iframe');
    expect(read('pages/forms/PublicFormPage.tsx')).toContain('form.theme?.primaryColor');
  });
});
