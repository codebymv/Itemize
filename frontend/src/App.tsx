// Import API interceptor first to ensure it's initialized before any API calls
import "@/lib/api";

import { DeferredToaster } from "@/components/DeferredToaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrganizationProvider } from '@/contexts/OrganizationContext';
import React, { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuthState } from "@/contexts/AuthContext";
import { AISuggestProvider } from "@/context/AISuggestContext";
import { SubscriptionProvider, useSubscriptionState } from "@/contexts/SubscriptionContext";
import { UpgradePromptCard } from "@/components/subscription/UpgradeCTA";
import { type Plan } from "@/lib/subscription";
import { hasPlanAccess } from "@/lib/entitlements";
import { initializeUserPreferences, preferredHomePath } from "@/lib/userPreferences";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import { HeaderProvider } from '@/contexts/HeaderContext';

// Layout components
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AppShell from "@/components/AppShell";
import { PublicPageHeader } from "@/components/layout/PublicPageHeader";

// Pages - Static imports for critical pages only
import NotFound from "./pages/NotFound";
// Marketing home is eager: lazy Home added a JS waterfall on /home (MixFade/FlashCore).
import Home from "./pages/Home";

// Auth pages — lazy so Google GSI (@react-oauth/google) stays off marketing Home
const Login = React.lazy(() => import("./pages/Login"));
const Register = React.lazy(() => import("./pages/Register"));
const VerifyEmail = React.lazy(() => import("./pages/VerifyEmail"));
const ForgotPassword = React.lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = React.lazy(() => import("./pages/ResetPassword"));

// Pages - Lazy loaded for code splitting (reduces initial bundle size)
const UserHome = React.lazy(() => import("./pages/UserHome"));
const DocsPage = React.lazy(() => import("./pages/DocsPage"));
const StatusPage = React.lazy(() => import("./pages/StatusPage"));
const TermsOfServicePage = React.lazy(() =>
  import("./pages/legal/LegalDocumentPage").then((m) => ({ default: m.TermsOfServicePage }))
);
const PrivacyPolicyPage = React.lazy(() =>
  import("./pages/legal/LegalDocumentPage").then((m) => ({ default: m.PrivacyPolicyPage }))
);
const SharedListPage = React.lazy(() => import("./pages/SharedListPage"));
const SharedNotePage = React.lazy(() => import("./pages/SharedNotePage"));
const SharedWhiteboardPage = React.lazy(() => import("./pages/SharedWhiteboardPage"));
const SharedWireframePage = React.lazy(() => import("./pages/SharedWireframePage"));
const SharedVaultPage = React.lazy(() => import("./pages/SharedVaultPage"));
const CanvasPage = React.lazy(() => import("./pages/canvas"));
const DashboardPage = React.lazy(() => import("./pages/DashboardPage"));
const SettingsPage = React.lazy(() => import("./pages/SettingsPage"));
const AdminPage = React.lazy(() => import("./pages/AdminPage"));
const ContactsPage = React.lazy(() => import("./pages/contacts/ContactsPage"));
const ContactDetailPage = React.lazy(() => import("./pages/contacts/ContactDetailPage"));
const PipelinesPage = React.lazy(() => import("./pages/pipelines/PipelinesPage"));
const AutomationsPage = React.lazy(() => import("./pages/automations").then(m => ({ default: m.AutomationsPage })));
const WorkflowBuilderPage = React.lazy(() => import("./pages/automations/WorkflowBuilderPage"));
const CalendarsPage = React.lazy(() => import("./pages/calendars/CalendarsPage"));
const CalendarSettingsPage = React.lazy(() => import("./pages/calendars/CalendarSettingsPage"));
const BookingsPage = React.lazy(() => import("./pages/bookings/BookingsPage"));
const FormsPage = React.lazy(() => import("./pages/forms/FormsPage"));
const FormEditorPage = React.lazy(() => import("./pages/forms/FormEditorPage"));
const PublicFormPage = React.lazy(() => import("./pages/forms/PublicFormPage"));
const InboxPage = React.lazy(() => import("./pages/inbox/InboxPage"));
const ContentsPage = React.lazy(() => import("./pages/workspace").then(m => ({ default: m.ContentsPage })));
const SharedPage = React.lazy(() => import("./pages/workspace").then(m => ({ default: m.SharedPage })));

