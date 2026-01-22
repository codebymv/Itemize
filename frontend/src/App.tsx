// Import API interceptor first to ensure it's initialized before any API calls
import "@/lib/api";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect } from 'react';
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

// Pages
import Home from "./pages/Home";
import UserHome from "./pages/UserHome";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";
import DocsPage from "./pages/DocsPage";
import StatusPage from "./pages/StatusPage";
import SharedListPage from "./pages/SharedListPage";
import SharedNotePage from "./pages/SharedNotePage";
import SharedWhiteboardPage from "./pages/SharedWhiteboardPage";
import CanvasPage from "./pages/canvas";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";

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
  const publicRoutes = ['/home', '/auth/callback', '/status'];
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

      {/* Shared content routes (public, minimal layout) */}
      <Route path="/shared/list/:token" element={<SharedListPage />} />
      <Route path="/shared/note/:token" element={<SharedNotePage />} />
      <Route path="/shared/whiteboard/:token" element={<SharedWhiteboardPage />} />

      {/* Protected routes with sidebar layout */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<AuthenticatedLayout><DashboardPage /></AuthenticatedLayout>} />
        <Route path="/workspace" element={<AuthenticatedLayout><CanvasPage /></AuthenticatedLayout>} />
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
                  <AppContent />
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
