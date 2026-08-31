import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

describe('fetching contract', () => {
  it('uses one cancellable dashboard route read model', () => {
    const hook = read('pages/dashboard/hooks/useDashboardData.ts');
    const service = read('services/analyticsGraphql.ts');

    expect(hook.match(/useQuery\(/g)).toHaveLength(1);
    expect(hook).toContain("['dashboard-snapshot', organizationId, period]");
    expect(hook).toContain('queryFn: ({ signal })');
    expect(service).toContain('query DashboardSnapshot(');
    expect(service).toContain('dashboardAnalytics');
    expect(service).toContain('conversionRates');
    expect(service).toContain('communicationStats');
    expect(service).toContain('pipelineDealAge');
    expect(service).toContain('revenueFlow');
  });

  it('uses one cancellable primary pipeline workspace read model', () => {
    const page = read('pages/pipelines/PipelinesPage.tsx');
    const service = read('services/pipelinesGraphql.ts');

    expect(page).toContain("['pipeline-workspace', organizationId, selectedPipelineId]");
    expect(page).toContain('queryFn: ({ signal })');
    expect(page).toContain('getPipelineWorkspace(');
    expect(service).toContain('query PipelineWorkspace(');
    expect(service).toContain('pipelineWorkspace(selectedPipelineId: $selectedPipelineId)');
    expect(service).toContain("pipelineWorkspaceCapability: 'unknown' | 'aggregate' | 'separate'");
  });

  it('uses one cancellable bootstrap read per sales document editor', () => {
    const invoiceEditor = read('pages/invoices/InvoiceEditorPage.tsx');
    const estimateEditor = read('pages/invoices/EstimateEditorPage.tsx');
    const service = read('services/salesDocumentEditorGraphql.ts');

    expect(invoiceEditor).toContain("['invoice-editor-bootstrap', organizationId, invoiceId]");
    expect(invoiceEditor).toContain('queryFn: ({ signal })');
    expect(invoiceEditor).toContain('getInvoiceEditorBootstrapViaGraphql(');
    expect(invoiceEditor.indexOf('const bootstrapQuery = useQuery({'))
      .toBeLessThan(invoiceEditor.indexOf('// Auto-resize textareas when content loads'));
    expect(estimateEditor).toContain("'estimate-editor-bootstrap',");
    expect(estimateEditor).toContain('queryFn: ({ signal })');
    expect(estimateEditor).toContain('getEstimateEditorBootstrapViaGraphql(');
    expect(service).toContain('query InvoiceEditorBootstrap(');
    expect(service).toContain('query EstimateEditorBootstrap(');
    expect(service).toContain('resetSalesDocumentEditorCapabilities');
  });

  it('uses one cancellable contact-detail route read model', () => {
    const page = read('pages/contacts/ContactDetailPage.tsx');
    const service = read('services/contactsGraphql.ts');

    expect(page).toContain("'contact-detail',");
    expect(page).toContain('queryFn: ({ signal })');
    expect(page).toContain('getContactDetailBootstrap(');
    expect(page).not.toContain('Promise.all([');
    expect(service).toContain('query ContactDetailBootstrap(');
    expect(service).toContain('contactActivities(contactId: $contactId');
    expect(service).toContain('contactContent(contactId: $contactId)');
  });

  it('uses one campaign editor bootstrap plus independently paginated recipients', () => {
    const page = read('pages/campaigns/CampaignDetailPage.tsx');
    const service = read('services/campaignEditorGraphql.ts');

    expect(page).toContain('campaignQueryKeys.bootstrap(organizationId, validCampaignId)');
    expect(page).toContain('getCampaignEditorBootstrapViaGraphql(');
    expect(page).toContain('queryFn: ({ signal })');
    expect(page).not.toContain('const loadCampaign = useCallback');
    expect(page).toContain('campaignQueryKeys.recipients(organizationId, campaign?.id ?? null)');
    expect(service).toContain('query CampaignEditorBootstrap(');
    expect(service).toContain("let capability: Capability = 'unknown'");
    expect(service).toContain('resetCampaignEditorCapability');
  });

  it('keeps recurring-invoice support data lazy and consolidates expanded previews', () => {
    const page = read('pages/invoices/RecurringInvoicesPage.tsx');
    const service = read('services/recurringInvoicePreviewGraphql.ts');

    expect(page).toContain("['recurring-invoices', organizationId, 'all']");
    expect(page).toContain("['recurring-invoice-preview', organizationId, expandedId]");
    expect(page).toContain('queryFn: ({ signal })');
    expect(page).toContain('enabled: Boolean(organizationId) && dialogOpen');
    expect(page).not.toContain('getProducts(');
    expect(page).not.toContain('const fetchRecurringInvoices = useCallback');
    expect(service).toContain('query RecurringInvoicePreviewBootstrap(');
    expect(service).toContain("let capability: Capability = 'unknown'");
    expect(service).toContain('resetRecurringInvoicePreviewCapability');
  });

  it('uses cancellable aggregate reads for both signature editors', () => {
    const documentEditor = read('pages/signatures/SignatureEditorPage.tsx');
    const templateList = read('pages/signatures/SignatureTemplatesPage.tsx');
    const templateEditor = read('pages/signatures/SignatureTemplateEditorPage.tsx');
    const service = read('services/signaturesGraphql.ts');
    const keys = read('services/signatureQueryKeys.ts');

    expect(documentEditor).toContain('signatureQueryKeys.document(organizationId, documentId)');
    expect(documentEditor).toContain('queryFn: ({ signal })');
    expect(documentEditor).not.toContain('const loadDocument = useCallback');
    expect(documentEditor).not.toContain('await loadDocument()');
    expect(templateList).toContain('signatureQueryKeys.templates(organizationId)');
    expect(templateList).toContain('signatureQueryKeys.template(organizationId, expandedTemplateId)');
    expect(templateList.match(/queryFn: \(\{ signal \}\)/g)).toHaveLength(2);
    expect(templateList).not.toContain('const fetchTemplates = useCallback');
    expect(templateList).not.toContain('loadExpandedTemplate');
    expect(templateEditor).toContain('signatureQueryKeys.template(organizationId, templateId)');
    expect(templateEditor).toContain('signatureQueryKeys.templates(organizationId)');
    expect(templateEditor).toContain('queryFn: ({ signal })');
    expect(templateEditor).not.toContain('const loadTemplate = useCallback');
    expect(service).toContain('query SignatureDocumentRead($id:Int!)');
    expect(service).toContain('query SignatureTemplateRead($id:Int!)');
    expect(service).toContain('resetSignatureReliabilityCapabilities');
    expect(keys).toContain("['signature-templates', organizationId]");
    expect(keys).toContain("'signature-template-editor'");
  });

  it('uses one cancellable integration-overview read without false disconnected fallbacks', () => {
    const page = read('pages/calendar-integrations/CalendarIntegrationsPage.tsx');
    const service = read('services/integrationOverviewGraphql.ts');

    expect(page).toContain("['integration-overview', organizationId]");
    expect(page).toContain('queryFn: ({ signal })');
    expect(page).not.toContain('const fetchStatus = useCallback');
    expect(page).not.toContain('getChannels({}, organizationId).catch');
    expect(page).toContain("? 'unavailable'");
    expect(service).toContain('query IntegrationOverview');
    expect(service).toContain("let capability: Capability = 'unknown'");
    expect(service).toContain('resetIntegrationOverviewCapability');
  });

  it('uses one cancellable reputation-configuration bootstrap', () => {
    const page = read('pages/reputation/ReputationSettingsPage.tsx');
    const service = read('services/reputationConfigurationGraphql.ts');

    expect(page).toContain("['reputation-configuration', organizationId]");
    expect(page).toContain('queryFn: ({ signal })');
    expect(page).not.toContain('const load = useCallback');
    expect(page).not.toContain('Promise.all([getPlatforms');
    expect(service).toContain('query ReputationConfigurationBootstrap');
    expect(service).toContain("let bootstrapCapability: BootstrapCapability = 'unknown'");
    expect(service).toContain('resetReputationConfigurationBootstrapCapability');
  });

  it('keeps reputation analytics, filtered reviews, and widget editor support independently owned', () => {
    const reviews = read('pages/reputation/ReputationPage.tsx');
    const requests = read('pages/reputation/ReputationRequestsPage.tsx');
    const widgets = read('pages/reputation/ReputationWidgetsPage.tsx');
    const editor = read('pages/reputation/ReputationWidgetEditorPage.tsx');
    const configuration = read('services/reputationConfigurationGraphql.ts');

    expect(reviews).toContain("['reputation-reviews', organizationId, ratingFilter]");
    expect(reviews).toContain("['reputation-analytics', organizationId, 30]");
    expect(reviews.match(/queryFn: \(\{ signal \}\)/g)).toHaveLength(2);
    expect(reviews).not.toContain('Promise.all([');
    expect(requests).toContain("['reputation-requests', organizationId, statusFilter]");
    expect(requests).toContain('queryFn: ({ signal })');
    expect(requests).not.toContain('const fetchRequests = useCallback');
    expect(widgets).toContain("['reputation-widgets', organizationId]");
    expect(widgets).toContain('queryFn: ({ signal })');
    expect(editor).toContain('["reputation-widget", organizationId, widgetId]');
    expect(editor).toContain('["reputation-widget-preview-reviews", organizationId]');
    expect(editor).toContain('["reputation-widget-embed-code", organizationId, widget?.id]');
    expect(editor).toContain('enabled: mode === "install"');
    expect(editor).not.toContain('getReviewWidgets(');
    expect(configuration).toContain('query ReputationWidget($id:Int!)');
    expect(configuration).toContain("let widgetDetailCapability: WidgetDetailCapability = 'unknown'");
    expect(configuration).toContain('resetReputationWidgetDetailCapability');
  });

  it('uses one cancellable workspace-content snapshot across contents and shared', () => {
    const hook = read('pages/workspace/hooks/useWorkspaceContent.ts');
    const canvas = read('pages/canvas.tsx');
    const service = read('services/workspaceContentSnapshotGraphql.ts');

    expect(hook).toContain("['workspace-content-snapshot', scopeKey ?? 'authenticated']");
    expect(hook).toContain('queryFn: ({ signal })');
    expect(hook).not.toContain('Promise.all([');
    expect(hook).not.toContain('useEffect(');
    expect(canvas).toContain('useCanvasData(currentUser?.uid)');
    expect(service).toContain('query WorkspaceContentSnapshot');
    expect(service).toContain('workspaceLists(page: $page)');
    expect(service).toContain('workspaceNotes(page: $page)');
    expect(service).toContain('workspaceWhiteboards(page: $page)');
    expect(service).toContain('workspaceWireframes(page: $page)');
    expect(service).toContain('workspaceVaults(page: $page)');
  });

  it('shares bounded template catalogs across lists and email composition', () => {
    const emailList = read('pages/email-templates/EmailTemplatesPage.tsx');
    const emailEditor = read('pages/email-templates/EmailTemplateEditorPage.tsx');
    const smsList = read('pages/sms-templates/SMSTemplatesPage.tsx');
    const smsEditor = read('pages/sms-templates/SMSTemplateEditorPage.tsx');
    const keys = read('services/templateCatalogQueryKeys.ts');

    expect(emailList).toContain('templateCatalogQueryKeys.emailPage(organizationId');
    expect(emailList).toContain('queryFn: ({ signal })');
    expect(emailList).not.toContain('const fetchTemplates = useCallback');
    expect(emailList).not.toContain('requestRef');
    expect(smsList).toContain('templateCatalogQueryKeys.sms(organizationId)');
    expect(smsList).toContain('queryFn: ({ signal })');
    expect(smsList).not.toContain('const fetchTemplates = useCallback');
    expect(smsList).not.toContain('requestRef');
    expect(emailEditor).toContain('OrganizationEmailTemplateBrowserDialog');
    const emailPicker = read('components/email/OrganizationEmailTemplateBrowserDialog.tsx');
    expect(emailPicker).toContain('useInfiniteQuery');
    expect(emailPicker).toContain('enabled: open');
    expect(emailPicker).toContain('queryFn: ({ pageParam, signal })');
    expect(smsEditor).toContain('templateCatalogQueryKeys.sms(organizationId)');
    expect(keys).toContain("['email-templates', organizationId]");
    expect(keys).toContain("['sms-templates', organizationId]");
  });

  it('uses one shared segment catalog and one cancellable editor bootstrap', () => {
    const list = read('pages/segments/SegmentsPage.tsx');
    const editor = read('pages/segments/SegmentEditorPage.tsx');
    const service = read('services/segmentsGraphql.ts');
    const keys = read('services/segmentQueryKeys.ts');

    expect(list).toContain('segmentQueryKeys.page(organizationId');
    expect(list).toContain('queryFn: ({ signal })');
    expect(list).not.toContain('const fetchSegments = useCallback');
    expect(list).not.toContain('requestRef');
    expect(editor).toContain('segmentQueryKeys.editor(organizationId, validSegmentId)');
    expect(editor).toContain('queryFn: ({ signal })');
    expect(editor).toContain('getSegmentEditorBootstrapViaGraphql(');
    expect(editor).not.toContain('Promise.all([');
    expect(service).toContain('query SegmentEditorBootstrap($segmentId: Int!)');
    expect(service).toContain('segmentFilterOptions');
    expect(keys).toContain("['segment-catalog', organizationId]");
    expect(keys).toContain("'segment-editor-bootstrap'");
  });

  it('allows fresh route and shell data to survive remounts', () => {
    const app = read('App.tsx');

    expect(app).toContain('refetchOnMount: true');
    expect(app).not.toContain("refetchOnMount: 'always'");
    expect(app).toContain('retry: shouldRetryQuery');
    expect(app).toContain('retry: false');
  });

  it('hydrates providers on scope boundaries rather than every private path', () => {
    const auth = read('contexts/AuthContext.tsx');
    const onboarding = read('contexts/OnboardingContext.tsx');
    const subscription = read('contexts/SubscriptionContext.tsx');
    const bootstrap = read('services/organizationBootstrapGraphql.ts');

    expect(auth).toContain('}, [skipSessionHydration]);');
    expect(auth).not.toContain('}, [location.pathname]);');
    expect(onboarding).toContain('useOrganizationBootstrap(bootstrapEnabled)');
    expect(onboarding).toContain('organizationBootstrapQueryKey(organizationId)');
    expect(subscription).toContain('useOrganizationBootstrap(bootstrapEnabled)');
    expect(bootstrap).toContain('query OrganizationBootstrap');
    expect(bootstrap).toContain("bootstrapCapability: 'unknown' | 'aggregate' | 'separate'");
  });

  it('never interprets an entitlement transport failure as a Free plan', () => {
    const app = read('App.tsx');

    expect(app).toContain('error && !subscription');
    expect(app).toContain('Unable to verify account access');
    expect(app).toContain('void refreshSubscription()');
  });

  it('supports cancellation and visibility-aware polling', () => {
    const graphql = read('services/graphqlClient.ts');
    const notifications = read('components/notifications/NotificationCenter.tsx');
    const policy = read('lib/queryPolicy.ts');

    expect(graphql).toContain('signal?: AbortSignal');
    expect(graphql).toContain('signal,');
    expect(notifications).toContain('visibleRefetchInterval(60_000)');
    expect(notifications).toContain('refetchIntervalInBackground: false');
    expect(policy).toContain("'NOT_FOUND'");
    expect(policy).toContain('PERMANENT_GRAPHQL_CODES.has(code)');
  });

  it('documents route ownership, cancellation, retries, and invalidation', () => {
    const docs = read('design-system/index.md');

    expect(docs).toContain('## Data fetching');
    expect(docs).toContain('one critical read model');
    expect(docs).toContain("React Query's `AbortSignal`");
    expect(docs).toContain('not retry by default because sends');
    expect(docs).toContain('invalidate only derived snapshots');
  });
});