// New pages for expanded navigation
const SegmentsPage = React.lazy(() => import("./pages/segments/SegmentsPage"));
const CampaignsPage = React.lazy(() => import("./pages/campaigns/CampaignsPage"));
const EmailTemplatesPage = React.lazy(() => import("./pages/email-templates/EmailTemplatesPage"));
const SMSTemplatesPage = React.lazy(() => import("./pages/sms-templates/SMSTemplatesPage"));
const LandingPagesPage = React.lazy(() => import("./pages/pages/LandingPagesPage"));
const PageEditorPage = React.lazy(() => import("./pages/pages/PageEditorPage"));
const PublicLandingPage = React.lazy(() => import("./pages/pages/PublicLandingPage"));
const ChatWidgetPage = React.lazy(() => import("./pages/chat-widget/ChatWidgetPage"));
const SocialPage = React.lazy(() => import("./pages/social/SocialPage"));
const ReputationPage = React.lazy(() => import("./pages/reputation/ReputationPage"));
const ReputationRequestsPage = React.lazy(() => import("./pages/reputation/ReputationRequestsPage"));
const ReputationWidgetsPage = React.lazy(() => import("./pages/reputation/ReputationWidgetsPage"));
const PublicReviewPage = React.lazy(() => import("./pages/reputation/PublicReviewPage"));
const InvoicesPage = React.lazy(() => import("./pages/invoices/InvoicesPage"));
const InvoiceEditorPage = React.lazy(() => import("./pages/invoices/InvoiceEditorPage"));
const EstimatesPage = React.lazy(() => import("./pages/invoices/EstimatesPage"));
const EstimateEditorPage = React.lazy(() => import("./pages/invoices/EstimateEditorPage"));
const PublicEstimatePage = React.lazy(() => import("./pages/invoices/PublicEstimatePage"));
const RecurringInvoicesPage = React.lazy(() => import("./pages/invoices/RecurringInvoicesPage"));
const PaymentsPage = React.lazy(() => import("./pages/invoices/PaymentsPage"));
const ProductsPage = React.lazy(() => import("./pages/invoices/ProductsPage"));
const SignaturesPage = React.lazy(() => import("./pages/signatures/SignaturesPage"));
const SignatureEditorPage = React.lazy(() => import("./pages/signatures/SignatureEditorPage"));
const SignatureTemplatesPage = React.lazy(() => import("./pages/signatures/SignatureTemplatesPage"));
const SignatureTemplateEditorPage = React.lazy(() => import("./pages/signatures/SignatureTemplateEditorPage"));
const SignPage = React.lazy(() => import("./pages/sign/SignPage"));

// Loading fallback component for lazy-loaded pages
import { PageLoading } from '@/components/ui/page-loading';

import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useSessionExpiration } from "@/hooks/useSessionExpiration";
import { DeferredCookieConsent } from "@/components/DeferredCookieConsent";

const MarketingChatLauncher = React.lazy(() => import("@/components/marketing/MarketingChatLauncher"));

function DeferredMarketingChat() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 5000);
    return () => window.clearTimeout(t);
  }, []);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <MarketingChatLauncher />
    </Suspense>
  );
}

