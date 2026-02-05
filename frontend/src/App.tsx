// Import API interceptor first to ensure it's initialized before any API calls
import "@/lib/api";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuthState } from "@/contexts/AuthContext";
import { AISuggestProvider } from "@/context/AISuggestContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { OnboardingProvider } from "@/contexts/OnboardingContext";

// Layout components
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AppShell from "@/components/AppShell";

// Pages - Static imports for critical/frequently used pages
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";

// Auth pages - Static imports for fast loading
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

// Pages - Lazy loaded for code splitting (reduces initial bundle size)
const UserHome = React.lazy(() => import("./pages/UserHome"));
const DocsPage = React.lazy(() => import("./pages/DocsPage"));
const StatusPage = React.lazy(() => import("./pages/StatusPage"));
const SharedListPage = React.lazy(() => import("./pages/SharedListPage"));
const SharedNotePage = React.lazy(() => import("./pages/SharedNotePage"));
const SharedWhiteboardPage = React.lazy(() => import("./pages/SharedWhiteboardPage"));
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
const BookingsPage = React.lazy(() => import("./pages/bookings/BookingsPage"));
const FormsPage = React.lazy(() => import("./pages/forms/FormsPage"));
const InboxPage = React.lazy(() => import("./pages/inbox/InboxPage"));
const ContentsPage = React.lazy(() => import("./pages/workspace").then(m => ({ default: m.ContentsPage })));
const SharedPage = React.lazy(() => import("./pages/workspace").then(m => ({ default: m.SharedPage })));

// New pages for expanded navigation
const SegmentsPage = React.lazy(() => import("./pages/segments/SegmentsPage"));
const CalendarIntegrationsPage = React.lazy(() => import("./pages/calendar-integrations/CalendarIntegrationsPage"));
const CampaignsPage = React.lazy(() => import("./pages/campaigns/CampaignsPage"));
const EmailTemplatesPage = React.lazy(() => import("./pages/email-templates/EmailTemplatesPage"));
const SMSTemplatesPage = React.lazy(() => import("./pages/sms-templates/SMSTemplatesPage"));
const LandingPagesPage = React.lazy(() => import("./pages/pages/LandingPagesPage"));
const PageEditorPage = React.lazy(() => import("./pages/pages/PageEditorPage"));
const ChatWidgetPage = React.lazy(() => import("./pages/chat-widget/ChatWidgetPage"));
const SocialPage = React.lazy(() => import("./pages/social/SocialPage"));
const ReputationPage = React.lazy(() => import("./pages/reputation/ReputationPage"));
const ReputationRequestsPage = React.lazy(() => import("./pages/reputation/ReputationRequestsPage"));
const ReputationWidgetsPage = React.lazy(() => import("./pages/reputation/ReputationWidgetsPage"));
const InvoicesPage = React.lazy(() => import("./pages/invoices/InvoicesPage"));
const InvoiceEditorPage = React.lazy(() => import("./pages/invoices/InvoiceEditorPage"));
const EstimatesPage = React.lazy(() => import("./pages/invoices/EstimatesPage"));
const EstimateEditorPage = React.lazy(() => import("./pages/invoices/EstimateEditorPage"));
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
import { CookieConsent } from "@/components/CookieConsent";

const queryClient = new QueryClient();
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// Subscription provider wrapper that gets auth state
const SubscriptionProviderWrapper = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthState();
  return <SubscriptionProvider isAuthenticated={isAuthenticated}>{children}</SubscriptionProvider>;
};

// Root redirect component to handle initial routing based on auth state
const RootRedirect = () => {
  const { currentUser, loading } = useAuthState();

  if (loading) {
    return <PageLoading className="min-h-screen" />;
  }

  // Redirect to dashboard when authenticated
  return currentUser ? <Navigate to="/dashboard" replace /> : <Navigate to="/home" replace />;
};

// Public layout with navbar and footer
const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-grow flex flex-col">
        {children}
      </main>
      <Footer />
    </div>
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

