import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

describe('failure-state contract', () => {
  it('keeps page, section, and inline failure scopes in the shared primitive', () => {
    const source = read('components/ErrorState.tsx');

    expect(source).toContain("'page' | 'section' | 'inline'");
    expect(source).toContain('data-error-state={kind}');
    expect(source).toContain('role="alert"');
    expect(source).toContain('aria-live="assertive"');
    expect(source).toContain("actionLabel = 'Try again'");
    expect(source).toContain('const actionHandler = onRetry ?? onAction');
  });

  it('uses one shared fatal fallback for component and route crashes', () => {
    expect(read('components/ErrorBoundary.tsx')).toContain('<FatalErrorState');
    expect(read('components/RouteErrorBoundary.tsx')).toContain('<FatalErrorState');
  });

  it('preserves trustworthy content with the shared non-blocking notice', () => {
    const source = read('components/FailureNotice.tsx');
    expect(source).toContain('data-failure-notice');
    expect(source).toContain('role="alert"');
    expect(read('components/GlobalSearch.tsx')).toContain('<FailureNotice');
  });

  it.each([
    'pages/contacts/ContactsPage.tsx',
    'pages/pipelines/PipelinesPage.tsx',
    'pages/invoices/InvoicesPage.tsx',
    'pages/invoices/PaymentsPage.tsx',
    'pages/automations/AutomationsPage.tsx',
    'pages/campaigns/CampaignsPage.tsx',
    'pages/forms/FormsPage.tsx',
    'pages/pages/LandingPagesPage.tsx',
    'pages/calendars/CalendarsPage.tsx',
    'pages/bookings/BookingsPage.tsx',
  ])('%s retries organization failures through the organization context', (path) => {
    expect(read(path)).toContain('<OrganizationErrorState');
  });

  it('keeps generated-preview failures inline and recoverable', () => {
    for (const path of [
      'pages/invoices/components/InvoiceEmailPreview.tsx',
      'pages/signatures/components/SignatureEmailPreview.tsx',
    ]) {
      const source = read(path);
      expect(source).toContain('kind="inline"');
      expect(source).toContain('onAction={() => void generatePreview()}');
      expect(source).toContain('<PreviewPlaceholder');
    }
  });

  it('does not turn dashboard query failures into zero-valued analytics', () => {
    const source = read('pages/DashboardPage.tsx');
    for (const error of [
      'analyticsError',
      'conversionsError',
      'communicationsError',
      'pipelineDealAgeError',
      'revenueError',
    ]) {
      expect(source).toContain(error);
    }
    expect(source).toContain('Dashboard data may be out of date');
  });

  it.each([
    'pages/reputation/ReputationPage.tsx',
    'pages/reputation/ReputationRequestsPage.tsx',
    'pages/reputation/ReputationWidgetsPage.tsx',
    'pages/admin/components/CommunicationsSection.tsx',
    'pages/admin/components/EmailLogsView.tsx',
    'components/PageVersionHistory.tsx',
    'pages/reputation/SendReviewRequestModal.tsx',
  ])('%s gives read failures precedence over empty collections', (path) => {
    const source = read(path);
    expect(source).toMatch(/loadError|LoadError/);
    expect(source).toContain('<ErrorState');
    expect(source.indexOf('<ErrorState')).toBeLessThan(source.lastIndexOf('<EmptyState'));
  });

  it.each([
    'pages/invoices/InvoicesPage.tsx',
    'pages/chat-widget/ChatWidgetPage.tsx',
    'pages/calendar-integrations/CalendarIntegrationsPage.tsx',
    'pages/admin/components/StatisticsSection.tsx',
    'components/subscription/BillingPanel.tsx',
  ])('%s keeps primary read failures persistent and retryable', (path) => {
    const source = read(path);
    expect(source).toContain('loadError');
    expect(source).toContain('<ErrorState');
    expect(source).toMatch(/onRetry=/);
  });

  it('does not label a failed pipeline query as an empty pipeline collection', () => {
    const source = read('pages/pipelines/PipelinesPage.tsx');
    expect(source.indexOf('pipelineWorkspaceError ?')).toBeLessThan(source.indexOf('pipelines.length === 0 ?'));
    expect(source).toContain('onRetry={() => void refetchPipelineWorkspace()}');
  });

  it.each([
    'pages/invoices/InvoicesPage.tsx',
    'pages/invoices/EstimatesPage.tsx',
    'pages/invoices/RecurringInvoicesPage.tsx',
    'pages/signatures/SignaturesPage.tsx',
    'pages/signatures/SignatureTemplatesPage.tsx',
  ])('%s keeps expanded preview failures open with an inline retry', (path) => {
    const source = read(path);
    expect(source).toContain('previewError');
    expect(source).toContain('kind="inline"');
    expect(source).toMatch(/onRetry=/);
  });
});