const isProduction = import.meta.env.PROD;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry failed queries
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error && 'response' in error) {
          const status = (error as { response?: { status?: number } }).response?.status;
          if (status && status >= 400 && status < 500) {
            return false;
          }
        }
        // Max 3 retries for network/5xx errors
        return failureCount < 3;
      },
      
      // Retry delay (exponential backoff)
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // Cache for this long (5 minutes)
      staleTime: 5 * 60 * 1000,
      
      // Keep cache for 10 minutes after stale
      gcTime: 10 * 60 * 1000,
      
      // Refetch on component mount (use cache if available)
      refetchOnMount: 'always',
      
      // Refetch on window focus if data is stale (production only)
      refetchOnWindowFocus: isProduction ? false : true,
    },
    
    mutations: {
      // Retry mutations once if network error
      retry: 1,
      
      // Don't wait between retries for mutations
      retryDelay: 0,
    },
  },
});

// Subscription provider wrapper that gets auth state
const SubscriptionProviderWrapper = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthState();
  return <SubscriptionProvider isAuthenticated={isAuthenticated}>{children}</SubscriptionProvider>;
};

// Root redirect component to handle initial routing based on auth state
const RootRedirect = () => {
  const { currentUser, loading } = useAuthState();
  const { isLoading, isSubscribed } = useSubscriptionState();

  if (loading || (currentUser && isLoading)) {
    return <PageLoading className="min-h-screen" />;
  }

  return currentUser
    ? <Navigate to={preferredHomePath(isSubscribed)} replace />
    : <Navigate to="/home" replace />;
};

// Public layout with navbar and footer
const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <HeaderProvider>
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <PublicPageHeader />
        <main className="flex-grow flex flex-col">
          {children}
        </main>
        <Footer />
      </div>
    </HeaderProvider>
  );
};

// App shell layout for authenticated users (with sidebar)
const AuthenticatedLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <AppShell>
      {children}
    </AppShell>
  );
};

const EntitledRoute = ({ requiredPlan = 'starter' }: { requiredPlan?: Plan }) => {
  const { subscription, isLoading, isSubscribed, tierLevel, planName } = useSubscriptionState();

  if (isLoading) {
    return <PageLoading className="min-h-screen" />;
  }

  if (!subscription || !hasPlanAccess(isSubscribed, tierLevel, requiredPlan)) {
    return (
      <AuthenticatedLayout>
        <div className="mx-auto flex min-h-full w-full max-w-3xl items-center px-4 py-12 sm:px-6">
          <UpgradePromptCard
            requiredPlan={requiredPlan}
            currentPlan={(planName as Plan | null) ?? 'free'}
            title="Unlock Itemize business tools"
            description="Keep using your Free workspace, or upgrade to manage clients, documents, billing, communication, and delivery in one place."
            className="w-full bg-background"
          />
        </div>
      </AuthenticatedLayout>
    );
  }

  return <AuthenticatedLayout><Outlet /></AuthenticatedLayout>;
};

const AppOrPublicLayout = ({ children }: { children: React.ReactNode }) => {
  const { currentUser, loading } = useAuthState();
  if (loading) {
    return <PageLoading className="min-h-screen" />;
  }
  if (currentUser) {
    return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
  }
  return <PublicLayout>{children}</PublicLayout>;
};

