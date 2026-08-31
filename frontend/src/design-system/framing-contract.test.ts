import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

const OVERVIEW_PAGES = [
  'pages/automations/AutomationsPage.tsx',
  'pages/calendars/CalendarsPage.tsx',
  'pages/campaigns/CampaignsPage.tsx',
  'pages/contacts/ContactsPage.tsx',
  'pages/email-templates/EmailTemplatesPage.tsx',
  'pages/forms/FormsPage.tsx',
  'pages/invoices/EstimatesPage.tsx',
  'pages/invoices/InvoicesPage.tsx',
  'pages/invoices/PaymentsPage.tsx',
  'pages/invoices/ProductsPage.tsx',
  'pages/invoices/RecurringInvoicesPage.tsx',
  'pages/pages/LandingPagesPage.tsx',
  'pages/reputation/ReputationPage.tsx',
  'pages/reputation/ReputationWidgetsPage.tsx',
  'pages/segments/SegmentsPage.tsx',
  'pages/signatures/SignaturesPage.tsx',
  'pages/signatures/SignatureTemplatesPage.tsx',
  'pages/sms-templates/SMSTemplatesPage.tsx',
] as const;

const DIRECT_CONTENT_PAGES = [
  'pages/calendars/CalendarSettingsPage.tsx',
  'pages/chat-widget/ChatWidgetPage.tsx',
  'pages/contacts/ContactDetailPage.tsx',
  'pages/email-templates/EmailTemplateEditorPage.tsx',
  'pages/forms/FormEditorPage.tsx',
  'pages/invoices/EstimateEditorPage.tsx',
  'pages/invoices/InvoiceEditorPage.tsx',
  'pages/pages/PageEditorPage.tsx',
  'pages/reputation/ReputationSettingsPage.tsx',
  'pages/reputation/ReputationWidgetEditorPage.tsx',
  'pages/segments/SegmentEditorPage.tsx',
  'pages/signatures/SignatureEditorPage.tsx',
  'pages/signatures/SignatureTemplateEditorPage.tsx',
  'pages/sms-templates/SMSTemplateEditorPage.tsx',
] as const;

describe('surface hierarchy contract', () => {
  it.each(OVERVIEW_PAGES)('%s frames its page-level summary', path => {
    const source = read(path);

    expect(source).toContain('@/components/ui/framed-section');
    expect(source).toContain('<FramedSection title="Overview"');
    expect(source).toContain('responsive-stat-summary mb-0');
  });

  it('keeps the dashboard north star on the same shared primitive', () => {
    const page = read('pages/DashboardPage.tsx');
    const overview = read('pages/dashboard/components/DashboardOverview.tsx');

    expect(page).toContain('<DashboardOverview');
    expect(page).not.toContain('title="Operations"');
    expect(overview).toContain('title="Overview"');
    expect(overview).toContain('contentSurface="inset"');
  });

  it('uses semantic frames for detail-page summaries', () => {
    expect(read('pages/campaigns/CampaignDetailPage.tsx'))
      .toContain('<FramedSection title="Performance"');
    expect(read('pages/signatures/SignatureEditorPage.tsx'))
      .toContain('<FramedSection title="Recipient status"');
  });

  it('keeps the campaign reference editor on framed sections with inset bodies', () => {
    const source = read('pages/campaigns/CampaignDetailPage.tsx');

    expect(source).toContain('title="Campaign setup"');
    expect(source).toContain('title="Email preview"');
    expect(source.match(/contentSurface="inset"/g)?.length).toBeGreaterThanOrEqual(10);
    expect(source).not.toContain('SectionCardTitle');
  });

  it.each(DIRECT_CONTENT_PAGES)('%s opts its direct section content into the inset surface', path => {
    expect(read(path)).toMatch(/(?:contentSurface|surface)="inset"/);
  });

  it('defines the inset body once in the shared card primitive', () => {
    const source = read('components/ui/card.tsx');

    expect(source).toContain('data-card-content-surface={surface}');
    expect(source).toContain('bg-[hsl(var(--background-alt))]');
  });
});