const AppContent = () => {
  const location = useLocation();

  const SignatureDocumentRedirect = () => {
    const { id } = useParams();
    return <Navigate to={id ? `/documents/${id}` : '/documents'} replace />;
  };

  const SignatureTemplateRedirect = () => {
    const { id } = useParams();
    return <Navigate to={id ? `/templates/${id}` : '/templates'} replace />;
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
  const publicRoutes = ['/home', '/auth/callback', '/status', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password'];
  const isPublicRoute = publicRoutes.includes(location.pathname) ||
    location.pathname.startsWith('/shared/');

  return (
    <Routes>
      {/* Root path redirects based on authentication */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public routes with navbar/footer layout */}
      <Route path="/home" element={<PublicLayout><Home /></PublicLayout>} />
      <Route path="/auth/callback" element={<AuthCallback />} />

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
      <Route path="/shared/vault/:token" element={<SharedVaultPage />} />
      <Route path="/sign/:token" element={<SignPage />} />

      {/* Protected routes with sidebar layout */}
      <Route element={<ProtectedRoute />}>
        <Route path="/help/*" element={<AuthenticatedLayout><DocsPage /></AuthenticatedLayout>} />
        <Route path="/dashboard" element={<AuthenticatedLayout><DashboardPage /></AuthenticatedLayout>} />
        <Route path="/contacts" element={<AuthenticatedLayout><ContactsPage /></AuthenticatedLayout>} />
        <Route path="/contacts/:id" element={<AuthenticatedLayout><ContactDetailPage /></AuthenticatedLayout>} />
        <Route path="/pipelines" element={<AuthenticatedLayout><PipelinesPage /></AuthenticatedLayout>} />
        <Route path="/calendars" element={<AuthenticatedLayout><CalendarsPage /></AuthenticatedLayout>} />
        <Route path="/bookings" element={<AuthenticatedLayout><BookingsPage /></AuthenticatedLayout>} />
        <Route path="/forms" element={<AuthenticatedLayout><FormsPage /></AuthenticatedLayout>} />
        <Route path="/inbox" element={<AuthenticatedLayout><InboxPage /></AuthenticatedLayout>} />
        <Route path="/automations" element={<AuthenticatedLayout><AutomationsPage /></AuthenticatedLayout>} />
        <Route path="/automations/new" element={<AuthenticatedLayout><WorkflowBuilderPage /></AuthenticatedLayout>} />
        <Route path="/automations/:id" element={<AuthenticatedLayout><WorkflowBuilderPage /></AuthenticatedLayout>} />
        
        {/* Workspace (Canvas, Contents, Shared) */}
        <Route path="/canvas" element={<AuthenticatedLayout><CanvasPage /></AuthenticatedLayout>} />
        <Route path="/contents" element={<AuthenticatedLayout><ContentsPage /></AuthenticatedLayout>} />
        <Route path="/shared-items" element={<AuthenticatedLayout><SharedPage /></AuthenticatedLayout>} />
        
        {/* Settings */}
        <Route path="/settings" element={<AuthenticatedLayout><SettingsPage /></AuthenticatedLayout>} />
        <Route path="/preferences" element={<AuthenticatedLayout><SettingsPage /></AuthenticatedLayout>} />
        <Route path="/payment-settings" element={<AuthenticatedLayout><SettingsPage /></AuthenticatedLayout>} />
        <Route path="/admin/*" element={<AuthenticatedLayout><AdminPage /></AuthenticatedLayout>} />
        <Route path="/status" element={<AuthenticatedLayout><StatusPage /></AuthenticatedLayout>} />

        {/* Segments */}
        <Route path="/segments" element={<AuthenticatedLayout><SegmentsPage /></AuthenticatedLayout>} />

        {/* Calendar Integrations */}
        <Route path="/calendar-integrations" element={<AuthenticatedLayout><CalendarIntegrationsPage /></AuthenticatedLayout>} />

        {/* Campaigns & Templates */}
        <Route path="/campaigns" element={<AuthenticatedLayout><CampaignsPage /></AuthenticatedLayout>} />
        <Route path="/email-templates" element={<AuthenticatedLayout><EmailTemplatesPage /></AuthenticatedLayout>} />
        <Route path="/sms-templates" element={<AuthenticatedLayout><SMSTemplatesPage /></AuthenticatedLayout>} />

        {/* Landing Pages */}
        <Route path="/pages" element={<AuthenticatedLayout><LandingPagesPage /></AuthenticatedLayout>} />
        <Route path="/pages/:id" element={<AuthenticatedLayout><PageEditorPage /></AuthenticatedLayout>} />

        {/* Communications */}
        <Route path="/chat-widget" element={<AuthenticatedLayout><ChatWidgetPage /></AuthenticatedLayout>} />
        <Route path="/social" element={<AuthenticatedLayout><SocialPage /></AuthenticatedLayout>} />

        {/* Reputation Management */}
        <Route path="/reviews" element={<AuthenticatedLayout><ReputationPage /></AuthenticatedLayout>} />
        <Route path="/review-requests" element={<AuthenticatedLayout><ReputationRequestsPage /></AuthenticatedLayout>} />
        <Route path="/review-widgets" element={<AuthenticatedLayout><ReputationWidgetsPage /></AuthenticatedLayout>} />

        {/* Sales & Payments */}
        <Route path="/invoices" element={<AuthenticatedLayout><InvoicesPage /></AuthenticatedLayout>} />
        <Route path="/invoices/new" element={<AuthenticatedLayout><InvoiceEditorPage /></AuthenticatedLayout>} />
        <Route path="/invoices/:id" element={<AuthenticatedLayout><InvoiceEditorPage /></AuthenticatedLayout>} />
        <Route path="/estimates" element={<AuthenticatedLayout><EstimatesPage /></AuthenticatedLayout>} />
        <Route path="/estimates/new" element={<AuthenticatedLayout><EstimateEditorPage /></AuthenticatedLayout>} />
        <Route path="/estimates/:id" element={<AuthenticatedLayout><EstimateEditorPage /></AuthenticatedLayout>} />
        <Route path="/recurring-invoices" element={<AuthenticatedLayout><RecurringInvoicesPage /></AuthenticatedLayout>} />
        <Route path="/invoices/payments" element={<AuthenticatedLayout><PaymentsPage /></AuthenticatedLayout>} />
        <Route path="/products" element={<AuthenticatedLayout><ProductsPage /></AuthenticatedLayout>} />
        <Route path="/signatures/templates/:id" element={<SignatureTemplateRedirect />} />
        <Route path="/signatures/templates" element={<Navigate to="/templates" replace />} />
        <Route path="/signatures/new" element={<Navigate to="/documents/new" replace />} />
        <Route path="/signatures/:id" element={<SignatureDocumentRedirect />} />
        <Route path="/signatures" element={<Navigate to="/documents" replace />} />
        <Route path="/documents" element={<AuthenticatedLayout><SignaturesPage /></AuthenticatedLayout>} />
        <Route path="/documents/new" element={<AuthenticatedLayout><SignatureEditorPage /></AuthenticatedLayout>} />
        <Route path="/documents/:id" element={<AuthenticatedLayout><SignatureEditorPage /></AuthenticatedLayout>} />
        <Route path="/templates" element={<AuthenticatedLayout><SignatureTemplatesPage /></AuthenticatedLayout>} />
        <Route path="/templates/:id" element={<AuthenticatedLayout><SignatureTemplateEditorPage /></AuthenticatedLayout>} />
      </Route>

      {/* Catch-all route */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        themes={['light', 'dark']}
      >
        <GoogleOAuthProvider clientId={googleClientId}>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true
            }}
          >
            <AuthProvider>
              <OnboardingProvider>
                <SubscriptionProviderWrapper>
                  <AISuggestProvider>
                    <Toaster />
                    <CookieConsent />
                    <ErrorBoundary>
                      <Suspense fallback={<PageLoading />}>
                        <AppContent />
                      </Suspense>
                    </ErrorBoundary>
                  </AISuggestProvider>
                </SubscriptionProviderWrapper>
              </OnboardingProvider>
            </AuthProvider>
          </BrowserRouter>
        </GoogleOAuthProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
