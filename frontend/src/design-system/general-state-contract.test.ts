import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

const SOURCE_BACKED_PAGES = [
  'pages/DashboardPage.tsx',
  'pages/DocsPage.tsx',
  'pages/StatusPage.tsx',
  'pages/SettingsPage.tsx',
  'pages/settings/OrganizationSettings.tsx',
  'pages/UserHome.tsx',
  'pages/workspace/ContentsPage.tsx',
  'pages/workspace/SharedPage.tsx',
  'pages/contacts/ContactsPage.tsx',
  'pages/contacts/ContactDetailPage.tsx',
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
  'pages/campaigns/CampaignDetailPage.tsx',
  'pages/segments/SegmentsPage.tsx',
  'pages/email-templates/EmailTemplatesPage.tsx',
  'pages/email-templates/EmailTemplateEditorPage.tsx',
  'pages/sms-templates/SMSTemplatesPage.tsx',
  'pages/sms-templates/SMSTemplateEditorPage.tsx',
  'pages/pages/LandingPagesPage.tsx',
  'pages/pages/PageEditorPage.tsx',
  'pages/forms/FormsPage.tsx',
  'pages/forms/FormEditorPage.tsx',
  'pages/inbox/InboxPage.tsx',
  'pages/social/SocialPage.tsx',
  'pages/chat-widget/ChatWidgetPage.tsx',
  'pages/calendars/CalendarsPage.tsx',
  'pages/calendars/CalendarSettingsPage.tsx',
  'pages/bookings/BookingsPage.tsx',
  'pages/calendar-integrations/CalendarIntegrationsPage.tsx',
  'pages/reputation/ReputationPage.tsx',
  'pages/reputation/ReputationRequestsPage.tsx',
  'pages/reputation/ReputationWidgetsPage.tsx',
  'pages/reputation/ReputationWidgetEditorPage.tsx',
  'pages/reputation/ReputationSettingsPage.tsx',
  'pages/invoices/EstimateEditorPage.tsx',
  'pages/invoices/InvoiceEditorPage.tsx',
  'pages/segments/SegmentEditorPage.tsx',
  'pages/signatures/SignatureEditorPage.tsx',
  'pages/signatures/SignatureTemplateEditorPage.tsx',
  'pages/canvas.tsx',
  'pages/automations/WorkflowBuilderPage.tsx',
] as const;

const BUSY_EDITOR_PAGES = [
  'pages/SettingsPage.tsx',
  'pages/settings/OrganizationSettings.tsx',
  'pages/campaigns/CampaignDetailPage.tsx',
  'pages/automations/WorkflowBuilderPage.tsx',
  'pages/chat-widget/ChatWidgetPage.tsx',
  'pages/calendars/CalendarSettingsPage.tsx',
  'pages/pages/PageEditorPage.tsx',
  'pages/forms/FormEditorPage.tsx',
  'pages/reputation/ReputationWidgetEditorPage.tsx',
  'pages/reputation/ReputationSettingsPage.tsx',
  'pages/segments/SegmentEditorPage.tsx',
  'pages/sms-templates/SMSTemplateEditorPage.tsx',
  'pages/signatures/SignatureTemplateEditorPage.tsx',
  'pages/invoices/InvoiceEditorPage.tsx',
  'pages/invoices/EstimateEditorPage.tsx',
] as const;

describe('general-state contract', () => {
  it('defines one scoped, named, polite initial-loading primitive', () => {
    const source = read('components/LoadingState.tsx');

    expect(source).toContain("'page' | 'section' | 'inline'");
    expect(source).toContain('data-loading-state={kind}');
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-busy="true"');
    expect(read('components/ui/page-loading.tsx')).toContain('<LoadingState kind="page"');
  });

  it.each(SOURCE_BACKED_PAGES)('%s distinguishes acquisition from a failed source', (path) => {
    const source = read(path);

    expect(source).toMatch(/loading|isLoading|initialLoad|Skeleton|PageLoading/i);
    expect(source).toMatch(/ErrorState|OrganizationErrorState|FailureNotice/);
  });

  it.each(BUSY_EDITOR_PAGES)('%s marks its shell mutation action busy', (path) => {
    expect(read(path)).toMatch(/busy=\{/);
  });

  it('preserves the last trustworthy system status when a refresh fails', () => {
    const source = read('pages/StatusPage.tsx');

    expect(source).toContain('<FailureNotice');
    expect(source).toContain('<ErrorState');
    expect(source).not.toContain('setStatusData(null)');
  });

  it.each([
    'pages/forms/PublicFormPage.tsx',
    'pages/bookings/PublicBookingPage.tsx',
    'pages/invoices/PublicEstimatePage.tsx',
    'pages/invoices/PublicInvoicePaymentPage.tsx',
    'pages/sign/SignPage.tsx',
  ])('%s exposes a named load or busy mutation and an authored terminal state', (path) => {
    const source = read(path);

    expect(source).toMatch(/LoadingState|role="status"|busy/);
    expect(source).toContain('aria-busy');
    expect(source).toMatch(/unavailable|complete|completed|cancelled|declined|Submitted|paid|refunded/i);
  });

  it('keeps autosave states distinct and makes a failure assertive', () => {
    const source = read('components/ui/save-status.tsx');

    expect(source).toContain("'idle' | 'dirty' | 'saving' | 'saved' | 'error'");
    expect(source).toContain('data-save-state={state}');
    expect(source).toContain("state === 'error' ? 'assertive' : 'polite'");
    expect(source).toContain("state === 'saving' ? 'true' : undefined");
  });
});
