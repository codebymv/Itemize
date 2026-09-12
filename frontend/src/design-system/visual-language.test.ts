import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isBrandSurface } from './brand-surfaces';

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
  // The email body composer styles recipient content in the brand blues, not app status.
  const BRAND_PROSE = 'components/admin/RichTextEditor.tsx';
  // Reputation widget types are a categorical scale, not a status; see badge-utils.
  const CATEGORICAL = { path: 'lib/badge-utils.ts', colors: ['purple', 'pink'] };

  it('declares status pill classes in exactly one module', () => {
    const offenders = ALL_SOURCES.filter(file => {
      if (file.path === PALETTE_OWNER || file.path === BRAND_PROSE) return false;
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
    'ArchivePage',
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
    expect(entitlementGate).toContain('text-icon-accent');
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

  it('keeps dynamic app-shell icons on the theme accent', () => {
    const admin = read('pages/AdminPage.tsx');
    expect(admin).toContain('text-icon-accent');
    expect(admin).not.toContain('shrink-0 text-primary');
  });

  it('keeps page-shell icons on the theme accent, which already carries both modes', () => {
    [...INDEX_PAGES, ...DETAIL_PAGES, ...SPECIAL_APP_PAGES].forEach(path => {
      const pageLayoutIcons = [...read(path).matchAll(
        /<PageLayout[\s\S]{0,600}?icon=\{\s*<[^>]+className="([^"]+)"\s*\/>\s*\}/g,
      )];
      expect(pageLayoutIcons.length, `${path} must expose a concrete PageLayout icon`).toBeGreaterThan(0);
      pageLayoutIcons.forEach(match => {
        expect(match[1], `${path} PageLayout icon must read the theme accent token`)
          .toContain('text-icon-accent');
        expect(match[1], `${path} PageLayout icon must not restate a raw blue`)
          .not.toMatch(/text-blue-\d+/);
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

describe('visual language: theme colour', () => {
  /**
   * Product accents follow the user's theme colour (lib/themeColor.ts) by
   * reading tokens: bg-primary, text-icon-accent, ring-ring, bg-theme-tint.
   * Raw blue classes on application surfaces bypass that and stay blue on a
   * purple account. This baseline only moves down: lower it in the same
   * commit that removes a raw blue, and never raise it.
   */
  const RAW_BLUE_BASELINE = 0;
  const RAW_BLUE = /(?<![\w-])(?:[\w[\]=/.-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|divide|shadow|caret|accent|placeholder)-blue-\d{2,3}(?:\/\d{1,3})?(?![\w-])/g;

  const rawBlueByFile = ALL_SOURCES
    .filter(file => !isBrandSurface(file.path))
    .map(file => ({ path: file.path, count: (file.body.match(RAW_BLUE) ?? []).length }))
    .filter(file => file.count > 0)
    .sort((a, b) => b.count - a.count);
  const rawBlueCount = rawBlueByFile.reduce((sum, file) => sum + file.count, 0);

  it('ratchets raw blue classes on application surfaces down to the baseline', () => {
    const worst = rawBlueByFile.slice(0, 8).map(file => `${file.count}\t${file.path}`).join('\n');
    expect(rawBlueCount, `raw blue classes rose above the baseline; use theme tokens instead. Worst files:\n${worst}`)
      .toBeLessThanOrEqual(RAW_BLUE_BASELINE);
    expect(rawBlueCount, `raw blue classes fell to ${rawBlueCount}; lower RAW_BLUE_BASELINE to match so the ratchet holds`)
      .toBe(RAW_BLUE_BASELINE);
  });

  it('declares every theme hue as a token block per mode', () => {
    for (const hue of ['purple', 'pink']) {
      const light = INDEX_CSS.match(new RegExp(`\\[data-theme-color="${hue}"\\] \\{([^}]*)\\}`))?.[1] ?? '';
      const dark = INDEX_CSS.match(new RegExp(`\\.dark\\[data-theme-color="${hue}"\\] \\{([^}]*)\\}`))?.[1] ?? '';
      for (const token of ['--primary:', '--primary-hover:', '--ring:', '--icon-accent:', '--theme-tint:', '--card-accent-default:']) {
        expect(light, `${hue} light block declares ${token}`).toContain(token);
      }
      for (const token of ['--icon-accent:', '--theme-tint:']) {
        expect(dark, `${hue} dark block declares ${token}`).toContain(token);
      }
    }
    expect(INDEX_CSS).not.toMatch(/\[data-theme-color="(green|red|amber|orange|yellow|gray)"\]/);
  });

  it('exposes the theme tokens to Tailwind and stamps the theme before first paint', () => {
    const tailwind = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf8');
    expect(tailwind).toContain("'icon-accent': 'hsl(var(--icon-accent) / <alpha-value>)'");
    expect(tailwind).toContain("'theme-tint': 'hsl(var(--theme-tint) / <alpha-value>)'");
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain("localStorage.getItem('itemize:theme-color')");
    expect(html).toContain("root.setAttribute('data-theme-color', color)");
  });

  it('never hard-codes the two blue inks in the interaction layer', () => {
    expect(INDEX_CSS).not.toContain('rgb(37 99 235)');
    expect(INDEX_CSS).not.toContain('rgb(96 165 250)');
  });
});

describe('visual language: width decisions', () => {
  /**
   * Responsive decisions follow the available content width, sidebar
   * included, not the viewport (design-system/index.md, "Width decisions").
   * The sanctioned mechanisms are container queries (`@container` plus the
   * `@sm:`..`@2xl:` utilities), ResponsiveValue, ResponsiveHeaderTools, and
   * the single 768px shell handoff owned by hooks/use-mobile.tsx.
   *
   * Each baseline below only moves down: lower it in the same commit that
   * removes an offender, and never raise it. When it reaches zero the ratchet
   * is a hard ban.
   */
  const MARKETING = (path: string) =>
    path.startsWith('pages/home/') || path === 'pages/Index.tsx' || path === 'pages/Home.tsx';

  const ratchet = (
    label: string,
    baseline: number,
    pattern: RegExp,
    exclude: (path: string) => boolean,
  ) => {
    const byFile = ALL_SOURCES
      .filter(file => !exclude(file.path))
      .map(file => ({ path: file.path, count: (file.body.match(pattern) ?? []).length }))
      .filter(file => file.count > 0)
      .sort((a, b) => b.count - a.count);
    const total = byFile.reduce((sum, file) => sum + file.count, 0);
    const worst = byFile.slice(0, 8).map(file => `${file.count}\t${file.path}`).join('\n');
    expect(total, `${label} rose above the baseline. Worst files:\n${worst}`)
      .toBeLessThanOrEqual(baseline);
    expect(total, `${label} fell to ${total}; lower the baseline to match so the ratchet holds`)
      .toBe(baseline);
  };

  it('ratchets invented pixel breakpoints down to the baseline', () => {
    // min-[1100px] is "viewport minus sidebar" hand-tuned for one card. It
    // moves the wrong way when the sidebar collapses. Use @container on the
    // card and @md:/@lg: on its children instead.
    const ARBITRARY_BREAKPOINT_BASELINE = 50;
    ratchet(
      'invented pixel breakpoints',
      ARBITRARY_BREAKPOINT_BASELINE,
      /(?:min|max)-\[\d+px\]/g,
      MARKETING,
    );
  });

  it('ratchets viewport-hook layout branching down to the baseline', () => {
    // useIsMobile is the shell handoff and an input-modality hint. It is not
    // a layout switch for content: a table at 1000px with the sidebar open
    // has 744px, and a 767px tablet has more room than the hook admits.
    const VIEWPORT_HOOK_BASELINE = 7;
    const SHELL_AND_MODALITY: Record<string, string> = {
      'hooks/use-mobile.tsx': 'owns the 768px handoff',
      'components/ui/sidebar.tsx': 'the shell decides its own drawer/rail handoff',
      'components/layout/ResponsiveCardRail.tsx': 'rail-to-grid is the documented shell handoff',
      'pages/pipelines/components/KanbanBoard.tsx': 'native drag is disabled on touch; "Move to" is the documented alternative',
      'pages/canvas.tsx': 'documented flush-frame exception with its own viewport-height math',
    };
    ratchet(
      'viewport-hook layout branches',
      VIEWPORT_HOOK_BASELINE,
      /useIsMobile\(/g,
      path => path in SHELL_AND_MODALITY,
    );
  });

  it('ratchets direct viewport width reads down to the baseline', () => {
    // Floating layers clamp their own position to the viewport; everything
    // else measures its host (ResizeObserver, as ResponsiveValue does).
    const VIEWPORT_READ_BASELINE = 5;
    const FLOATING_LAYER_OR_DECOR: Record<string, string> = {
      'hooks/use-mobile.tsx': 'owns the 768px handoff',
      'components/Canvas/ContextMenu.tsx': 'clamps a floating menu inside the viewport',
      'components/NoteCard/noteMentionSuggestion.ts': 'clamps a floating suggestion list inside the viewport',
      'components/workspace/MentionInput.tsx': 'clamps a floating suggestion list inside the viewport',
      'components/ui/BackgroundClouds.tsx': 'decorative viewport-sized backdrop',
    };
    ratchet(
      'direct viewport width reads',
      VIEWPORT_READ_BASELINE,
      /window\.innerWidth|matchMedia\(\s*[`'"]\((?:min|max)-width/g,
      path => path in FLOATING_LAYER_OR_DECOR,
    );
  });

  it('keeps the container-query utilities available to every surface', () => {
    const tailwind = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf8');
    expect(tailwind).toContain('@tailwindcss/container-queries');
    expect(tailwind).toMatch(/plugins:\s*\[[^\]]*containerQueries/);
  });
});
