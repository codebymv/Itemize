// Import API interceptor first to ensure it's initialized before any API calls
import "@/lib/api";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { AISuggestProvider } from "@/context/AISuggestContext";

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

// Loading fallback component for lazy-loaded pages
const PageLoading = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
  </div>
);

import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";

const queryClient = new QueryClient();
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// Root redirect component to handle initial routing based on auth state
const RootRedirect = () => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
    </div>;
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
    location.pathname.startsWith('/shared/') ||
    location.pathname.startsWith('/help');

  return (
    <Routes>
      {/* Root path redirects based on authentication */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public routes with navbar/footer layout */}
      <Route path="/home" element={<PublicLayout><Home /></PublicLayout>} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/help/*" element={<PublicLayout><DocsPage /></PublicLayout>} />

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

      {/* Protected routes with sidebar layout */}
      <Route element={<ProtectedRoute />}>
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
        <Route path="/workspace" element={<AuthenticatedLayout><CanvasPage /></AuthenticatedLayout>} />
        <Route path="/workspace/contents" element={<AuthenticatedLayout><ContentsPage /></AuthenticatedLayout>} />
        <Route path="/workspace/shared" element={<AuthenticatedLayout><SharedPage /></AuthenticatedLayout>} />
        <Route path="/settings/*" element={<AuthenticatedLayout><SettingsPage /></AuthenticatedLayout>} />
        <Route path="/status" element={<AuthenticatedLayout><StatusPage /></AuthenticatedLayout>} />

        {/* Legacy routes - redirect to new paths */}
        <Route path="/canvas" element={<Navigate to="/workspace" replace />} />
        <Route path="/lists" element={<Navigate to="/workspace" replace />} />
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
          <AuthProvider>
            <AISuggestProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter
                future={{
                  v7_startTransition: true,
                  v7_relativeSplatPath: true
                }}
              >
                <ErrorBoundary>
                  <Suspense fallback={<PageLoading />}>
                    <AppContent />
                  </Suspense>
                </ErrorBoundary>
              </BrowserRouter>
            </AISuggestProvider>
          </AuthProvider>
        </GoogleOAuthProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
