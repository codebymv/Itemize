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
});

describe('visual language: shared page chrome', () => {
  const INDEX_PAGES = [
    'pages/DashboardPage.tsx',
    'pages/workspace/ContentsPage.tsx',
    'pages/workspace/SharedPage.tsx',
    'pages/contacts/ContactsPage.tsx',
    'pages/pipelines/PipelinesPage.tsx',
    'pages/invoices/InvoicesPage.tsx',
    'pages/invoices/EstimatesPage.tsx',
    'pages/invoices/PaymentsPage.tsx',
    'pages/invoices/ProductsPage.tsx',
    'pages/signatures/SignaturesPage.tsx',
    'pages/automations/AutomationsPage.tsx',
    'pages/campaigns/CampaignsPage.tsx',
    'pages/segments/SegmentsPage.tsx',
    'pages/email-templates/EmailTemplatesPage.tsx',
    'pages/sms-templates/SMSTemplatesPage.tsx',
    'pages/pages/LandingPagesPage.tsx',
    'pages/forms/FormsPage.tsx',
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
  ];

  it.each(INDEX_PAGES)('%s renders through PageLayout', path => {
    expect(read(path)).toMatch(/from ['"]@\/components\/layout\/PageLayout['"]/);
  });

  it.each(DETAIL_PAGES)('%s uses the shared identity block', path => {
    expect(read(path)).toMatch(/from ['"]@\/components\/layout\/EntityDetailHeader['"]/);
  });

  it('keeps detail pages off hand-rolled identity blocks', () => {
    const HAND_ROLLED = /h-14 w-14 shrink-0 items-center justify-center rounded-full/;
    const offenders = DETAIL_PAGES.filter(path => HAND_ROLLED.test(read(path)));

    expect(offenders, 'use EntityDetailHeader instead of rebuilding its icon disc').toEqual([]);
  });
});