const AppContent = () => {
  const location = useLocation();

  // Keep rel=canonical aligned with the active route (SEO on /home).
  useEffect(() => {
    const origin = "https://itemize.cloud";
    const path =
      location.pathname === "/" || location.pathname === ""
        ? "/home"
        : location.pathname;
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = `${origin}${path}`;
  }, [location.pathname]);

  const SignatureDocumentRedirect = () => {
    const { id } = useParams();
    return <Navigate to={id ? `/documents/${id}` : '/documents'} replace />;
  };

  const SignatureTemplateRedirect = () => {
    const { id } = useParams();
    return <Navigate to={id ? `/templates/${id}` : '/templates'} replace />;
  };

  const LegacyReviewRedirect = () => {
    const { token } = useParams();
    return <Navigate to={token ? `/review/${token}` : '/home'} replace />;
  };

  const LegacyIntegrationsRedirect = () => {
    const { search, hash } = useLocation();
    return <Navigate to={`/settings/integrations${search}${hash}`} replace />;
  };

  // Handle session expiration notifications
  useSessionExpiration();

  // Disable browser scroll restoration to prevent interference with manual scroll control
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in history) {
      const originalScrollRestoration = history.scrollRestoration;
      history.scrollRestoration = 'manual';

      return () => {
        history.scrollRestoration = originalScrollRestoration;
      };
    }
  }, []);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Determine if this is a public route (no sidebar)
  const publicRoutes = ['/home', '/status', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/legal/terms', '/legal/privacy'];
  const isPublicRoute = publicRoutes.includes(location.pathname) ||
    location.pathname.startsWith('/shared/') ||
    location.pathname.startsWith('/form/') ||
    location.pathname.startsWith('/p/') ||
    location.pathname.startsWith('/review/') ||
    location.pathname.startsWith('/r/');
  const { currentUser } = useAuthState();
  const marketingChatRoutes = ['/home'];
  const showMarketingChat =
    marketingChatRoutes.includes(location.pathname) ||
    ((location.pathname === '/status' || location.pathname.startsWith('/help')) && !currentUser);

  return (
    <>
    <Routes>
      {/* Root path redirects based on authentication */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public routes with navbar/footer layout */}
      <Route path="/home" element={<Home />} />
      <Route path="/status" element={<AppOrPublicLayout><StatusPage /></AppOrPublicLayout>} />
      <Route path="/legal/terms" element={<PublicLayout><TermsOfServicePage /></PublicLayout>} />
      <Route path="/legal/privacy" element={<PublicLayout><PrivacyPolicyPage /></PublicLayout>} />
      <Route path="/help/*" element={<AppOrPublicLayout><DocsPage /></AppOrPublicLayout>} />

      {/* Auth routes (standalone, no navbar/footer) */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Shared content routes (public, minimal layout) */}
      <Route path="/shared/list/:token" element={<SharedListPage />} />
      <Route path="/shared/note/:token" element={<SharedNotePage />} />
      <Route path="/shared/whiteboard/:token" element={<SharedWhiteboardPage />} />
      <Route path="/shared/wireframe/:token" element={<SharedWireframePage />} />
      <Route path="/shared/vault/:token" element={<SharedVaultPage />} />
      <Route path="/sign/:token" element={<SignPage />} />
      <Route path="/estimate/:token" element={<PublicEstimatePage />} />
      <Route path="/form/:identifier" element={<PublicFormPage />} />
      <Route path="/p/:slug" element={<PublicLandingPage />} />
      <Route path="/review/:token" element={<PublicReviewPage />} />
      <Route path="/r/:token" element={<LegacyReviewRedirect />} />

      {/* Protected routes with sidebar layout */}
      <Route element={<ProtectedRoute />}>
        {/* Workspace (Canvas, Contents, Shared) */}
        <Route path="/canvas" element={<AuthenticatedLayout><CanvasPage /></AuthenticatedLayout>} />
        <Route path="/lists" element={<AuthenticatedLayout><UserHome /></AuthenticatedLayout>} />
        <Route path="/contents" element={<AuthenticatedLayout><ContentsPage /></AuthenticatedLayout>} />
        <Route path="/shared-items" element={<AuthenticatedLayout><SharedPage /></AuthenticatedLayout>} />
        
        {/* Settings */}
        <Route path="/settings" element={<AuthenticatedLayout><SettingsPage /></AuthenticatedLayout>} />
        <Route path="/organization-settings" element={<AuthenticatedLayout><SettingsPage /></AuthenticatedLayout>} />
        <Route path="/preferences" element={<AuthenticatedLayout><SettingsPage /></AuthenticatedLayout>} />
        <Route path="/payment-settings" element={<AuthenticatedLayout><SettingsPage /></AuthenticatedLayout>} />
        <Route path="/calendar-integrations" element={<LegacyIntegrationsRedirect />} />
        <Route path="/admin/*" element={<AuthenticatedLayout><AdminPage /></AuthenticatedLayout>} />

        <Route element={<EntitledRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/contacts/:id" element={<ContactDetailPage />} />
          <Route path="/pipelines" element={<PipelinesPage />} />
          <Route path="/calendars" element={<CalendarsPage />} />
          <Route path="/calendars/:id" element={<CalendarSettingsPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/forms" element={<FormsPage />} />
          <Route path="/forms/:id" element={<FormEditorPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/automations" element={<AutomationsPage />} />
          <Route path="/automations/new" element={<WorkflowBuilderPage />} />
          <Route path="/automations/:id" element={<WorkflowBuilderPage />} />
          <Route path="/segments" element={<SegmentsPage />} />
          <Route path="/settings/integrations" element={<SettingsPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/email-templates" element={<EmailTemplatesPage />} />
          <Route path="/sms-templates" element={<SMSTemplatesPage />} />
          <Route path="/pages" element={<LandingPagesPage />} />
          <Route path="/pages/:id" element={<PageEditorPage />} />
          <Route path="/chat-widget" element={<ChatWidgetPage />} />
          <Route path="/reviews" element={<ReputationPage />} />
          <Route path="/review-requests" element={<ReputationRequestsPage />} />
          <Route path="/review-widgets" element={<ReputationWidgetsPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/new" element={<InvoiceEditorPage />} />
          <Route path="/invoices/:id" element={<InvoiceEditorPage />} />
          <Route path="/estimates" element={<EstimatesPage />} />
          <Route path="/estimates/new" element={<EstimateEditorPage />} />
          <Route path="/estimates/:id" element={<EstimateEditorPage />} />
          <Route path="/recurring-invoices" element={<RecurringInvoicesPage />} />
          <Route path="/invoices/payments" element={<PaymentsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/signatures/templates/:id" element={<SignatureTemplateRedirect />} />
          <Route path="/signatures/templates" element={<Navigate to="/templates" replace />} />
          <Route path="/signatures/new" element={<Navigate to="/documents/new" replace />} />
          <Route path="/signatures/:id" element={<SignatureDocumentRedirect />} />
          <Route path="/signatures" element={<Navigate to="/documents" replace />} />
          <Route path="/documents" element={<SignaturesPage />} />
          <Route path="/documents/new" element={<SignatureEditorPage />} />
          <Route path="/documents/:id" element={<SignatureEditorPage />} />
          <Route path="/templates" element={<SignatureTemplatesPage />} />
          <Route path="/templates/:id" element={<SignatureTemplateEditorPage />} />
        </Route>

        <Route element={<EntitledRoute requiredPlan="unlimited" />}>
          <Route path="/social" element={<SocialPage />} />
        </Route>
      </Route>

      {/* Catch-all route */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    {showMarketingChat && <DeferredMarketingChat />}
    </>
  );
};

const App = () => {
  useEffect(() => {
    initializeUserPreferences();
  }, []);

  // Enforce HTTPS in production
  useEffect(() => {
    if (import.meta.env.PROD) {
      if (window.location.protocol !== 'https:') {
        window.location.href = window.location.href.replace('http:', 'https:');
      }
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="theme"
          themes={['light', 'dark', 'system']}
        >
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true
            }}
          >
            <AuthProvider>
              <OrganizationProvider>
                <OnboardingProvider>
                  <SubscriptionProviderWrapper>
                    <AISuggestProvider>
                      <DeferredToaster />
                      <DeferredCookieConsent />
                      <ErrorBoundary>
                        <Suspense fallback={<PageLoading />}>
                          <AppContent />
                        </Suspense>
                      </ErrorBoundary>
                    </AISuggestProvider>
                  </SubscriptionProviderWrapper>
                </OnboardingProvider>
              </OrganizationProvider>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
